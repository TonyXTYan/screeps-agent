---
name: Tooling & Agent Conventions
description: Script location, .local-scripts symlink warning, local docs location, docs source-of-truth guidance, and GitHub workflow preference
type: project
---

# Tooling & Agent Conventions

## Script Location
- Agent/utility scripts go in `.ai/scripts/` (e.g., `scrape-docs.mjs`)
- `.local-scripts/` is a **symlink to the Steam Screeps client folder** — never place tooling there, it maps directly to the live game runtime
- Use `.ai/scripts/check-screeps-recovery-regressions.py <logfile>` to summarize Screeps console NDJSON and flag recovery-pull mismatches, remote-hauler renew loops, home energy flatlines, and stale recovery pull after full energy.

## Local Documentation
Scraped Screeps docs are saved locally for convenience:
- `.ai/api-reference/` — local Markdown copy of the Screeps API reference
- `.ai/guides/` — local Markdown copy of the Screeps guides and contributed articles
- Refresh with: `node .ai/scripts/scrape-docs.mjs`

## Source Of Truth
If local docs seem stale, ambiguous, or inconsistent with runtime behavior, treat the official online Screeps docs as the source of truth:
- API reference: `https://docs.screeps.com/api/`
- Guides and reference pages: `https://docs.screeps.com/`

## Codegraph (Code Intelligence)
Codegraph is installed and initialized in this project (`.codegraph/` is gitignored — each developer runs `codegraph init -i` once).

Key uses for agents:
- `codegraph query "symbol"` — find a function/constant by name and its file:line
- `codegraph callers "fn"` / `codegraph callees "fn"` — call-graph traversal without grep
- `codegraph impact "symbol"` — list all symbols affected by a change (pre-refactor check)
- `codegraph context "task description"` — outputs relevant source snippets for a natural-language task
- `codegraph sync` — re-sync index after file edits (auto if MCP server is running)

Full reference: `.ai/memory/codegraph.md` — also covers MCP server setup (`codegraph install -t claude -y`) and new-machine setup.

## GitHub Workflow Preference
- Prefer `gh` CLI for GitHub write actions in this repo (posting PR comments, reviews, resolving threads, etc.).
- The Codex GitHub app/connector is fine for read operations, but write actions can fail with `403 Resource not accessible by integration`.
- If both tools are available, default to: connector for reads, `gh` for writes.
