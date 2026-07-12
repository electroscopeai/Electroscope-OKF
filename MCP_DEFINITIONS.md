# Electroscope MCP Definition and OKF Guidance

Electroscope MCP is the runtime source for authenticated, tenant-scoped knowledge retrieval. This repository consumes its read-only tools and writes an Open Knowledge Format bundle; it does not define Electroscope authorization, canonical entities, or source-of-truth data.

## Definition boundary

MCP should expose a compact, versioned description of supported Electroscope-to-OKF concept mappings. That description should include concept types, canonical identifier mappings, provenance requirements, visibility boundary, and schema version. It should not expose arbitrary bundle contents, raw source fragments, credentials, or internal materialization details.

## Current source contract

Call authenticated MCP tool `get_okf_definition` to discover the static `electroscope-to-okf` contract. Version `1.0.0` is a tenant-independent mapping definition stored by the Electroscope MCP service, not a generated sibling-repository bundle.

### Supported concept mappings

| Concept type | Source tools | Canonical source ID | OKF resource |
| --- | --- | --- | --- |
| `Electroscope Client` | `search_clients`, `get_client` | `id` | `electroscope://client/{id}` |
| `Electroscope Deal` | `search_deals`, `get_deal` | `id` | `electroscope://deal/{id}` |
| `Electroscope Person` | `search_people`, `get_person` | `personId` | `electroscope://person/{personId}` |
| `Electroscope Personal Meeting` | `list_my_calendar_events` | `calendar_event_id` | `electroscope://calendar-event/{calendar_event_id}` |
| `Electroscope Team Shared Meeting` | `list_team_shared_meetings` | `team_shared_meeting_id` | `electroscope://team-shared-meeting/{team_shared_meeting_id}` |

Each mapping writes the canonical source ID to OKF frontmatter as `electroscope_id`. Each exported concept must retain the canonical ID, an available source timestamp (or export timestamp for people when unavailable), and the MCP authorization scope used at export time. Meeting exports additionally record their required calendar grant: `calendar.metadata:read` for personal meetings or `calendar.team_availability:read` for team-shared meetings.

### Visibility and export limits

- Client, deal, and person records remain subject to the issuing MCP token, tenant, team, and tool scope checks; non-admin access is reduced to team-visible records.
- Personal meetings are limited to the issuing user. Team meetings require explicit sharing.
- Meeting exports require a bounded time window and include only MCP-permitted redacted metadata.
- The definition does not return or authorize tenant bundle content, customer data, raw source fragments, credentials, or unpublished material.
- `calendar.attendees:read`, `calendar.body:read`, `calendar.join_links:read`, `calendar.transcripts:read`, and `calendar.recaps:read` do not expand the supported OKF mapping contract.
- OKF output is derived and reviewable. It is not canonical Electroscope storage.

### Identity and authorization boundary

- `search_teams` returns only the authenticated user’s active Electroscope `TeamMembership` records.
- OAuth and MCP must not infer teams from OAuth or IdP claims.
- The Electroscope server is responsible for tenant and team authorization before this exporter receives data.

See the primary repository report at `docs/analysis/mcp-enhancements-2-options.md` for staged calendar, financial-goal, task-prioritization, and risk-identification capability options.
