import fs from 'node:fs/promises';
import path from 'node:path';

const RESERVED_CHARACTERS = /[^a-z0-9]+/gi;

const normalizeList = (items) => Array.from(new Set((items ?? []).filter(Boolean)));
const dedupeById = (items) => Array.from(new Map((items ?? []).filter(Boolean).map((item) => [item.id, item])).values());

export const slugify = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(RESERVED_CHARACTERS, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const assignUniqueSlugs = (items) => {
  const used = new Set();
  return items.map((item) => {
    const baseSlug = slugify(item.name);
    let slug = baseSlug;
    if (used.has(slug)) slug = `${baseSlug}-${String(item.id).slice(0, 8)}`;
    let collisionIndex = 2;
    while (used.has(slug)) {
      slug = `${baseSlug}-${collisionIndex}`;
      collisionIndex += 1;
    }
    used.add(slug);
    return { ...item, slug };
  });
};

export const frontmatter = (data) => {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((entry) => JSON.stringify(entry)).join(', ')}]`);
    else lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
};

const conceptDocument = ({ meta, sections }) => `${frontmatter(meta)}\n\n${sections.filter(Boolean).join('\n\n').trim()}\n`;
const bulletLines = (items, mapItem) => (items.length ? items.map(mapItem).join('\n') : '- None');
const clientDealLink = (deal) => `../deals/${deal.slug}.md`;
const dealClientLink = (client) => `../clients/${client.slug}.md`;
const dealPersonLink = (person) => `../people/${person.slug}.md`;
const personClientLink = (client) => `../clients/${client.slug}.md`;
const personDealLink = (deal) => `../deals/${deal.slug}.md`;
const clientMeetingLink = (meeting) => `../meetings/${meeting.slug}.md`;

const meetingDocument = (meeting) => conceptDocument({
  meta: {
    type: meeting.kind === 'personal' ? 'Electroscope Personal Meeting' : 'Electroscope Team Shared Meeting',
    title: meeting.subject ?? `${meeting.kind === 'personal' ? 'Personal' : 'Team shared'} meeting ${meeting.start_at ?? meeting.source_id}`,
    description: meeting.kind === 'personal' ? 'Redacted personal calendar metadata exported from Electroscope MCP.' : 'Explicitly shared team meeting metadata exported from Electroscope MCP.',
    resource: meeting.kind === 'personal' ? `electroscope://calendar-event/${meeting.source_id}` : `electroscope://team-shared-meeting/${meeting.source_id}`,
    tags: normalizeList(['electroscope', 'meeting', meeting.kind, meeting.classification, meeting.meeting_lifecycle]),
    timestamp: meeting.synced_at ?? meeting.start_at,
    electroscope_id: meeting.source_id,
    calendar_source: meeting.kind,
  },
  sections: ['# Summary', [meeting.subject && `Subject: ${meeting.subject}`, meeting.start_at && `Start: ${meeting.start_at}`, meeting.end_at && `End: ${meeting.end_at}`, meeting.kind === 'personal' && meeting.show_as && `Availability: ${meeting.show_as}`, meeting.kind === 'personal' && meeting.response_status && `Response status: ${meeting.response_status}`, meeting.kind === 'personal' && meeting.attendee_count !== null && meeting.attendee_count !== undefined && `Attendee count: ${meeting.attendee_count}`, meeting.classification && `Classification: ${meeting.classification}`, meeting.meeting_lifecycle && `Lifecycle: ${meeting.meeting_lifecycle}`].filter(Boolean).join('\n\n') || 'No meeting metadata available.'],
});

const clientDocument = (client) => conceptDocument({
  meta: { type: 'Electroscope Client', title: client.name, description: client.description ?? `Electroscope client account ${client.name}`, resource: `electroscope://client/${client.id}`, tags: normalizeList(['electroscope', 'client', client.industry]), timestamp: client.updated_at ?? client.created_at, electroscope_id: client.id },
  sections: [
    '# Summary',
    [client.description, client.industry && `Industry: ${client.industry}`, client.headquarters && `Headquarters: ${client.headquarters}`, client.website_domain && `Website: ${client.website_domain}`].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related Deals', bulletLines(client.deals ?? [], (deal) => `- [${deal.name}](${clientDealLink(deal)})${deal.stage?.name ? ` - ${deal.stage.name}` : ''}`),
    '# Meeting Knowledge', bulletLines(client.meetings ?? [], (meeting) => `- [${meeting.name}](${clientMeetingLink(meeting)})`),
  ],
});

const dealDocument = (deal) => conceptDocument({
  meta: { type: 'Electroscope Deal', title: deal.name, description: deal.status_brief ?? `Electroscope deal ${deal.name}`, resource: `electroscope://deal/${deal.id}`, tags: normalizeList(['electroscope', 'deal', deal.stage?.name, deal.client?.name]), timestamp: deal.updated_at ?? deal.created_at, electroscope_id: deal.id },
  sections: ['# Summary', [deal.client && `Client: [${deal.client.name}](${dealClientLink(deal.client)})`, deal.stage?.name && `Stage: ${deal.stage.name}`, deal.status_brief && `Status: ${deal.status_brief}`, deal.next_steps && `Next steps: ${deal.next_steps}`, deal.revenue !== null && deal.revenue !== undefined && `Revenue: ${deal.revenue}`].filter(Boolean).join('\n\n') || 'No summary available.', '# Related People', bulletLines(deal.people ?? [], (person) => `- [${person.name}](${dealPersonLink(person)})${person.deal_role ? ` - ${person.deal_role}` : ''}`)],
});

const personDocument = (person) => conceptDocument({
  meta: { type: 'Electroscope Person', title: person.name, description: person.title ?? `Electroscope person ${person.name}`, resource: `electroscope://person/${person.id}`, tags: normalizeList(['electroscope', 'person', person.department, person.seniority_level]), timestamp: person.updated_at ?? new Date().toISOString(), electroscope_id: person.id },
  sections: ['# Summary', [person.title && `Title: ${person.title}`, person.email && `Email: ${person.email}`, person.current_client && `Current client: [${person.current_client.name}](${personClientLink(person.current_client)})`, person.communication_style && `Communication style: ${person.communication_style}`, person.budget_authority && `Budget authority: ${person.budget_authority}`].filter(Boolean).join('\n\n') || 'No summary available.', '# Related Clients', bulletLines(person.related_clients ?? [], (client) => `- [${client.name}](${personClientLink(client)})`), '# Related Deals', bulletLines(person.related_deals ?? [], (deal) => `- [${deal.name}](${personDealLink(deal)})${deal.deal_role ? ` - ${deal.deal_role}` : ''}`)],
});

const canonicalMeetingDocument = (meeting) => conceptDocument({
  meta: { type: 'Electroscope Canonical Client Meeting', title: meeting.subject ?? `Client meeting ${meeting.canonical_meeting_id}`, description: 'Persisted canonical meeting summary exported from Electroscope MCP.', resource: `electroscope://client/${meeting.client_id}/meeting/${meeting.canonical_meeting_id}`, tags: ['electroscope', 'client-meeting', 'canonical-summary'], timestamp: meeting.generated_at ?? meeting.started_at, electroscope_id: meeting.canonical_meeting_id, client_id: meeting.client_id, deal_id: meeting.deal_id ?? null, source_fingerprint: meeting.person_resolution_fingerprint ?? null },
  sections: ['# Summary', [meeting.client && `Client: [${meeting.client.name}](../clients/${meeting.client.slug}.md)`, meeting.subject && `Subject: ${meeting.subject}`, meeting.started_at && `Start: ${meeting.started_at}`, meeting.canonical_summary?.rendered?.purpose && `Purpose: ${meeting.canonical_summary.rendered.purpose}`].filter(Boolean).join('\n\n') || 'No summary available.', '# Key Points', bulletLines(meeting.canonical_summary?.rendered?.key_points ?? [], (point) => `- ${point}`), '# Action Items', bulletLines(meeting.canonical_summary?.rendered?.action_items ?? [], (item) => `- ${item}`), '# Provenance', [`Authority: ${meeting.authority ?? 'canonical_meeting_summary'}`, meeting.generated_at && `Generated at: ${meeting.generated_at}`, meeting.prompt_version && `Prompt version: ${meeting.prompt_version}`, meeting.person_resolution_fingerprint && `Person resolution fingerprint: ${meeting.person_resolution_fingerprint}`].filter(Boolean).join('\n\n') || 'No provenance available.'],
});

const upcomingClientMeetingDocument = (meeting) => conceptDocument({
  meta: { type: 'Electroscope Upcoming Client Meeting Context', title: meeting.subject ?? `Upcoming client meeting ${meeting.upcoming_meeting_id}`, description: 'Owner-authorized, persisted upcoming client meeting context exported from Electroscope MCP.', resource: `electroscope://client/${meeting.client_id}/upcoming-meeting/${meeting.upcoming_meeting_id}`, tags: normalizeList(['electroscope', 'client-meeting', 'upcoming', meeting.meeting_lifecycle]), timestamp: meeting.start_at, electroscope_id: meeting.upcoming_meeting_id, client_id: meeting.client_id, canonical_meeting_id: meeting.canonical_meeting_id ?? null, deal_id: meeting.deal_id ?? null },
  sections: ['# Summary', [meeting.client && `Client: [${meeting.client.name}](../clients/${meeting.client.slug}.md)`, meeting.subject && `Subject: ${meeting.subject}`, meeting.start_at && `Start: ${meeting.start_at}`, meeting.end_at && `End: ${meeting.end_at}`, meeting.match_confidence && `Match confidence: ${meeting.match_confidence}`, meeting.meeting_audience && `Audience: ${meeting.meeting_audience}`, meeting.meeting_state && `State: ${meeting.meeting_state}`, meeting.prep_status && `Preparation status: ${meeting.prep_status}`, meeting.business_context && `Business context: ${meeting.business_context}`, meeting.meeting_lifecycle && `Lifecycle: ${meeting.meeting_lifecycle}`, typeof meeting.needs_attention === 'boolean' && `Needs attention: ${meeting.needs_attention}`].filter(Boolean).join('\n\n') || 'No upcoming meeting context available.'],
});

const meetingPreparationDocument = (preparation) => conceptDocument({
  meta: { type: 'Electroscope Client Meeting Preparation', title: `Meeting preparation for ${preparation.client?.name ?? preparation.client_id}`, description: 'Persisted client Meeting Prep exported only when MCP confirms active canonical meeting-set validity.', resource: `electroscope://client/${preparation.client_id}/meeting-preparation`, tags: ['electroscope', 'meeting-preparation'], timestamp: preparation.generated_at, electroscope_id: preparation.id, client_id: preparation.client_id, source_fingerprint: preparation.source_fingerprint, latest_meeting_id: preparation.latest_meeting_id },
  sections: ['# Summary', [preparation.client && `Client: [${preparation.client.name}](../clients/${preparation.client.slug}.md)`, preparation.summary?.rendered?.purpose && `Purpose: ${preparation.summary.rendered.purpose}`].filter(Boolean).join('\n\n') || 'No preparation summary available.', '# Key Points', bulletLines(preparation.summary?.rendered?.key_points ?? [], (point) => `- ${point}`), '# Action Items', bulletLines(preparation.summary?.rendered?.action_items ?? [], (item) => `- ${item}`), '# Validity and Provenance', [`Validity: ${preparation.validity_status ?? 'active_meeting_set_match'}`, preparation.generated_at && `Generated at: ${preparation.generated_at}`, preparation.prompt_version && `Prompt version: ${preparation.prompt_version}`, preparation.source_fingerprint && `Source fingerprint: ${preparation.source_fingerprint}`, preparation.latest_meeting_id && `Latest canonical meeting ID: ${preparation.latest_meeting_id}`].filter(Boolean).join('\n\n') || 'No provenance available.'],
});

const buildIndex = (bundle) => ['# Electroscope OKF Bundle', '', '## Clients', ...(bundle.clients.length ? bundle.clients.map((client) => `- [${client.name}](clients/${client.slug}.md) - ${client.description ?? 'Electroscope client account'}`) : ['- None']), '', '## Deals', ...(bundle.deals.length ? bundle.deals.map((deal) => `- [${deal.name}](deals/${deal.slug}.md) - ${deal.status_brief ?? 'Electroscope deal'}`) : ['- None']), '', '## People', ...(bundle.people.length ? bundle.people.map((person) => `- [${person.name}](people/${person.slug}.md) - ${person.title ?? 'Electroscope person'}`) : ['- None']), '', '## Canonical Client Meeting Summaries', ...(bundle.canonicalMeetings.length ? bundle.canonicalMeetings.map((meeting) => `- [${meeting.name}](meetings/${meeting.slug}.md)`) : ['- None']), '', '## Upcoming Client Meeting Context', ...(bundle.upcomingClientMeetings.length ? bundle.upcomingClientMeetings.map((meeting) => `- [${meeting.name}](meetings/${meeting.slug}.md)`) : ['- None']), '', '## Client Meeting Preparation', ...(bundle.meetingPreparations.length ? bundle.meetingPreparations.map((preparation) => `- [${preparation.name}](meetings/${preparation.slug}.md)`) : ['- None']), '', '## Personal Meetings', ...(bundle.personalMeetings.length ? bundle.personalMeetings.map((meeting) => `- [${meeting.subject ?? `Personal meeting ${meeting.start_at ?? meeting.source_id}`}](meetings/${meeting.slug}.md)`) : ['- None']), '', '## Team Shared Meetings', ...(bundle.teamMeetings.length ? bundle.teamMeetings.map((meeting) => `- [${meeting.subject ?? `Team shared meeting ${meeting.start_at ?? meeting.source_id}`}](meetings/${meeting.slug}.md)`) : ['- None'])].join('\n');

const buildLog = (bundle) => { const date = new Date().toISOString().slice(0, 10); return ['# Electroscope OKF Update Log', '', `## ${date}`, `- **Update**: Exported ${bundle.clients.length} clients, ${bundle.deals.length} deals, ${bundle.people.length} people, ${bundle.canonicalMeetings.length} canonical client meeting summaries, ${bundle.upcomingClientMeetings.length} upcoming client meeting contexts, ${bundle.meetingPreparations.length} persisted Meeting Prep records, ${bundle.personalMeetings.length} personal meetings, and ${bundle.teamMeetings.length} team shared meetings from Electroscope MCP.`, `- **Update**: Scope ${bundle.scope} with status snapshot clients=${bundle.status.client_count} deals=${bundle.status.deal_count}.`, '- **Boundary**: Client meeting summaries, upcoming context, and Meeting Prep remain MCP-authorized redacted projections; raw transcripts, calendar bodies, attendees, joins, source snapshots, and unresolved owner text are excluded.'].join('\n'); };

const mapUniqueNestedClients = (clients, clientSlugById) => dedupeById(clients).map((client) => ({ ...client, slug: clientSlugById.get(client.id) ?? slugify(client.name) }));
const mapUniqueNestedDeals = (deals, dealSlugById, clientSlugById) => dedupeById(deals).map((deal) => ({ ...deal, slug: dealSlugById.get(deal.id) ?? slugify(deal.name), client: deal.client ? { ...deal.client, slug: clientSlugById.get(deal.client.id) ?? slugify(deal.client.name) } : null }));
const mapUniqueNestedPeople = (people, personSlugById) => dedupeById(people).map((person) => ({ ...person, slug: personSlugById.get(person.id) ?? slugify(person.name) }));
const normalizeMeetings = (meetings, kind, idKey) => assignUniqueSlugs((meetings ?? []).filter((meeting) => meeting && typeof meeting === 'object' && typeof meeting[idKey] === 'string').map((meeting) => ({ ...meeting, id: `${kind}:${meeting[idKey]}`, source_id: meeting[idKey], kind, name: meeting.subject ?? `${kind === 'personal' ? 'Personal' : 'Team shared'} meeting ${meeting.start_at ?? meeting[idKey]}` })));

export const normalizeBundle = ({ status, clients, deals, people, personalMeetings = [], teamMeetings = [], canonicalMeetings = [], upcomingClientMeetings = [], meetingPreparations = [], scope }) => {
  const normalizedClients = assignUniqueSlugs(dedupeById(clients)).map((client) => ({ ...client, deals: dedupeById(client.deals ?? []) }));
  const clientSlugById = new Map(normalizedClients.map((client) => [client.id, client.slug]));
  const normalizedDeals = assignUniqueSlugs(dedupeById(deals)).map((deal) => ({ ...deal, client: deal.client ? { ...deal.client, slug: clientSlugById.get(deal.client.id) ?? slugify(deal.client.name) } : null, people: dedupeById(deal.people ?? []) }));
  const dealSlugById = new Map(normalizedDeals.map((deal) => [deal.id, deal.slug]));
  const normalizedPeople = assignUniqueSlugs(dedupeById(people)).map((person) => ({ ...person, current_client: person.current_client ? { ...person.current_client, slug: clientSlugById.get(person.current_client.id) ?? slugify(person.current_client.name) } : null, related_clients: dedupeById(person.related_clients ?? []), related_deals: dedupeById(person.related_deals ?? []) }));
  const personSlugById = new Map(normalizedPeople.map((person) => [person.id, person.slug]));
  const normalizeClientKnowledge = (records, kind, idFor, nameFor) => assignUniqueSlugs((records ?? []).filter((record) => record && typeof record === 'object' && typeof idFor(record) === 'string').map((record) => ({ ...record, id: `${kind}:${idFor(record)}`, source_id: idFor(record), kind, name: nameFor(record), client: normalizedClients.find((client) => client.id === record.client_id) ?? null })));
  const normalizedCanonicalMeetings = normalizeClientKnowledge(canonicalMeetings, 'canonical-meeting', (record) => record.meeting?.canonical_meeting_id, (record) => record.meeting?.subject ?? `Canonical client meeting ${record.meeting?.canonical_meeting_id}` ).map((record) => ({ ...record, ...record.meeting, ...record.provenance, canonical_summary: record.canonical_summary, authority: record.provenance?.authority }));
  const normalizedUpcomingClientMeetings = normalizeClientKnowledge(upcomingClientMeetings, 'upcoming-client-meeting', (record) => record.upcoming_meeting_id, (record) => record.subject ?? `Upcoming client meeting ${record.upcoming_meeting_id}`);
  const normalizedMeetingPreparations = normalizeClientKnowledge(meetingPreparations, 'meeting-preparation', (record) => record.preparation?.id, (record) => `Meeting preparation for ${record.client?.name ?? record.client_id}`).map((record) => ({ ...record, ...record.preparation, validity_status: record.validity?.status }));
  const clientMeetingsById = new Map();
  for (const meeting of [...normalizedCanonicalMeetings, ...normalizedUpcomingClientMeetings, ...normalizedMeetingPreparations]) { const records = clientMeetingsById.get(meeting.client_id) ?? []; records.push(meeting); clientMeetingsById.set(meeting.client_id, records); }
  return { scope, status, clients: normalizedClients.map((client) => ({ ...client, deals: mapUniqueNestedDeals(client.deals ?? [], dealSlugById, clientSlugById), meetings: clientMeetingsById.get(client.id) ?? [] })), deals: normalizedDeals.map((deal) => ({ ...deal, people: mapUniqueNestedPeople(deal.people ?? [], personSlugById) })), people: normalizedPeople.map((person) => ({ ...person, related_clients: mapUniqueNestedClients(person.related_clients ?? [], clientSlugById), related_deals: mapUniqueNestedDeals(person.related_deals ?? [], dealSlugById, clientSlugById) })), personalMeetings: normalizeMeetings(personalMeetings, 'personal', 'calendar_event_id'), teamMeetings: normalizeMeetings(teamMeetings, 'team_shared', 'team_shared_meeting_id'), canonicalMeetings: normalizedCanonicalMeetings, upcomingClientMeetings: normalizedUpcomingClientMeetings, meetingPreparations: normalizedMeetingPreparations };
};

export const writeBundle = async ({ outDir, bundle }) => {
  await Promise.all(['clients', 'deals', 'people', 'meetings'].map((directory) => fs.mkdir(path.join(outDir, directory), { recursive: true })));
  await fs.writeFile(path.join(outDir, 'index.md'), buildIndex(bundle));
  await fs.writeFile(path.join(outDir, 'log.md'), buildLog(bundle));
  await Promise.all(bundle.clients.map((client) => fs.writeFile(path.join(outDir, 'clients', `${client.slug}.md`), clientDocument(client))));
  await Promise.all(bundle.deals.map((deal) => fs.writeFile(path.join(outDir, 'deals', `${deal.slug}.md`), dealDocument(deal))));
  await Promise.all(bundle.people.map((person) => fs.writeFile(path.join(outDir, 'people', `${person.slug}.md`), personDocument(person))));
  await Promise.all([...bundle.personalMeetings, ...bundle.teamMeetings].map((meeting) => fs.writeFile(path.join(outDir, 'meetings', `${meeting.slug}.md`), meetingDocument(meeting))));
  await Promise.all(bundle.canonicalMeetings.map((meeting) => fs.writeFile(path.join(outDir, 'meetings', `${meeting.slug}.md`), canonicalMeetingDocument(meeting))));
  await Promise.all(bundle.upcomingClientMeetings.map((meeting) => fs.writeFile(path.join(outDir, 'meetings', `${meeting.slug}.md`), upcomingClientMeetingDocument(meeting))));
  await Promise.all(bundle.meetingPreparations.map((preparation) => fs.writeFile(path.join(outDir, 'meetings', `${preparation.slug}.md`), meetingPreparationDocument(preparation))));
};
