import path from 'node:path';
import { ElectroscopeMcpClient } from './lib/mcp-client.mjs';
import { normalizeBundle, writeBundle } from './lib/okf-bundle.mjs';
import { buildDealPeopleById, collectCursorResults, collectSearchResults } from './lib/exporter.mjs';

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

const dealPeopleById = buildDealPeopleById(detailedPeople);

const bundle = normalizeBundle({
  scope,
  status: statusResult.structuredContent,
  clients: detailedClients,
  deals: detailedDeals.map((deal) => ({
    ...deal,
    people: dealPeopleById.get(deal.id) ?? [],
  })),
  people: detailedPeople,
  personalMeetings,
  teamMeetings,
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
}, null, 2));
