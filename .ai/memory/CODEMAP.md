---
name: Code Map
description: Quick mapping from strategy concepts to implementation files
type: project
---

# Code Map

Use this as the first stop before editing code.

## Tick Flow

- `src/main.ts` — Screeps `loop()` entry point and top-level ordering
- `src/creep.memoryManagement.ts` — dead creep memory cleanup and fallback role initialization
- `src/creep.populationControl.ts` — emergency defender spawning before economic spawn planning
- `src/room.controller.ts` — main room-level economic controller
- `src/tower.basics.ts` — tower attack, heal, and repair behavior
- `src/creep.jobRunner.ts` — executes assigned jobs before legacy role fallback

## Strategy To Code

- Strategy contract — `.ai/memory/STRATEGY.md`
- Current architecture notes — `.ai/memory/CURRENT_ARCHITECTURE.md`
- Known follow-up work — `.ai/memory/KNOWN_ISSUES.md`
- RCL/labs/power deferred work — `.ai/memory/ROADMAP.md`

## Core Economy

- Source/mineral planning — `src/room.controller.ts`
- Link classification — `src/room.structures.ts`
- Spawn demand selection — `src/room.controller.ts`
- Body capability derivation — `src/creep.capabilities.ts`
- Body planning by archetype — `src/creep.capabilities.ts`
- Hauling, refill, build, repair, upgrade assignment — `src/room.controller.ts`
- Job execution for those assignments — `src/creep.jobRunner.ts`

## Types And Memory

- Creep, room, spawn memory extensions — `src/types.d.ts`
- Job type union — `src/types.d.ts`
- Archetype union — `src/types.d.ts`
- Room plan and load memory — `src/types.d.ts`
- Runtime Memory writes for structures/load/plans — `src/room.controller.ts`, `src/room.structures.ts`

## Legacy Compatibility

- Legacy role balancing helpers — `src/creep.roleBalance.ts`
- Legacy direct harvesting helper — `src/creep.harvest.ts`
- Legacy fallback roles — `src/role.harvester.ts`, `src/role.builder.ts`, `src/role.upgrader.ts`, `src/role.doctor.ts`
- Emergency defender behavior — `src/role.defender.ts`
- Manual role stub — `src/role.manual.ts`

Legacy role files should not be the primary path for new strategic behavior.

## Common Edit Paths

Adding a new local economy job:

1. Add the job to `CreepJobType` in `src/types.d.ts`.
2. Add execution in `src/creep.jobRunner.ts`.
3. Add assignment and reservation logic in `src/room.controller.ts`.
4. Add or update capability/body planning in `src/creep.capabilities.ts` if needed.
5. Update `.ai/memory/STRATEGY.md` if behavior changes.

Adding a new strategic Memory setting:

1. Update `src/types.d.ts`.
2. Initialize defaults in `src/room.controller.ts`.
3. Read the setting in assignment or spawn planning.
4. Add an example in `.ai/memory/STRATEGY.md`.

Changing construction priority:

1. Update `.ai/memory/STRATEGY.md`.
2. Update `constructionPriority()` in `src/room.controller.ts`.
3. Validate in-game that builders choose the intended sites.

Changing remote behavior:

1. Update `.ai/memory/STRATEGY.md`.
2. Update `RemoteRoomPlan` in `src/types.d.ts` if the config changes.
3. Update `remoteSpawnRequest()` and `assignRemoteCreep()` in `src/room.controller.ts`.
4. Keep expansion opt-in through Memory.
