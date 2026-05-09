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

**Strategy source of truth:** `.ai/memory/STRATEGY.md` describes the intended game behavior. Code changes should align with that strategy, or the strategy should be updated first.

**Memory consistency:** After each non-trivial code or strategy job, check `.ai/memory/STRATEGY.md`, `.ai/memory/CODEMAP.md`, `.ai/memory/CURRENT_ARCHITECTURE.md`, `.ai/memory/KNOWN_ISSUES.md`, `.ai/memory/ROADMAP.md`, and `.ai/memory/MEMORY.md` for consistency with the change. Update them when behavior, file ownership, architecture, deferred work, or known issues have changed.

**Entry point:** `src/main.ts` exports `loop()` — the function Screeps calls every game tick. It drives all systems in order: memory cleanup → emergency defender population control → room controller → tower behavior → assigned job runner → legacy role fallback.

**Module groups:**

- `src/creep.*.ts` — shared systems that run once per tick across all creeps:
  - `creep.capabilities.ts` — derives capabilities from body parts, infers archetypes, plans bodies per archetype
  - `creep.jobRunner.ts` — executes assigned jobs (`harvestSource`, `withdrawEnergy`, `build`, `repair`, `upgrade`, remotes, minerals, idle, etc.)
  - `creep.populationControl.ts` — emergency defender spawning when hostiles are present
  - `creep.memoryManagement.ts` — clears dead creep memory; assigns fallback roles to unassigned creeps
  - `creep.harvest.ts` — shared harvest logic used by all roles when they need energy; handles source selection, container fallback, and source load balancing
  - `creep.roleBalance.ts` — legacy role body balancing utilities, still used for defender bodies

- `src/role.*.ts` — per-creep state machines, each with a `run(creep)` export:
  - `harvester`, `builder`, `upgrader`, `doctor` — legacy fallback behavior after the job runner
  - `defender` — emergency hostile response creep behavior
  - `manual` — stub for manually controlled creeps

- `src/room.*.ts` — room-level control:
  - `room.controller.ts` — measures room load, manages source/mineral plans, assigns jobs with reservations, runs spawn planning, and drives remote planning/spawning (scouting, per-source demand, road/container planning, reserve/claim support)
  - `room.structures.ts` — discovers room structures and classifies links

- `src/tower.basics.ts` — runs all towers in the room each tick: attack hostiles → heal creeps → repair urgent structures (cascading priority); walls/ramparts only repaired at ≥ 90 % charge via RCL-staged caps

**Key patterns:**

- The main strategic path assigns `jobType`, `jobTargetId`, and related memory through `room.controller.ts`; `creep.jobRunner.ts` executes those jobs.
- Legacy roles use boolean state flags in creep memory (`dumping`, `building`, `repairing`, `upgrading`) to toggle between harvesting and their primary action.
- `role.doctor` exports shared repair utilities used beyond the legacy role:
  - `repairStructureFilter(structure, rcl)` — imported by `tower.basics` and `room.controller`; applies RCL-staged hit caps for walls/ramparts
  - `wallRampartRepairCap(rcl)` — imported by `room.controller` for repair-job validity checks
  - `repairJob(creep)` — called by `role.builder` and `role.harvester` as legacy fallback behavior
- `creep.harvest.ts` is imported by every role that needs to collect energy.
- `creep.capabilities.planBodyForArchetype(archetype, energy, opts)` is the current strategic body planner.
- `creep.roleBalance.balanceSpec(spec, energy)` is a legacy body scaler still used by emergency defenders.
- Clearing a creep's memory is done via `delete Memory.creeps[creep.name]` (not `creep.memory = undefined`).

**Custom types** are in `src/types.d.ts`: extends `CreepMemory`, `RoomMemory`, `SpawnMemory` with bot-specific fields, declares `console`, and defines the `EnergyStructure` union type.

**Toolchain:**
- TypeScript 6, `"moduleResolution": "Bundler"`, `"types": ["screeps"]` (required — Screeps globals aren't in the default lib)
- Rollup outputs CJS (`format: 'cjs'`) since Screeps uses CommonJS internally
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

## Memory Index

Quick reference for persistent project knowledge:

- **project-vision.md** — AI-assisted play model: user owns strategy (expansion, defense, resource decisions), agents own implementation (code, optimization)
- **maestri_portals.md** — Commands & workflow for reading game state via Maestri portal (navigate, snapshot, evaluate, screenshot) with key URLs
- **tooling.md** — Script location (.ai/scripts/), .local-scripts symlink warning, local docs location, and official online docs as source of truth
