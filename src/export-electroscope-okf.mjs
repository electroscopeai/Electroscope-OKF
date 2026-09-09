import path from 'node:path';
import { ElectroscopeMcpClient } from './lib/mcp-client.mjs';
import { normalizeBundle, writeBundle } from './lib/okf-bundle.mjs';
import { assertOkfDefinitionCompatible, buildDealPeopleById, collectCursorResults, collectSearchResults } from './lib/exporter.mjs';

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) continue;
    args[part.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : 'true';
  }
  return args;
};

const required = (value, label) => {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
};

const args = parseArgs(process.argv.slice(2));
const baseUrl = required(args['base-url'], 'base-url');
const mcpToken = required(args['mcp-token'], 'mcp-token');
const scope = args.scope === 'team' ? 'team' : 'tenant';
const limit = Number(args.limit ?? 25);
const outDir = path.resolve(args.out ?? `./bundles/${args['tenant-slug'] ?? 'electroscope'}`);
const meetingStartAt = args['meeting-start-at'];
const meetingEndAt = args['meeting-end-at'];
const teamId = args['team-id'];
const meetingArguments = [meetingStartAt, meetingEndAt, teamId];

if (meetingArguments.some(Boolean) && meetingArguments.some((value) => !value)) {
  throw new Error('team-id, meeting-start-at, and meeting-end-at must be provided together.');
}
if (meetingStartAt && (Number.isNaN(Date.parse(meetingStartAt)) || Number.isNaN(Date.parse(meetingEndAt)) || Date.parse(meetingEndAt) <= Date.parse(meetingStartAt))) {
  throw new Error('meeting-end-at must be after meeting-start-at and both values must be ISO-8601 timestamps.');
}

const client = new ElectroscopeMcpClient({ baseUrl, bearerToken: mcpToken });
const okfDefinitionResult = await client.callTool('get_okf_definition', {});
const okfContract = assertOkfDefinitionCompatible(okfDefinitionResult.structuredContent);
const exportedAt = new Date().toISOString();

const statusResult = await client.callTool('get_status', { scope });
const clients = await collectSearchResults({
  client,
  toolName: 'search_clients',
  scope,
  query: args['client-query'] ?? '',
  limit,
});
const deals = await collectSearchResults({
  client,
  toolName: 'search_deals',
  scope,
  query: args['deal-query'] ?? '',
  limit,
});
const people = await collectSearchResults({
  client,
  toolName: 'search_people',
  scope,
  query: args['person-query'] ?? '',
  limit,
});

const [personalMeetings, teamMeetings] = meetingStartAt
  ? await Promise.all([
      collectCursorResults({
        client,
        toolName: 'list_my_calendar_events',
        resultKey: 'events',
        idKey: 'calendar_event_id',
        arguments: { start_at: meetingStartAt, end_at: meetingEndAt },
        limit,
      }),
      collectCursorResults({
        client,
        toolName: 'list_team_shared_meetings',
        resultKey: 'meetings',
        idKey: 'team_shared_meeting_id',
        arguments: { team_id: teamId, start_at: meetingStartAt, end_at: meetingEndAt },
        limit,
      }),
    ])
  : [[], []];

const detailedClients = await Promise.all(clients.map(async (clientRow) => {
  const detail = await client.callTool('get_client', { clientId: clientRow.id });
  return detail.structuredContent;
}));

const detailedDeals = await Promise.all(deals.map(async (dealRow) => {
  const detail = await client.callTool('get_deal', { dealId: dealRow.id });
  return detail.structuredContent;
}));

const detailedPeople = await Promise.all(people.map(async (personRow) => {
  const detail = await client.callTool('get_person', { personId: personRow.id });
  return detail.structuredContent;
}));

const teamsResult = await client.callTool('search_teams', { query: '' });
const teams = Array.isArray(teamsResult.structuredContent?.teams)
  ? teamsResult.structuredContent.teams
    .filter((team) => team && typeof team.id === 'string' && typeof team.name === 'string')
    .map((team) => ({ id: team.id, name: team.name }))
  : [];

const dealPeopleById = buildDealPeopleById(detailedPeople);

// Client meeting tools are already tenant- and team-scoped by MCP. The exporter
// retains only their documented projections and follows bounded opaque cursors.
const clientMeetingExports = await Promise.all(detailedClients.map(async (clientDetail) => {
  const clientId = clientDetail.id;
  const timeline = await collectCursorResults({
    client,
    toolName: 'list_client_meeting_timeline',
    resultKey: 'meetings',
    idKey: 'canonical_meeting_id',
    arguments: { clientId },
    limit,
  });
  const summaries = await Promise.all(timeline
    .filter((meeting) => meeting.canonical_summary_available === true)
    .map(async (meeting) => (await client.callTool('get_past_client_meeting_summary', {
      clientId,
      canonicalMeetingId: meeting.canonical_meeting_id,
    })).structuredContent));
  const upcomingMeetings = await collectCursorResults({
    client,
    toolName: 'list_client_upcoming_meetings',
    resultKey: 'upcoming_meetings',
    idKey: 'upcoming_meeting_id',
    arguments: { clientId },
    limit,
  });
  const preparationResult = await client.callTool('get_client_meeting_preparation', { clientId });
  return {
    canonicalMeetings: summaries.map((summary) => ({ ...summary, client_id: clientId })),
    upcomingClientMeetings: upcomingMeetings.map((meeting) => ({ ...meeting, client_id: clientId })),
    meetingPreparations: preparationResult.structuredContent?.preparation
      ? [{ ...preparationResult.structuredContent, client_id: clientId }]
      : [],
  };
}));

const [dealWorkspaces, clientWorkspaces, teamActionItemIndexes] = await Promise.all([
  Promise.all(detailedDeals.map(async (deal) => {
    const result = await client.callTool('get_deal_workspace', { dealId: deal.id });
    const workspace = result.structuredContent ?? {};
    return {
      deal: { id: workspace.deal?.id, name: workspace.deal?.name, stage: workspace.deal?.stage ? { id: workspace.deal.stage.id, name: workspace.deal.stage.name, order: workspace.deal.stage.order } : null },
      milestones: Array.isArray(workspace.milestones) ? workspace.milestones.map((item) => ({ provenance: item?.provenance ?? null })) : [],
      risks: Array.isArray(workspace.risks) ? workspace.risks.map((item) => ({ provenance: item?.provenance ?? null })) : [],
      action_items: Array.isArray(workspace.action_items) ? workspace.action_items.map((item) => ({ id: item?.id, deal_id: item?.deal_id, title: item?.title, due_date: item?.due_date, category: item?.category, owner_person_id: item?.owner_person_id, state: item?.state, status: item?.status, updated_at: item?.updated_at, provenance: item?.provenance ?? null })) : [],
    };
  })),
  Promise.all(detailedClients.map(async (clientDetail) => {
    const result = await client.callTool('get_client_workspace', { clientId: clientDetail.id });
    const workspace = result.structuredContent ?? {};
    return {
      client_id: workspace.client_id,
      client_name: workspace.client_name,
      risks: Array.isArray(workspace.risks) ? workspace.risks.map((risk) => ({ id: risk?.id, risk: risk?.risk, likelihood: risk?.likelihood, impact: risk?.impact, mitigation: risk?.mitigation, owner: risk?.owner?.name ? { name: risk.owner.name } : null })) : [],
      initiatives: Array.isArray(workspace.initiatives) ? workspace.initiatives.map((initiative) => ({ id: initiative?.id, name: initiative?.name, timeline: initiative?.timeline, owner: initiative?.owner ? { personId: initiative.owner.personId, personKey: initiative.owner.personKey, title: initiative.owner.title } : null })) : [],
      provenance: { source: workspace.provenance?.source, attribution_snippets_included: workspace.provenance?.attribution_snippets_included },
    };
  })),
  Promise.all(teams.map(async (team) => {
    const result = await client.callTool('list_team_action_items', { team_id: team.id, limit: Math.min(Math.max(Math.trunc(limit) || 25, 1), 25) });
    const index = result.structuredContent ?? {};
    return {
      team_id: index.team_id,
      action_items: Array.isArray(index.action_items) ? index.action_items.map((item) => ({ id: item?.id, deal_id: item?.deal_id, deal_name: item?.deal_name, title: item?.title, due_date: item?.due_date, category: item?.category, owner_person_id: item?.owner_person_id, state: item?.state, status: item?.status, updated_at: item?.updated_at, provenance: item?.provenance ?? null })) : [],
    };
  })),
]);

const bundle = normalizeBundle({
  scope,
  contract: okfContract,
  exportedAt,
  status: statusResult.structuredContent,
  clients: detailedClients,
  deals: detailedDeals.map((deal) => ({
    ...deal,
    people: dealPeopleById.get(deal.id) ?? [],
  })),
  people: detailedPeople,
  personalMeetings,
  teamMeetings,
  canonicalMeetings: clientMeetingExports.flatMap((result) => result.canonicalMeetings),
  upcomingClientMeetings: clientMeetingExports.flatMap((result) => result.upcomingClientMeetings),
  meetingPreparations: clientMeetingExports.flatMap((result) => result.meetingPreparations),
  teams,
  dealWorkspaces,
  clientWorkspaces,
  teamActionItemIndexes,
});

await writeBundle({ outDir, bundle });

console.log(JSON.stringify({
  outDir,
  scope,
  clients: bundle.clients.length,
  deals: bundle.deals.length,
  people: bundle.people.length,
  personalMeetings: bundle.personalMeetings.length,
  teamMeetings: bundle.teamMeetings.length,
  canonicalMeetings: bundle.canonicalMeetings.length,
  upcomingClientMeetings: bundle.upcomingClientMeetings.length,
  meetingPreparations: bundle.meetingPreparations.length,
  teams: bundle.teams.length,
  dealWorkspaces: bundle.dealWorkspaces.length,
  clientWorkspaces: bundle.clientWorkspaces.length,
  teamActionItemIndexes: bundle.teamActionItemIndexes.length,
  contractVersion: bundle.contract.contractVersion,
}, null, 2));
