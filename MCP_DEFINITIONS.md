# Electroscope MCP Definition and OKF Guidance

Electroscope MCP is the runtime source for authenticated, tenant-scoped knowledge retrieval. This repository consumes its read-only tools and writes an Open Knowledge Format bundle; it does not define Electroscope authorization, canonical entities, or source-of-truth data.

## Definition boundary

MCP should expose a compact, versioned description of supported Electroscope-to-OKF concept mappings. That description should include concept types, canonical identifier mappings, provenance requirements, visibility boundary, and schema version. It should not expose arbitrary bundle contents, raw source fragments, credentials, or internal materialization details.

## Current source contract

Call authenticated MCP tool `get_okf_definition` to discover the static `electroscope-to-okf` contract. Version `1.2.0` is a tenant-independent mapping definition stored by the Electroscope MCP service, not a generated sibling-repository bundle.

### Supported concept mappings

The exporter requires the authenticated `electroscope-to-okf` contract at compatible version `1.3.x` or later within major version `1`. It fails closed when the approved Team and workspace mappings or their explicit field allowlists are absent. Every generated concept records `contract_version`, `export_scope`, `mcp_authorization_scope`, and `exported_at` frontmatter.

| Concept type | Source tools | Canonical source ID | OKF resource |
| --- | --- | --- | --- |
| `Electroscope Client` | `search_clients`, `get_client` | `id` | `electroscope://client/{id}` |
| `Electroscope Deal` | `search_deals`, `get_deal` | `id` | `electroscope://deal/{id}` |
| `Electroscope Person` | `search_people`, `get_person` | `personId` | `electroscope://person/{personId}` |
| `Electroscope Team` | `search_teams` | `id` | `electroscope://team/{teamId}` |
| `Electroscope Deal Workspace` | `get_deal_workspace` | `deal.id` | `electroscope://deal/{dealId}/workspace` |
| `Electroscope Team Action Item Index` | `list_team_action_items` | `team_id` | `electroscope://team/{teamId}/action-items` |
| `Electroscope Client Workspace` | `get_client_workspace` | `client_id` | `electroscope://client/{clientId}/workspace` |
| `Electroscope Personal Meeting` | `list_my_calendar_events` | `calendar_event_id` | `electroscope://calendar-event/{calendar_event_id}` |
| `Electroscope Team Shared Meeting` | `list_team_shared_meetings` | `team_shared_meeting_id` | `electroscope://team-shared-meeting/{team_shared_meeting_id}` |
| `Electroscope Canonical Client Meeting` | `list_client_meeting_timeline`, `get_past_client_meeting_summary` | `canonical_meeting_id` | `electroscope://client/{client_id}/meeting/{canonical_meeting_id}` |
| `Electroscope Upcoming Client Meeting Context` | `list_client_upcoming_meetings` | `upcoming_meeting_id` | `electroscope://client/{client_id}/upcoming-meeting/{upcoming_meeting_id}` |
| `Electroscope Client Meeting Preparation` | `get_client_meeting_preparation` | `preparation.id` | `electroscope://client/{client_id}/meeting-preparation` |

Each mapping writes the canonical source ID to OKF frontmatter as `electroscope_id`. Each exported concept must retain the canonical ID, an available source timestamp (or export timestamp for people when unavailable), and the MCP authorization scope used at export time. Workspace projections are field-allowlisted: deal workspaces retain deal identity/stage, action-item metadata, and bounded provenance only; client workspaces retain risks, initiatives, approved owner identifiers, and `attribution_snippets_included=false`; team indexes retain action-item metadata and bounded provenance only. Action-item notes, initiative descriptions, raw document content, and attribution snippets are never written. Meeting exports additionally record their required calendar grant: `calendar.metadata:read` for personal meetings or `calendar.team_availability:read` for team-shared meetings. Canonical client meeting summaries, upcoming client context, and Meeting Prep record canonical IDs and their persisted provenance under `read_only`; Meeting Prep is written only when MCP confirms active-meeting-set validity and a source fingerprint.

### Visibility and export limits

- Client, deal, and person records remain subject to the issuing MCP token, tenant, team, and tool scope checks; non-admin access is reduced to team-visible records.
- Personal meetings are limited to the issuing user. Team meetings require explicit sharing. Upcoming client meeting context is also limited to the issuing user, even when the client is team-visible.
- Calendar meeting exports require a bounded time window and include only MCP-permitted redacted metadata. Client meeting timelines and upcoming context use bounded opaque pagination; detailed canonical summaries require an explicitly returned canonical meeting ID.
- The definition does not return or authorize tenant bundle content, customer data, raw source fragments, credentials, or unpublished material.
- Canonical client meeting and Meeting Prep projections exclude raw transcripts, source-document content, calendar bodies, attendees, join links, source snapshots, and unresolved owner text.
- `calendar.attendees:read`, `calendar.body:read`, `calendar.join_links:read`, `calendar.transcripts:read`, and `calendar.recaps:read` do not expand the supported OKF mapping contract.
- OKF output is derived and reviewable. It is not canonical Electroscope storage.

### Identity and authorization boundary

- `search_teams` returns only the authenticated user’s active Electroscope `TeamMembership` records. Team documents contain only the canonical team ID and name.
- OAuth and MCP must not infer teams from OAuth or IdP claims.
- The Electroscope server is responsible for tenant and team authorization before this exporter receives data.

See the primary repository report at `docs/analysis/mcp-enhancements-2-options.md` for staged calendar, financial-goal, task-prioritization, and risk-identification capability options.
