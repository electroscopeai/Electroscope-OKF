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

test('writeBundle preserves client meeting summaries, upcoming context, Meeting Prep, and client links without raw source fields', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electroscope-okf-client-meetings-'));
  const bundle = normalizeBundle({
    scope: 'tenant',
    status: { client_count: 1, deal_count: 0 },
    clients: [{ id: 'client-1', name: 'Acme Corp', deals: [] }],
    deals: [],
    people: [],
    canonicalMeetings: [{
      client_id: 'client-1',
      client: { id: 'client-1', name: 'Acme Corp' },
      meeting: { canonical_meeting_id: 'meeting-1', subject: 'Architecture review', started_at: '2026-07-02T12:00:00.000Z', deal_id: null },
      canonical_summary: { rendered: { purpose: 'Confirm architecture', key_points: ['Confirm security review'], action_items: ['Send diagram'] } },
      provenance: { authority: 'canonical_meeting_summary', generated_at: '2026-07-02T13:00:00.000Z', prompt_version: 'v1', person_resolution_fingerprint: 'fingerprint-1' },
      raw_transcript: 'must not be rendered',
    }],
    upcomingClientMeetings: [{ client_id: 'client-1', upcoming_meeting_id: 'upcoming-1', subject: 'Planning session', start_at: '2026-07-03T12:00:00.000Z', prep_status: 'ready', source_snapshot: { secret: true } }],
    meetingPreparations: [{
      client_id: 'client-1',
      client: { id: 'client-1', name: 'Acme Corp' },
      preparation: { id: 'prep-1', summary: { rendered: { purpose: 'Prepare agenda', key_points: ['Review risks'], action_items: ['Confirm owner'] } }, generated_at: '2026-07-03T10:00:00.000Z', source_fingerprint: 'source-1', latest_meeting_id: 'meeting-1', prompt_version: 'v2' },
      validity: { status: 'active_meeting_set_match' },
    }],
  });

  await writeBundle({ outDir, bundle });

  const index = await fs.readFile(path.join(outDir, 'index.md'), 'utf8');
  const client = await fs.readFile(path.join(outDir, 'clients', 'acme-corp.md'), 'utf8');
  const summary = await fs.readFile(path.join(outDir, 'meetings', 'architecture-review.md'), 'utf8');
  const upcoming = await fs.readFile(path.join(outDir, 'meetings', 'planning-session.md'), 'utf8');
  const preparation = await fs.readFile(path.join(outDir, 'meetings', 'meeting-preparation-for-acme-corp.md'), 'utf8');

  assert.match(index, /## Canonical Client Meeting Summaries/);
  assert.match(index, /## Upcoming Client Meeting Context/);
  assert.match(index, /## Client Meeting Preparation/);
  assert.match(client, /# Meeting Knowledge/);
  assert.match(summary, /type: "Electroscope Canonical Client Meeting"/);
  assert.match(summary, /Confirm security review/);
  assert.doesNotMatch(summary, /must not be rendered/);
  assert.match(upcoming, /type: "Electroscope Upcoming Client Meeting Context"/);
  assert.doesNotMatch(upcoming, /source_snapshot/);
  assert.match(preparation, /type: "Electroscope Client Meeting Preparation"/);
  assert.match(preparation, /Validity: active_meeting_set_match/);
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

test('writeBundle exports approved workspaces with allowlisted fields, provenance, and collision-safe meeting names', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electroscope-okf-workspaces-'));
  const bundle = normalizeBundle({
    scope: 'team',
    contract: { contractName: 'electroscope-to-okf', contractVersion: '1.3.0' },
    exportedAt: '2026-07-04T00:00:00.000Z',
    status: { client_count: 1, deal_count: 1 },
    clients: [{ id: 'client-1', name: 'Acme', deals: [] }],
    deals: [{ id: 'deal-1', name: 'Renewal', client: { id: 'client-1', name: 'Acme' }, people: [] }],
    people: [],
    teams: [{ id: 'team-1', name: 'Revenue' }],
    personalMeetings: [{ calendar_event_id: 'personal-1', subject: 'Weekly review', start_at: '2026-07-04T10:00:00.000Z' }],
    teamMeetings: [{ team_shared_meeting_id: 'team-meeting-1', subject: 'Weekly review', start_at: '2026-07-04T11:00:00.000Z' }],
    dealWorkspaces: [{ deal: { id: 'deal-1', name: 'Renewal' }, milestones: [{ provenance: { canonical_entity_id: 'milestone-1', source_document_ids: ['doc-1'] } }], risks: [], action_items: [{ id: 'action-1', deal_id: 'deal-1', title: 'Send plan', note: 'must not export', status: 'open', updated_at: '2026-07-04T00:00:00.000Z', provenance: { canonical_entity_id: 'action-1', source_document_ids: ['doc-1'] } }] }],
    clientWorkspaces: [{ client_id: 'client-1', client_name: 'Acme', risks: [{ id: 'risk-1', risk: 'Delay', mitigation: 'Escalate' }], initiatives: [{ id: 'initiative-1', name: 'Upgrade', description: 'must not export', owner: { personId: 'person-1', title: 'VP' } }], provenance: { source: 'canonical_client_detail_read_model', attribution_snippets_included: false } }],
    teamActionItemIndexes: [{ team_id: 'team-1', action_items: [{ id: 'action-1', deal_id: 'deal-1', title: 'Send plan', note: 'must not export', status: 'open', provenance: { canonical_entity_id: 'action-1', source_document_ids: ['doc-1'] } }] }],
  });
  await writeBundle({ outDir, bundle });

  const dealWorkspace = await fs.readFile(path.join(outDir, 'deal-workspaces', 'deal-workspace-renewal.md'), 'utf8');
  const clientWorkspace = await fs.readFile(path.join(outDir, 'client-workspaces', 'client-workspace-acme.md'), 'utf8');
  const actionIndex = await fs.readFile(path.join(outDir, 'team-action-items', 'team-action-items-revenue.md'), 'utf8');
  const team = await fs.readFile(path.join(outDir, 'teams', 'revenue.md'), 'utf8');
  const index = await fs.readFile(path.join(outDir, 'index.md'), 'utf8');
  assert.match(dealWorkspace, /contract_version: "1.3.0"/);
  assert.match(dealWorkspace, /export_scope: "team"/);
  assert.match(dealWorkspace, /Source document IDs: doc-1/);
  assert.doesNotMatch(dealWorkspace, /must not export/);
  assert.doesNotMatch(clientWorkspace, /must not export/);
  assert.doesNotMatch(actionIndex, /must not export/);
  assert.match(team, /team-action-items\/team-action-items-revenue.md/);
  assert.match(actionIndex, /\[Send plan\]\(\.\.\/deals\/renewal.md\)/);
  assert.match(index, /meetings\/weekly-review.md/);
  assert.match(index, /meetings\/weekly-review-team_sha.md/);
});
