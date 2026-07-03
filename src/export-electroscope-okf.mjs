import path from 'node:path';
import { ElectroscopeMcpClient } from './lib/mcp-client.mjs';
import { normalizeBundle, writeBundle } from './lib/okf-bundle.mjs';

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

const client = new ElectroscopeMcpClient({ baseUrl, bearerToken: mcpToken });

const statusResult = await client.callTool('get_status', { scope });
const clientsResult = await client.callTool('search_clients', {
  scope,
  query: args['client-query'] ?? '',
  limit,
});
const dealsResult = await client.callTool('search_deals', {
  scope,
  query: args['deal-query'] ?? '',
  limit,
});
const peopleResult = await client.callTool('search_people', {
  scope,
  query: args['person-query'] ?? '',
  limit,
});

const detailedClients = await Promise.all((clientsResult.structuredContent?.clients ?? []).map(async (clientRow) => {
  const detail = await client.callTool('get_client', { clientId: clientRow.id });
  return detail.structuredContent;
}));

const detailedDeals = await Promise.all((dealsResult.structuredContent?.deals ?? []).map(async (dealRow) => {
  const detail = await client.callTool('get_deal', { dealId: dealRow.id });
  return detail.structuredContent;
}));

const detailedPeople = await Promise.all((peopleResult.structuredContent?.people ?? []).map(async (personRow) => {
  const detail = await client.callTool('get_person', { personId: personRow.id });
  return detail.structuredContent;
}));

const dealPeopleById = new Map();
for (const person of detailedPeople) {
  for (const relatedDeal of person.related_deals ?? []) {
    const existing = dealPeopleById.get(relatedDeal.id) ?? [];
    existing.push({
      id: person.id,
      name: person.name,
      deal_role: relatedDeal.deal_role ?? null,
    });
    dealPeopleById.set(relatedDeal.id, existing);
  }
}

const bundle = normalizeBundle({
  scope,
  status: statusResult.structuredContent,
  clients: detailedClients,
  deals: detailedDeals.map((deal) => ({
    ...deal,
    people: dealPeopleById.get(deal.id) ?? [],
  })),
  people: detailedPeople,
});

await writeBundle({ outDir, bundle });

console.log(JSON.stringify({
  outDir,
  scope,
  clients: bundle.clients.length,
  deals: bundle.deals.length,
  people: bundle.people.length,
}, null, 2));
