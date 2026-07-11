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
    if (used.has(slug)) {
      slug = `${baseSlug}-${String(item.id).slice(0, 8)}`;
    }
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
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((entry) => JSON.stringify(entry)).join(', ')}]`);
      continue;
    }
    if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
};

const conceptDocument = ({ meta, sections }) =>
  `${frontmatter(meta)}\n\n${sections.filter(Boolean).join('\n\n').trim()}\n`;

const bulletLines = (items, mapItem) => (items.length ? items.map(mapItem).join('\n') : '- None');

const clientDealLink = (deal) => `../deals/${deal.slug}.md`;
const dealClientLink = (client) => `../clients/${client.slug}.md`;
const dealPersonLink = (person) => `../people/${person.slug}.md`;
const personClientLink = (client) => `../clients/${client.slug}.md`;
const personDealLink = (deal) => `../deals/${deal.slug}.md`;

const meetingDocument = (meeting) => conceptDocument({
  meta: {
    type: meeting.kind === 'personal' ? 'Electroscope Personal Meeting' : 'Electroscope Team Shared Meeting',
    title: meeting.subject ?? `${meeting.kind === 'personal' ? 'Personal' : 'Team shared'} meeting ${meeting.start_at ?? meeting.source_id}`,
    description: meeting.kind === 'personal'
      ? 'Redacted personal calendar metadata exported from Electroscope MCP.'
      : 'Explicitly shared team meeting metadata exported from Electroscope MCP.',
    resource: meeting.kind === 'personal'
      ? `electroscope://calendar-event/${meeting.source_id}`
      : `electroscope://team-shared-meeting/${meeting.source_id}`,
    tags: normalizeList(['electroscope', 'meeting', meeting.kind, meeting.classification, meeting.meeting_lifecycle].filter(Boolean)),
    timestamp: meeting.synced_at ?? meeting.start_at,
    electroscope_id: meeting.source_id,
    calendar_source: meeting.kind,
  },
  sections: [
    '# Summary',
    [
      meeting.subject ? `Subject: ${meeting.subject}` : null,
      meeting.start_at ? `Start: ${meeting.start_at}` : null,
      meeting.end_at ? `End: ${meeting.end_at}` : null,
      meeting.kind === 'personal' && meeting.show_as ? `Availability: ${meeting.show_as}` : null,
      meeting.kind === 'personal' && meeting.response_status ? `Response status: ${meeting.response_status}` : null,
      meeting.kind === 'personal' && meeting.attendee_count !== null && meeting.attendee_count !== undefined ? `Attendee count: ${meeting.attendee_count}` : null,
      meeting.classification ? `Classification: ${meeting.classification}` : null,
      meeting.meeting_lifecycle ? `Lifecycle: ${meeting.meeting_lifecycle}` : null,
    ].filter(Boolean).join('\n\n') || 'No meeting metadata available.',
  ],
});

const clientDocument = (client) => conceptDocument({
  meta: {
    type: 'Electroscope Client',
    title: client.name,
    description: client.description ?? `Electroscope client account ${client.name}`,
    resource: `electroscope://client/${client.id}`,
    tags: normalizeList(['electroscope', 'client', client.industry].filter(Boolean)),
    timestamp: client.updated_at ?? client.created_at,
    electroscope_id: client.id,
  },
  sections: [
    '# Summary',
    [
      client.description,
      client.industry ? `Industry: ${client.industry}` : null,
      client.headquarters ? `Headquarters: ${client.headquarters}` : null,
      client.website_domain ? `Website: ${client.website_domain}` : null,
    ].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related Deals',
    bulletLines(client.deals ?? [], (deal) => `- [${deal.name}](${clientDealLink(deal)})${deal.stage?.name ? ` - ${deal.stage.name}` : ''}`),
  ],
});

const dealDocument = (deal) => conceptDocument({
  meta: {
    type: 'Electroscope Deal',
    title: deal.name,
    description: deal.status_brief ?? `Electroscope deal ${deal.name}`,
    resource: `electroscope://deal/${deal.id}`,
    tags: normalizeList(['electroscope', 'deal', deal.stage?.name, deal.client?.name].filter(Boolean)),
    timestamp: deal.updated_at ?? deal.created_at,
    electroscope_id: deal.id,
  },
  sections: [
    '# Summary',
    [
      deal.client ? `Client: [${deal.client.name}](${dealClientLink(deal.client)})` : null,
      deal.stage?.name ? `Stage: ${deal.stage.name}` : null,
      deal.status_brief ? `Status: ${deal.status_brief}` : null,
      deal.next_steps ? `Next steps: ${deal.next_steps}` : null,
      deal.revenue !== null && deal.revenue !== undefined ? `Revenue: ${deal.revenue}` : null,
    ].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related People',
    bulletLines(deal.people ?? [], (person) => `- [${person.name}](${dealPersonLink(person)})${person.deal_role ? ` - ${person.deal_role}` : ''}`),
  ],
});

const personDocument = (person) => conceptDocument({
  meta: {
    type: 'Electroscope Person',
    title: person.name,
    description: person.title ?? `Electroscope person ${person.name}`,
    resource: `electroscope://person/${person.id}`,
    tags: normalizeList(['electroscope', 'person', person.department, person.seniority_level].filter(Boolean)),
    timestamp: person.updated_at ?? new Date().toISOString(),
    electroscope_id: person.id,
  },
  sections: [
    '# Summary',
    [
      person.title ? `Title: ${person.title}` : null,
      person.email ? `Email: ${person.email}` : null,
      person.current_client ? `Current client: [${person.current_client.name}](${personClientLink(person.current_client)})` : null,
      person.communication_style ? `Communication style: ${person.communication_style}` : null,
      person.budget_authority ? `Budget authority: ${person.budget_authority}` : null,
    ].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related Clients',
    bulletLines(person.related_clients ?? [], (client) => `- [${client.name}](${personClientLink(client)})`),
    '# Related Deals',
    bulletLines(person.related_deals ?? [], (deal) => `- [${deal.name}](${personDealLink(deal)})${deal.deal_role ? ` - ${deal.deal_role}` : ''}`),
  ],
});

const buildIndex = (bundle) => [
  '# Electroscope OKF Bundle',
  '',
  '## Clients',
  ...(bundle.clients.length ? bundle.clients.map((client) => `- [${client.name}](clients/${client.slug}.md) - ${client.description ?? 'Electroscope client account'}`) : ['- None']),
  '',
  '## Deals',
  ...(bundle.deals.length ? bundle.deals.map((deal) => `- [${deal.name}](deals/${deal.slug}.md) - ${deal.status_brief ?? 'Electroscope deal'}`) : ['- None']),
  '',
  '## People',
  ...(bundle.people.length ? bundle.people.map((person) => `- [${person.name}](people/${person.slug}.md) - ${person.title ?? 'Electroscope person'}`) : ['- None']),
  '',
  '## Personal Meetings',
  ...(bundle.personalMeetings.length ? bundle.personalMeetings.map((meeting) => `- [${meeting.subject ?? `Personal meeting ${meeting.start_at ?? meeting.source_id}`}](meetings/${meeting.slug}.md)`) : ['- None']),
  '',
  '## Team Shared Meetings',
  ...(bundle.teamMeetings.length ? bundle.teamMeetings.map((meeting) => `- [${meeting.subject ?? `Team shared meeting ${meeting.start_at ?? meeting.source_id}`}](meetings/${meeting.slug}.md)`) : ['- None']),
].join('\n');

const buildLog = (bundle) => {
  const date = new Date().toISOString().slice(0, 10);
  return [
    '# Electroscope OKF Update Log',
    '',
    `## ${date}`,
    `- **Update**: Exported ${bundle.clients.length} clients, ${bundle.deals.length} deals, ${bundle.people.length} people, ${bundle.personalMeetings.length} personal meetings, and ${bundle.teamMeetings.length} team shared meetings from Electroscope MCP.`,
    `- **Update**: Scope ${bundle.scope} with status snapshot clients=${bundle.status.client_count} deals=${bundle.status.deal_count}.`,
  ].join('\n');
};

const mapUniqueNestedClients = (clients, clientSlugById) => dedupeById(clients).map((client) => ({
  ...client,
  slug: clientSlugById.get(client.id) ?? slugify(client.name),
}));

const mapUniqueNestedDeals = (deals, dealSlugById, clientSlugById) => dedupeById(deals).map((deal) => ({
  ...deal,
  slug: dealSlugById.get(deal.id) ?? slugify(deal.name),
  client: deal.client
    ? {
        ...deal.client,
        slug: clientSlugById.get(deal.client.id) ?? slugify(deal.client.name),
      }
    : null,
}));

const mapUniqueNestedPeople = (people, personSlugById) => dedupeById(people).map((person) => ({
  ...person,
  slug: personSlugById.get(person.id) ?? slugify(person.name),
}));

const normalizeMeetings = (meetings, kind, idKey) => assignUniqueSlugs((meetings ?? [])
  .filter((meeting) => meeting && typeof meeting === 'object' && typeof meeting[idKey] === 'string')
  .map((meeting) => ({
    ...meeting,
    id: `${kind}:${meeting[idKey]}`,
    source_id: meeting[idKey],
    kind,
    name: meeting.subject ?? `${kind === 'personal' ? 'Personal' : 'Team shared'} meeting ${meeting.start_at ?? meeting[idKey]}`,
  })));

export const normalizeBundle = ({ status, clients, deals, people, personalMeetings = [], teamMeetings = [], scope }) => {
  const normalizedClients = assignUniqueSlugs(dedupeById(clients)).map((client) => ({
    ...client,
    deals: dedupeById(client.deals ?? []),
  }));
  const clientSlugById = new Map(normalizedClients.map((client) => [client.id, client.slug]));

  const normalizedDeals = assignUniqueSlugs(dedupeById(deals)).map((deal) => ({
    ...deal,
    client: deal.client
      ? { ...deal.client, slug: clientSlugById.get(deal.client.id) ?? slugify(deal.client.name) }
      : null,
    people: dedupeById(deal.people ?? []),
  }));
  const dealSlugById = new Map(normalizedDeals.map((deal) => [deal.id, deal.slug]));

  const normalizedPeople = assignUniqueSlugs(dedupeById(people)).map((person) => ({
    ...person,
    current_client: person.current_client
      ? { ...person.current_client, slug: clientSlugById.get(person.current_client.id) ?? slugify(person.current_client.name) }
      : null,
    related_clients: dedupeById(person.related_clients ?? []),
    related_deals: dedupeById(person.related_deals ?? []),
  }));
  const personSlugById = new Map(normalizedPeople.map((person) => [person.id, person.slug]));

  return {
    scope,
    status,
    clients: normalizedClients.map((client) => ({
      ...client,
      deals: mapUniqueNestedDeals(client.deals ?? [], dealSlugById, clientSlugById),
    })),
    deals: normalizedDeals.map((deal) => ({
      ...deal,
      people: mapUniqueNestedPeople(deal.people ?? [], personSlugById),
    })),
    people: normalizedPeople.map((person) => ({
      ...person,
      related_clients: mapUniqueNestedClients(person.related_clients ?? [], clientSlugById),
      related_deals: mapUniqueNestedDeals(person.related_deals ?? [], dealSlugById, clientSlugById),
    })),
    personalMeetings: normalizeMeetings(personalMeetings, 'personal', 'calendar_event_id'),
    teamMeetings: normalizeMeetings(teamMeetings, 'team_shared', 'team_shared_meeting_id'),
  };
};

export const writeBundle = async ({ outDir, bundle }) => {
  await fs.mkdir(path.join(outDir, 'clients'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'deals'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'people'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'meetings'), { recursive: true });

  await fs.writeFile(path.join(outDir, 'index.md'), buildIndex(bundle));
  await fs.writeFile(path.join(outDir, 'log.md'), buildLog(bundle));

  await Promise.all(bundle.clients.map((client) =>
    fs.writeFile(path.join(outDir, 'clients', `${client.slug}.md`), clientDocument(client))
  ));

  await Promise.all(bundle.deals.map((deal) =>
    fs.writeFile(path.join(outDir, 'deals', `${deal.slug}.md`), dealDocument(deal))
  ));

  await Promise.all(bundle.people.map((person) =>
    fs.writeFile(path.join(outDir, 'people', `${person.slug}.md`), personDocument(person))
  ));

  await Promise.all([...bundle.personalMeetings, ...bundle.teamMeetings].map((meeting) =>
    fs.writeFile(path.join(outDir, 'meetings', `${meeting.slug}.md`), meetingDocument(meeting))
  ));
};
