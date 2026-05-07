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

**Entry point:** `src/main.ts` exports `loop()` — the function Screeps calls every game tick. It drives all systems in order: spawn balancing → tower → memory cleanup → population control → per-creep role execution.

**Module groups:**

- `src/creep.*.ts` — shared systems that run once per tick across all creeps:
  - `creep.roleBalance.ts` — energy counting, body-part scaling, auto-spawn, builder/upgrader/harvester rebalancing
  - `creep.populationControl.ts` — enforces minimum populations (2 harvesters, 1 builder, 1 upgrader, 1 doctor)
  - `creep.memoryManagement.ts` — clears dead creep memory; assigns random roles to unassigned creeps
  - `creep.harvest.ts` — shared harvest logic used by all roles when they need energy; handles source selection, container fallback, and source load balancing

- `src/role.*.ts` — per-creep state machines, each with a `run(creep)` export:
  - `harvester` — dumps energy into extensions/spawn/towers; falls back to repair via `role.doctor`
  - `builder` — builds construction sites; falls back to repair via `role.doctor`
  - `upgrader` — upgrades the room controller
  - `doctor` — heals damaged creeps, then repairs structures
  - `manual` — stub for manually controlled creeps

- `src/tower.basics.ts` — runs all towers in the room each tick: attack hostiles → heal creeps → repair urgent structures (cascading priority)

**Key patterns:**

- All roles use a boolean state flag in creep memory (`dumping`, `building`, `repairing`, `upgrading`) to toggle between harvesting and their primary action.
- `role.doctor.repairJob()` and `role.doctor.repairStructureFilter()` are shared utilities imported by `role.builder`, `role.harvester`, and `tower.basics`.
- `creep.harvest.ts` is imported by every role that needs to collect energy.
- `creep.roleBalance.balanceSpec(spec, energy)` scales body-part ratios to the available energy budget.
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
