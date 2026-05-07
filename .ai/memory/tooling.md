---
name: Tooling & Agent Conventions
description: Script location, .local-scripts symlink warning, local docs location, and docs source-of-truth guidance
type: project
---

# Tooling & Agent Conventions

## Script Location
- Agent/utility scripts go in `.ai/scripts/` (e.g., `scrape-docs.mjs`)
- `.local-scripts/` is a **symlink to the Steam Screeps client folder** — never place tooling there, it maps directly to the live game runtime

## Local Documentation
Scraped Screeps docs are saved locally for convenience:
- `.ai/api-reference/` — local Markdown copy of the Screeps API reference
- `.ai/guides/` — local Markdown copy of the Screeps guides and contributed articles
- Refresh with: `node .ai/scripts/scrape-docs.mjs`

## Source Of Truth
If local docs seem stale, ambiguous, or inconsistent with runtime behavior, treat the official online Screeps docs as the source of truth:
- API reference: `https://docs.screeps.com/api/`
- Guides and reference pages: `https://docs.screeps.com/`
