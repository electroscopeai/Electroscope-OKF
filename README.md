# Electroscope-OKF

Electroscope-OKF is a proof-of-concept sibling repository for exporting Electroscope workspace knowledge into the Open Knowledge Format documented by Google Cloud's knowledge-catalog project.

Primary OKF references:
- https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/

## Purpose

This repo couples Electroscope's remote MCP interface with an OKF bundle writer so client, deal, and person knowledge can be captured as markdown plus YAML frontmatter.

The goal is not to replace Electroscope APIs or internal storage. The goal is to create a portable, diffable, reviewable knowledge bundle that can be inspected by humans and agents.

## Current proof of concept

The exporter calls Electroscope MCP read-only tools:
- `get_status`
- `search_clients`
- `get_client`
- `search_deals`
- `get_deal`
- `search_people`
- `get_person`
- `get_okf_definition` for the static, versioned export contract

It then writes an OKF bundle with:
- `index.md`
- `log.md`
- `clients/*.md`
- `deals/*.md`
- `people/*.md`

## OKF implementation choices

These choices follow the upstream OKF draft and its best practices:
- one markdown file per concept
- required `type` frontmatter on every concept
- recommended `title`, `description`, `resource`, `tags`, and `timestamp` fields
- bundle-relative markdown links for stable cross-linking
- generated `index.md` for progressive disclosure
- generated `log.md` so process and data-shape changes can be reviewed in git
- no proprietary schema registry; extra producer-defined fields stay in frontmatter

## Repository layout

```text
Electroscope-OKF/
├── bundles/
├── src/
│   ├── export-electroscope-okf.mjs
│   └── lib/
│       ├── mcp-client.mjs
│       └── okf-bundle.mjs
└── test/
```

## Usage

Create an Electroscope MCP token first. See `electroscope/docs/integrations/electroscope-mcp-setup.md` in the main repo.

Then run:

```bash
cd ../Electroscope-OKF
node src/export-electroscope-okf.mjs \
  --base-url http://localhost:3003 \
  --mcp-token <token> \
  --tenant-slug local-tech-tide \
  --out ./bundles/local-tech-tide
```

Optional flags:
- `--scope team|tenant` default `tenant`
- `--client-query <text>` default empty
- `--deal-query <text>` default empty
- `--person-query <text>` default empty
- `--limit <n>` default `25`
- `--team-id <uuid>`, `--meeting-start-at <ISO-8601>`, and `--meeting-end-at <ISO-8601>` must be supplied together to export both the issuing user’s redacted calendar events and explicitly shared team meetings

Meeting export is opt-in because it writes portable calendar metadata. It requires an MCP token with `calendar.metadata:read` and `calendar.team_availability:read` in addition to the standard read scope.

## MCP and OKF definition boundary

The exporter must treat authenticated MCP `get_okf_definition` as the source for the static `electroscope-to-okf` mapping contract. The contract is tenant-independent and versioned; it defines supported concept types, canonical IDs and resources, provenance, visibility, and export limits without exposing a generated bundle or customer content.

See [`MCP_DEFINITIONS.md`](./MCP_DEFINITIONS.md) for the current consumer contract.

## Release workflow note

When Electroscope data shapes, MCP tools, or workflow semantics change, refresh the staged OKF bundle in this repository and review the git diff before promoting `develop` to `main`.

Recommended steps:
1. point the exporter at staging
2. regenerate the target bundle
3. review `index.md`, `log.md`, and concept diff changes
4. commit the OKF update in this repository
5. link the OKF commit in the Electroscope release notes or workflow context

## Test

```bash
npm test
```
