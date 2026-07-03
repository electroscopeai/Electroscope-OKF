import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDealPeopleById, collectSearchResults } from '../src/lib/exporter.mjs';

test('collectSearchResults follows page metadata and dedupes overlapping results', async () => {
  const calls = [];
  const client = {
    async callTool(name, args) {
      calls.push({ name, args });
      if (args.page === 1) {
        return {
          structuredContent: {
            total: 3,
            has_more: true,
            people: [
              { id: 'person-1', name: 'Taylor' },
              { id: 'person-2', name: 'Jordan' },
            ],
          },
        };
      }
      return {
        structuredContent: {
          total: 3,
          has_more: false,
          people: [
            { id: 'person-2', name: 'Jordan' },
            { id: 'person-3', name: 'Morgan' },
          ],
        },
      };
    },
  };

  const rows = await collectSearchResults({
    client,
    toolName: 'search_people',
    scope: 'tenant',
    query: '',
    limit: 2,
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.args.page), [1, 2]);
  assert.deepEqual(rows.map((row) => row.id), ['person-1', 'person-2', 'person-3']);
});

test('collectSearchResults falls back when pagination arguments are unsupported', async () => {
  const calls = [];
  const client = {
    async callTool(name, args) {
      calls.push({ name, args });
      if (args.page === 1) {
        return {
          isError: true,
          structuredContent: {
            issues: [{ path: ['page'], message: 'Unrecognized key: page' }],
          },
        };
      }
      return {
        structuredContent: {
          people: [{ id: 'person-1', name: 'Taylor' }],
        },
      };
    },
  };

  const rows = await collectSearchResults({
    client,
    toolName: 'search_people',
    scope: 'tenant',
    query: '',
    limit: 25,
  });

  assert.equal(calls.length, 2);
  assert.equal('page' in calls[1].args, false);
  assert.deepEqual(rows, [{ id: 'person-1', name: 'Taylor' }]);
});

test('collectSearchResults returns the first page when pagination metadata is absent', async () => {
  const calls = [];
  const client = {
    async callTool(name, args) {
      calls.push({ name, args });
      return {
        structuredContent: {
          total: 50,
          people: Array.from({ length: 25 }, (_, index) => ({ id: `person-${index + 1}`, name: `Person ${index + 1}` })),
        },
      };
    },
  };

  const rows = await collectSearchResults({
    client,
    toolName: 'search_people',
    scope: 'tenant',
    query: '',
    limit: 25,
  });

  assert.equal(calls.length, 1);
  assert.equal(rows.length, 25);
});

test('buildDealPeopleById dedupes repeated people per related deal', () => {
  const dealPeopleById = buildDealPeopleById([
    {
      id: 'person-1',
      name: 'Taylor Buyer',
      related_deals: [
        { id: 'deal-1', deal_role: 'Champion' },
        { id: 'deal-1', deal_role: 'Champion' },
      ],
    },
    {
      id: 'person-1',
      name: 'Taylor Buyer',
      related_deals: [
        { id: 'deal-1', deal_role: 'Champion' },
      ],
    },
  ]);

  assert.deepEqual(dealPeopleById.get('deal-1'), [
    { id: 'person-1', name: 'Taylor Buyer', deal_role: 'Champion' },
  ]);
});
