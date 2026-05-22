# Project Instructions

This file provides guidance to AI agents working in this repository.

## Commands

```bash
npm run build    # compile TypeScript → dist/main.js (via rollup)
npm run push     # push dist/ to the Screeps public server (requires .env)
npm run deploy   # build + push in one shot
npm run watch    # auto-recompile on file save during development
```

Deployment requires a `.env` file (copy from `.env.example`):
```
SCREEPS_EMAIL=...
SCREEPS_TOKEN=...
SCREEPS_BRANCH=default
```

## Architecture

This is a Screeps bot written in TypeScript, bundled by Rollup into a single `dist/main.js` that gets pushed to the Screeps server via `grunt-screeps`.

**Behavior and architecture source of truth:** `architecture/OVERVIEW.md` describes intended runtime behavior and module boundaries. Code changes should align with it, or architecture docs should be updated first.

**Memory consistency:** After each non-trivial code/documentation job, check `.ai/memory/CODEMAP.md`, `.ai/memory/KNOWN_ISSUES.md`, `.ai/memory/ROADMAP.md`, `.ai/memory/MEMORY.md`, and relevant docs under `architecture/` for consistency with the change. Update them when behavior, file ownership, architecture, deferred work, or known issues have changed.

**Entry point:** `src/main.ts` exports `loop()` — the function Screeps calls every game tick (now a thin 77-line orchestrator). Combat logic extracted to `src/combat/`, console APIs to `src/console/`, debug paths to `src/debug/paths.ts`, and renewal logic to `src/renewal/`.

**Module groups:**

- `src/combat/` — hostile detection and combat:
  - `hostiles.ts` — `isHostile()`, `findHostiles()`
  - `flee.ts` — `fleeFromHostiles()`, `retreatRemoteCreepFromHostiles()`, `markRemoteDanger()`
  - `heal.ts` — `emergencyHealTarget()`, `emergencyHealWhileRetreating()`, `mostCriticalInRange()`
  - `defender.ts` — defender combat behavior

- `src/jobs/` — job execution:
  - `runner.ts` — executes assigned jobs (`harvestSource`, `withdrawEnergy`, `build`, `repair`, `upgrade`, remotes, minerals, idle, etc.)

- `src/creeps/` — shared systems and legacy roles:
  - `capabilities.ts` — derives capabilities from body parts, infers archetypes, plans bodies per archetype
  - `memory.ts` — clears dead creep memory; assigns fallback roles to unassigned creeps
  - `harvest.ts` — shared harvest logic used by all roles when they need energy; handles source selection, container fallback, and source load balancing
  - `population.ts` — emergency defender spawning when hostiles are present
  - `roleBalance.ts` — legacy role body balancing utilities, still used for defender bodies
  - `roles/` — legacy fallback state machines: `builder.ts`, `harvester.ts`, `upgrader.ts`, `doctor.ts`, `manual.ts`

- `src/room/` — room-level control:
  - `controller.ts` — measures room load, manages source/mineral plans, assigns jobs with reservations, runs spawn planning, and drives remote planning/spawning
  - `structures.ts` — discovers room structures and classifies links

- `src/renewal/` — creep renewal logic:
  - `home.ts` — `tryRenewHomeCreep()`
  - `standby.ts` — `tryRenewStandbyMiner()`, standby miner parking
  - `spawn.ts` — `acquireRenewSpawn()`, `nearestSpawn()`, `reserveRenewSpawns()`

- `src/tower/` — tower control:
  - `basics.ts` — tower attack, heal, and repair behavior

- `src/console/` — console API:
  - `api.ts` — `installConsoleHelpers()`, `remoteMining` API

- `src/debug/` — debug output:
  - `index.ts` — `tickAutoDebug()`, `tickRemoteCreepLog()`, `installDebugHelpers()`
  - `paths.ts` — `installMoveDebugHook()`, debug path colors

- `src/audit/` — memory audit:
  - `memory.ts` — `runFullAudit()`, cleans orphaned rooms, stale remote plans, etc.

- `src/utils/` — shared helpers:
  - `path.ts` — `nudgeFromRoomEdge()`, `mirrorExitPositionIntoRoom()`
  - `creep.ts` — `mostCriticalCreep()`, `firstStoredResource()`

- `src/constants/` — shared constants:
  - `index.ts` — `BODY_BUDGET_RATIO`, `BODY_MIN_BUDGET`, `MAX_CARRY_CAPACITY`, `REMOTE_DANGER_TICKS`

- `src/env.ts` — exports `BUILD_COMMIT` from the build-time injected git hash (via rollup `output.banner`)

**Key patterns:**

- The main strategic path assigns `jobType`, `jobTargetId`, and related memory through `room/controller.ts`; `jobs/runner.ts` executes those jobs.
- Legacy roles use boolean state flags in creep memory (`dumping`, `building`, `repairing`, `upgrading`) to toggle between harvesting and their primary action.
- `creeps/roles/doctor.ts` exports shared repair utilities used beyond the legacy role:
  - `repairStructureFilter(structure, rcl)` — imported by `tower/basics.ts` and `room/controller.ts`; applies RCL-staged hit caps for walls/ramparts
  - `wallRampartRepairCap(rcl)` — imported by `room/controller.ts` for repair-job validity checks
  - `repairJob(creep)` — called by `creeps/roles/builder.ts` and `creeps/roles/harvester.ts` as legacy fallback behavior
- `creeps/harvest.ts` is imported by every role that needs to collect energy.
- `creeps/capabilities.ts` contains `planBodyForArchetype(archetype, energy, opts)` (the current strategic body planner).
- `creeps/roleBalance.ts` contains `balanceSpec(spec, energy)` (a legacy body scaler still used by emergency defenders).
- `utils/creep.ts` provides `mostCriticalCreep()` and `firstStoredResource()`.
- `utils/path.ts` provides `nudgeFromRoomEdge()` and `mirrorExitPositionIntoRoom()`.
- Clearing a creep's memory is done via `delete Memory.creeps[creep.name]` (not `creep.memory = undefined`).

**Custom types** are in `src/types.d.ts`: extends `CreepMemory`, `RoomMemory`, `SpawnMemory` with bot-specific fields, declares `console`, and defines the `EnergyStructure` union type.

**Toolchain:**
- TypeScript 6, `"moduleResolution": "Bundler"`, `"types": ["screeps"]` (required — Screeps globals aren't in the default lib)
- Rollup outputs CJS (`format: 'cjs'`) since Screeps uses CommonJS internally
- Build injects the current 8-char git commit hash into the bundle banner (`var __BUILD_COMMIT__ = "hash";`) so server-side code can detect new deployments and trigger the memory audit
- `grunt-screeps` reads from `dist/` and pushes `**/*.{js,wasm}`; source maps stay local

## .ai Folder Convention

This project uses `.ai/` for agent-readable project context that doesn't belong in code.

**Structure:**
- `.ai/project-instructions.md` — this file; general guidance for agents
- `.ai/memory/` — persistent project knowledge (decisions, architecture notes, gotchas)
- `.ai/session/` — session folders named `yyyy-mm-dd-agentname-title/`, each containing `notes.md` plus any other files the agent wants to store (plans, diffs, screenshots, etc.)

**When to write a session folder:** Create one when a session contains plans, non-obvious decisions, or context that would be useful if this conversation were compacted or resumed later. Use it to survive context compression — record what was decided and why, not just what was done. Always create `notes.md` as the primary entry point; add other files to the folder as needed.

**When to write a memory file:** Add to `.ai/memory/` when you learn something durable about the project that isn't derivable from the code — constraints, tradeoffs, gotchas, stakeholder requirements.

**Documentation truth:** `.ai/api-reference/` and `.ai/guides/` are convenience snapshots. When in doubt, check the official online Screeps docs at `https://docs.screeps.com/api/` and `https://docs.screeps.com/` as the source of truth.

## screepsconsole

`screeps_console/` is a git submodule cloned from https://github.com/screepers/screeps_console. It provides a terminal UI for interacting with the Screeps server programmatically — agents in Maestri can use it instead of the OCR-based portal.

**Python environment:** An isolated venv lives at `screeps_console/.venv/` (created with `uv`, never touches system Python or conda). To recreate it from scratch:

```bash
uv venv screeps_console/.venv
# relaxed installs — requirements.txt pins old versions that no longer resolve
uv pip install --python /path/to/screeps-agent/screeps_console/.venv colorama nose PyYAML requests screepsapi six urwid websocket-client
# setuptools<70 required — 70+ dropped pkg_resources as a top-level module
uv pip install --python /path/to/screeps-agent/screeps_console/.venv "setuptools<70"
uv pip install --python /path/to/screeps-agent/screeps_console/.venv -e screeps_console/
```

**Invoking screepsconsole** (interactive terminal only — no --help flag):

```bash
# activate venv, then run from project root (Python adds the script's dir to sys.path automatically)
source screeps_console/.venv/bin/activate
python screeps_console/screeps_console/interactive.py

# or one-liner without activating:
screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py
```

Config is saved to `~/.screepsconsole.yaml` on first run (credentials stored there).

**Auto-logging:** The console automatically logs all I/O (incoming game messages + outgoing commands) to daily NDJSON files in `screeps_console/logs/screeps_console_YYYY-MM-DD.json`. Each line is a JSON object with `ts` (timestamp), `direction` (`"in"` or `"out"`), `shard`, `line` (message text), and `type` (for incoming messages). This allows agents to inspect recent tick history without the UI running. See `screeps_console/README.md` for details.

## End-of-task reporting

When completing edit tasks, close with a concise report:

```
Brief description of the change

the change includes: specific details about what was modified
```

This format helps track what was done without verbose preamble.

**Git workflow:** Never run `git add` or `git commit` autonomously. The user controls all git operations. When edits are complete, they will decide whether and when to commit.

## Memory Index

Quick reference for persistent project knowledge:

- **project-vision.md** — AI-assisted play model: user owns strategy (expansion, defense, resource decisions), agents own implementation (code, optimization)
- **maestri_portals.md** — Commands & workflow for reading game state via Maestri portal (navigate, snapshot, evaluate, screenshot) with key URLs
- **tooling.md** — Script location (.ai/scripts/), .local-scripts symlink warning, local docs location, and official online docs as source of truth
