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

**Entry point:** `src/main.ts` exports `loop()` — the function Screeps calls every game tick. It drives all systems in order: memory cleanup → memory audit (on build change) → emergency defender population control → room controller → tower behavior → assigned job runner → legacy role fallback.

**Module groups:**

- `src/creep/` — shared systems that run once per tick across all creeps:
  - `creep/capabilities.ts` — derives capabilities from body parts, infers archetypes, plans bodies per archetype
  - `creep/jobRunner.ts` — executes assigned jobs (`harvestSource`, `withdrawEnergy`, `build`, `repair`, `upgrade`, remotes, minerals, idle, etc.)
  - `creep/populationControl.ts` — emergency defender spawning when hostiles are present
  - `creep/memoryManagement.ts` — clears dead creep memory; assigns fallback roles to unassigned creeps
  - `creep/harvest.ts` — shared harvest logic used by all roles when they need energy; handles source selection, container fallback, and source load balancing
  - `creep/roleBalance.ts` — legacy role body balancing utilities, still used for defender bodies
  - `creep/movement.ts` — path following, stuck detection, exit navigation, room-edge nudging
  - `creep/traffic.ts` — traffic yield system: request, honour, assign yield positions, compute priorities

- `src/env.ts` — exports `BUILD_COMMIT` from the build-time injected git hash (via rollup `output.banner`)
- `src/memoryAudit.ts` — memory consistency audit that runs once on deploy (commit hash change); cleans orphaned rooms, stale remote plans, invalid creep assignments; reports duplicate source assignments

- `src/role/` — per-creep state machines, each with a `run(creep)` export:
  - `harvester`, `builder`, `upgrader`, `doctor` — legacy fallback behavior after the job runner
  - `defender` — emergency hostile response creep behavior
  - `manual` — stub for manually controlled creeps

- `src/room/` — room-level control:
  - `room/controller.ts` — measures room load, manages source/mineral plans, assigns jobs with reservations, and drives remote planning/spawning (scouting, per-source demand, road/container planning, reserve/claim support)
  - `room/structures.ts` — discovers room structures and classifies links
  - `room/constants.ts` — all magic numbers (tower ratios, recovery thresholds, remote/hauler TTLs, terminal reserves)
  - `room/types.ts` — `RoomControllerContext`, `JobReservations`, `SpawnRequest`, `SourcePlan`, `MineralPlan`, and related types
  - `room/energy.ts` — energy demand, withdrawal/deposit targeting, refill helpers, link management
  - `room/work.ts` — construction, repair, upgrade reservation and targeting helpers
  - `room/source.ts` — source/mineral plan building, static harvest memory, assignment helpers
  - `room/spawn.ts` — home spawn planning: body sizing, demand sizing, pending capability tracking
  - `room/targeting.ts` — `closest`, `closestReachable`, `closestByRange`, heal-target helpers
  - `room/jobMemory.ts` — `setJob`, `setTravelJob`, `setResourceJob`, primary-job memory helpers
  - `room/jobManage.ts` — job retention (`keepCurrentJob`), emergency energy delivery, job validity checks
  - `room/storeUtils.ts` — store utility helpers
  - `room/remote/` — remote mining subsystem:
    - `remote/fleet.ts` — remote creep fleet queries (counts, caps, assignments)
    - `remote/energy.ts` — remote energy source selection and claim tracking
    - `remote/miners.ts` — remote miner station priming, route health, standby assignment
    - `remote/haulers.ts` — remote hauler cycle management
    - `remote/spawn.ts` — remote spawn planning and body sizing
    - `remote/planning.ts` — remote room plan initialisation, road placement, route-health tracking
    - `remote/roads.ts` — remote road site placement and infrastructure site selection
    - `remote/routing.ts` — remote entry/exit path estimation, station finding, route serialisation

- `src/spawn/renewal.ts` — per-tick spawn reservation helper for renew actions
- `src/tower/basics.ts` — runs all towers in the room each tick: attack hostiles → heal creeps → repair urgent structures (cascading priority); walls/ramparts only repaired at ≥ 90 % charge via RCL-staged caps

**Key patterns:**

- The main strategic path assigns `jobType`, `jobTargetId`, and related memory through `room/controller.ts`; `creep/jobRunner.ts` executes those jobs.
- Legacy roles use boolean state flags in creep memory (`dumping`, `building`, `repairing`, `upgrading`) to toggle between harvesting and their primary action.
- `role/doctor.ts` exports shared repair utilities used beyond the legacy role:
  - `repairStructureFilter(structure, rcl)` — imported by `tower/basics.ts` and `room/controller.ts`; applies RCL-staged hit caps for walls/ramparts
  - `wallRampartRepairCap(rcl)` — imported by `room/jobManage.ts` for repair-job validity checks
  - `repairJob(creep)` — called by `role/builder.ts` and `role/harvester.ts` as legacy fallback behavior
- `creep/harvest.ts` is imported by every role that needs to collect energy.
- `creep/capabilities.ts:planBodyForArchetype(archetype, energy, opts)` is the current strategic body planner.
- `creep/roleBalance.ts:balanceSpec(spec, energy)` is a legacy body scaler still used by emergency defenders.
- Clearing a creep's memory is done via `delete Memory.creeps[creep.name]` (not `creep.memory = undefined`).

**Custom types** are in `src/types.d.ts`: extends `CreepMemory`, `RoomMemory`, `SpawnMemory` with bot-specific fields, declares `console`, and defines the `EnergyStructure` union type.

**Toolchain:**
- TypeScript 6, `"moduleResolution": "Bundler"`, `"types": ["screeps"]` (required — Screeps globals aren't in the default lib)
- Rollup outputs CJS (`format: 'cjs'`) since Screeps uses CommonJS internally
- Build injects the current 8-char git commit hash into the bundle banner (`var __BUILD_COMMIT__ = "hash";`) so server-side code can detect new deployments and trigger the memory audit
- `grunt-screeps` reads from `dist/` and pushes `**/*.{js,wasm}`; source maps stay local

## Combat Strategy Notes

When discussing or designing single-creep siege profiles, use:
- `.ai/strategy/solo-siege.md` — tower sustain formulas, per-tier boost requirements, and practical/impractical 1-6 tower body envelopes.

Guardrails:
- Use official Screeps docs (`docs.screeps.com`) as source of truth for boost multipliers.
- Distinguish "paper sustain" from "practical offense": a mathematically stable body can still be operationally impractical if mobility or attack throughput is too low.
- Prefer every-tick `heal(self)` plus same-tick `attack()` over strict heal/attack alternation for tower dives.

## .ai Folder Convention

This project uses `.ai/` for agent-readable project context that doesn't belong in code.

**Structure:**
- `.ai/project-instructions.md` — this file; general guidance for agents
- `.ai/strategy/` — strategy envelopes and tactical calculations that are not code-level architecture
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
- **codegraph.md** — Codegraph call-graph tool: `query`, `callers`, `callees`, `impact`, `context` commands; MCP server setup; per-machine `codegraph init -i` required
