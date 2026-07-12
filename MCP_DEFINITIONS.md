# Electroscope MCP Definition and OKF Guidance

Electroscope MCP is the runtime source for authenticated, tenant-scoped knowledge retrieval. This repository consumes its read-only tools and writes an Open Knowledge Format bundle; it does not define Electroscope authorization, canonical entities, or source-of-truth data.

## Definition boundary

MCP should expose a compact, versioned description of supported Electroscope-to-OKF concept mappings. That description should include concept types, canonical identifier mappings, provenance requirements, visibility boundary, and schema version. It should not expose arbitrary bundle contents, raw source fragments, credentials, or internal materialization details.

## Current source contract

- Client, deal, and person details use canonical IDs returned by MCP.
- `search_teams` returns only the authenticated user’s active Electroscope `TeamMembership` records.
- OAuth and MCP must not infer teams from OAuth or IdP claims.
- The Electroscope server is responsible for tenant and team authorization before this exporter receives data.
- OKF output is derived and reviewable. It is not canonical Electroscope storage.

See the primary repository report at `docs/analysis/mcp-enhancements-2-options.md` for staged calendar, financial-goal, task-prioritization, and risk-identification capability options.
