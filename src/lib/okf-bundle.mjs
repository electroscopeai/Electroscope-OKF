import fs from 'node:fs/promises';
import path from 'node:path';

const RESERVED_CHARACTERS = /[^a-z0-9]+/gi;

const normalizeList = (items) => Array.from(new Set((items ?? []).filter(Boolean)));

export const slugify = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(RESERVED_CHARACTERS, '-')
    .replace(/^-+|-+$/g, '') || 'item';

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
    bulletLines(client.deals ?? [], (deal) => `- [${deal.name}](/deals/${deal.slug}.md)${deal.stage?.name ? ` - ${deal.stage.name}` : ''}`),
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
      deal.client ? `Client: [${deal.client.name}](/clients/${deal.client.slug}.md)` : null,
      deal.stage?.name ? `Stage: ${deal.stage.name}` : null,
      deal.status_brief ? `Status: ${deal.status_brief}` : null,
      deal.next_steps ? `Next steps: ${deal.next_steps}` : null,
      deal.revenue !== null && deal.revenue !== undefined ? `Revenue: ${deal.revenue}` : null,
    ].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related People',
    bulletLines(deal.people ?? [], (person) => `- [${person.name}](/people/${person.slug}.md)${person.deal_role ? ` - ${person.deal_role}` : ''}`),
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
      person.current_client ? `Current client: [${person.current_client.name}](/clients/${person.current_client.slug}.md)` : null,
      person.communication_style ? `Communication style: ${person.communication_style}` : null,
      person.budget_authority ? `Budget authority: ${person.budget_authority}` : null,
    ].filter(Boolean).join('\n\n') || 'No summary available.',
    '# Related Clients',
    bulletLines(person.related_clients ?? [], (client) => `- [${client.name}](/clients/${client.slug}.md)`),
    '# Related Deals',
    bulletLines(person.related_deals ?? [], (deal) => `- [${deal.name}](/deals/${deal.slug}.md)${deal.deal_role ? ` - ${deal.deal_role}` : ''}`),
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
].join('\n');

const buildLog = (bundle) => {
  const date = new Date().toISOString().slice(0, 10);
  return [
    '# Electroscope OKF Update Log',
    '',
    `## ${date}`,
    `- **Update**: Exported ${bundle.clients.length} clients, ${bundle.deals.length} deals, and ${bundle.people.length} people from Electroscope MCP.`,
    `- **Update**: Scope ${bundle.scope} with status snapshot clients=${bundle.status.client_count} deals=${bundle.status.deal_count}.`,
  ].join('\n');
};

export const normalizeBundle = ({ status, clients, deals, people, scope }) => {
  const clientById = new Map();
  const normalizedClients = clients.map((client) => {
    const slug = slugify(client.name);
    const normalized = {
      ...client,
      slug,
      deals: (client.deals ?? []).map((deal) => ({
        ...deal,
        slug: slugify(deal.name),
      })),
    };
    clientById.set(client.id, normalized);
    return normalized;
  });

  const normalizedDeals = deals.map((deal) => ({
    ...deal,
    slug: slugify(deal.name),
    client: deal.client ? { ...deal.client, slug: clientById.get(deal.client.id)?.slug ?? slugify(deal.client.name) } : null,
    people: (deal.people ?? []).map((person) => ({
      ...person,
      slug: slugify(person.name),
    })),
  }));

  const normalizedPeople = people.map((person) => ({
    ...person,
    slug: slugify(person.name),
    current_client: person.current_client
      ? { ...person.current_client, slug: clientById.get(person.current_client.id)?.slug ?? slugify(person.current_client.name) }
      : null,
    related_clients: (person.related_clients ?? []).map((client) => ({
      ...client,
      slug: clientById.get(client.id)?.slug ?? slugify(client.name),
    })),
    related_deals: (person.related_deals ?? []).map((deal) => ({
      ...deal,
      slug: slugify(deal.name),
    })),
  }));

  return {
    scope,
    status,
    clients: normalizedClients,
    deals: normalizedDeals,
    people: normalizedPeople,
  };
};

export const writeBundle = async ({ outDir, bundle }) => {
  await fs.mkdir(path.join(outDir, 'clients'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'deals'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'people'), { recursive: true });

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
};
