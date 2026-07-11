import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeBundle, slugify, writeBundle } from '../src/lib/okf-bundle.mjs';

test('slugify normalizes concept filenames', () => {
  assert.equal(slugify('Taylor Buyer / VP IT'), 'taylor-buyer-vp-it');
});

test('writeBundle writes index, log, and concept documents with cross-links', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electroscope-okf-'));
  const bundle = normalizeBundle({
    scope: 'tenant',
    status: { client_count: 1, deal_count: 1 },
    clients: [{
      id: 'client-1',
      name: 'Acme Corp',
      description: 'Strategic account',
      industry: 'Technology',
      headquarters: 'New York',
      website_domain: 'acme.example',
      updated_at: '2026-07-02T00:00:00.000Z',
      deals: [{ id: 'deal-1', name: 'Platform Renewal', stage: { name: 'Discovery' } }],
    }],
    deals: [{
      id: 'deal-1',
      name: 'Platform Renewal',
      status_brief: 'Renewal in progress',
      updated_at: '2026-07-02T00:00:00.000Z',
      client: { id: 'client-1', name: 'Acme Corp' },
      stage: { id: 'stage-1', name: 'Discovery', order: 1 },
      people: [{ id: 'person-1', name: 'Taylor Buyer', deal_role: 'Decision Maker' }],
    }],
    people: [{
      id: 'person-1',
      name: 'Taylor Buyer',
      title: 'VP IT',
      email: 'taylor@example.com',
      communication_style: 'direct',
      budget_authority: 'approver',
      current_client: { id: 'client-1', name: 'Acme Corp' },
      related_clients: [{ id: 'client-1', name: 'Acme Corp' }],
      related_deals: [{ id: 'deal-1', name: 'Platform Renewal', deal_role: 'Decision Maker' }],
    }],
    personalMeetings: [{
      calendar_event_id: 'event-1',
      subject: 'Account review',
      start_at: '2026-07-02T12:00:00.000Z',
      end_at: '2026-07-02T12:30:00.000Z',
      show_as: 'busy',
      attendee_count: 3,
      synced_at: '2026-07-02T11:00:00.000Z',
    }],
    teamMeetings: [{
      team_shared_meeting_id: 'share-1',
      subject: 'Pipeline review',
      classification: 'internal',
      start_at: '2026-07-03T12:00:00.000Z',
      end_at: '2026-07-03T12:30:00.000Z',
    }],
  });

  await writeBundle({ outDir, bundle });

  const index = await fs.readFile(path.join(outDir, 'index.md'), 'utf8');
  const log = await fs.readFile(path.join(outDir, 'log.md'), 'utf8');
  const clientDoc = await fs.readFile(path.join(outDir, 'clients', 'acme-corp.md'), 'utf8');
  const dealDoc = await fs.readFile(path.join(outDir, 'deals', 'platform-renewal.md'), 'utf8');
  const personDoc = await fs.readFile(path.join(outDir, 'people', 'taylor-buyer.md'), 'utf8');
  const personalMeetingDoc = await fs.readFile(path.join(outDir, 'meetings', 'account-review.md'), 'utf8');
  const teamMeetingDoc = await fs.readFile(path.join(outDir, 'meetings', 'pipeline-review.md'), 'utf8');

  assert.match(index, /\[Acme Corp\]\(clients\/acme-corp.md\)/);
  assert.match(index, /\[Account review\]\(meetings\/account-review.md\)/);
  assert.match(index, /\[Pipeline review\]\(meetings\/pipeline-review.md\)/);
  assert.match(log, /1 personal meetings, and 1 team shared meetings/);
  assert.match(clientDoc, /type: "Electroscope Client"/);
  assert.match(clientDoc, /\[Platform Renewal\]\(\.\.\/deals\/platform-renewal.md\)/);
  assert.match(dealDoc, /\[Taylor Buyer\]\(\.\.\/people\/taylor-buyer.md\)/);
  assert.match(personDoc, /\[Acme Corp\]\(\.\.\/clients\/acme-corp.md\)/);
  assert.match(personalMeetingDoc, /type: "Electroscope Personal Meeting"/);
  assert.match(personalMeetingDoc, /Availability: busy/);
  assert.match(teamMeetingDoc, /type: "Electroscope Team Shared Meeting"/);
  assert.match(teamMeetingDoc, /Classification: internal/);
});

test('normalizeBundle dedupes repeated entities and preserves unique slugs for colliding names', () => {
  const bundle = normalizeBundle({
    scope: 'tenant',
    status: { client_count: 1, deal_count: 1 },
    clients: [{
      id: 'client-1',
      name: 'Acme Corp',
      deals: [{ id: 'deal-1', name: 'Platform Renewal' }],
    }],
    deals: [{
      id: 'deal-1',
      name: 'Platform Renewal',
      client: { id: 'client-1', name: 'Acme Corp' },
      people: [
        { id: 'person-1', name: 'Taylor Buyer' },
        { id: 'person-1', name: 'Taylor Buyer' },
        { id: 'person-2', name: 'Taylor Buyer' },
      ],
    }],
    people: [
      { id: 'person-1', name: 'Taylor Buyer', related_clients: [], related_deals: [] },
      { id: 'person-1', name: 'Taylor Buyer', related_clients: [], related_deals: [] },
      { id: 'person-2', name: 'Taylor Buyer', related_clients: [], related_deals: [] },
    ],
  });

  assert.equal(bundle.people.length, 2);
  assert.deepEqual(bundle.people.map((person) => person.slug), ['taylor-buyer', 'taylor-buyer-person-2']);
  assert.deepEqual(bundle.deals[0].people.map((person) => person.slug), ['taylor-buyer', 'taylor-buyer-person-2']);
});
