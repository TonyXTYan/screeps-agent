---
name: Codegraph
description: Codegraph call-graph / symbol-search tool installed in this project — commands, MCP server setup, and what it's useful for
type: reference
---

# Codegraph

[github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)

Installed globally via Homebrew (`/opt/homebrew/bin/codegraph`). Each developer runs `codegraph init -i` once to build the local index at `.codegraph/codegraph.db` (SQLite, ~2.5 MB). The directory is gitignored — it's a per-machine artifact.

## What It Does

Builds a **static knowledge graph** of the codebase: 864 nodes (functions, constants, interfaces, imports, files, variables, type aliases, classes) and 2,198 edges across 42 TypeScript source files. Answers questions like:
- "What calls this function?" → `callers`
- "What does this function call?" → `callees`
- "What would break if I change this symbol?" → `impact`
- "What files/symbols are relevant to this task?" → `context`

## Key Commands

```bash
# Search for a symbol by name (fuzzy)
codegraph query "chooseSpawnRequest"

# Who calls this function?
codegraph callers "assignRemoteCreep"

# What does this function call?
codegraph callees "runSpawnPlanner"

# What gets affected if I change this symbol?
codegraph impact "RoomControllerContext"

# Build task context (natural language → relevant code + source, as markdown)
codegraph context "remote hauler cycle management"

# Show project file tree with symbol counts
codegraph files

# Check index stats
codegraph status

# Sync index after file changes (faster than full reindex)
codegraph sync

# Full reindex from scratch
codegraph index
```

## MCP Server Mode

Codegraph can run as an MCP server so AI agents call its tools directly instead of via Bash.

**To install for Claude Code (global):**
```bash
codegraph install -t claude -y
```

This adds to `~/.claude.json`:
```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

When the MCP server is running it also **auto-syncs the index** on file changes (no need to run `codegraph sync` manually).

## Is It Useful for Agents?

**Yes, especially for:**

1. **Call-chain tracing without grep** — `callers`/`callees` give exact paths. E.g. finding who calls `assignRemoteCreep` returns `loop` in `main.ts` instantly, no file reading needed.

2. **Refactor impact analysis** — `impact "RoomControllerContext"` returns all 71 affected symbols across 10 files instantly. Run before any signature change.

3. **Task-oriented context** — `context "spawn planning"` outputs the most relevant functions with source code in one markdown block. Good starting point for a new edit task.

4. **Symbol location after reorganization** — `query "keepCurrentJob"` finds the exact new file:line after modules were split, without knowing where it moved.

**Less useful for:**
- Runtime behavior (static analysis only; no memory/game-state tracing)
- Screeps API call detection (Screeps globals aren't in the type graph)
- Full code review (output is truncated; use `Read` for that)

## Setup on a New Machine

```bash
# Install globally
npm install -g codegraph   # or: brew install codegraph

# Initialize in the project root
cd /path/to/screeps-agent
codegraph init -i

# Optionally wire up the MCP server for Claude Code
codegraph install -t claude -y
```

**Related:** [[CODEMAP]], [[tooling]]
