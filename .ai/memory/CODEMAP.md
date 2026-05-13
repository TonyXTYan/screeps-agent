---
name: Code Map
description: Quick mapping from strategy concepts to implementation files
type: project
---

# Code Map

Use this as the first stop before editing code.

## Tick Flow

- `src/main.ts` — Screeps `loop()` entry point, standby miner renewal, hostile flee/retreat, debug hooks
- `src/creep.memoryManagement.ts` — dead creep memory cleanup and fallback role/remote initialization
- `src/memoryAudit.ts` — memory consistency audit (runs on deploy when commit hash changes)
- `src/env.ts` — exports `BUILD_COMMIT` from build-injected git hash
- `src/creep.populationControl.ts` — emergency defender spawning before economic spawn planning
- `src/room.controller.ts` — main room-level economic controller (room plans, remotes, spawn planning, job assignment)
- `src/tower.basics.ts` — tower attack, heal, and repair behavior
- `src/creep.jobRunner.ts` — executes assigned jobs before legacy role fallback

## Shared Utilities

- Hostile detection is centralized in `src/hostileUtils.ts` (`isHostile`, `findHostiles`) and used by `main.ts`, `room.controller.ts`, `tower.basics.ts`, `creep.populationControl.ts`, and `role.defender.ts`.
- `firstStoredResource(store)` — duplicated in `creep.jobRunner.ts` and `room.controller.ts`.
- `closest()` / `closestByRange()` — overlap in `room.controller.ts`.

## Strategy To Code

- Strategy contract — `.ai/memory/STRATEGY.md`
- Current architecture notes — `.ai/memory/CURRENT_ARCHITECTURE.md`
- Known follow-up work — `.ai/memory/KNOWN_ISSUES.md`
- RCL/labs/power deferred work — `.ai/memory/ROADMAP.md`

## Core Economy

- Source/mineral planning — `src/room.controller.ts`
- Link classification — `src/room.structures.ts`
- Spawn demand selection — `src/room.controller.ts`
- Home room priority gate (blocks remote spawns when home requests pending) — `src/room.controller.ts`
- Remote standby miner system (dispatch + renewal) — `src/room.controller.ts`, `src/main.ts`
- Body capability derivation — `src/creep.capabilities.ts`
- Body planning by archetype — `src/creep.capabilities.ts`
- Remote hauler capacity cap (per source) — `src/room.controller.ts`
- Hauling, refill, build, repair, upgrade assignment — `src/room.controller.ts`; haulers use storage as the withdrawal source when refill targets are pending (gathering phase of `assignJob`), containers/links otherwise
- Job execution for those assignments — `src/creep.jobRunner.ts`

## Types And Memory

- Creep, room, spawn memory extensions — `src/types.d.ts`
- Job type union — `src/types.d.ts`
- Archetype union (worker, miner, hauler, doctor, claimer, defender, remoteMiner, remoteHauler, remoteMaintainer, remoteScout, mineralMiner) — `src/types.d.ts`
- Room plan and load memory — `src/types.d.ts`
- Runtime Memory writes for structures/load/plans — `src/room.controller.ts`, `src/room.structures.ts`

## Repair Utilities (Shared)

`src/role.doctor.ts` exports strategic repair helpers used across the codebase:

- `repairStructureFilter(structure, rcl)` — RCL-staged hit-cap filter for walls/ramparts; imported by `tower.basics.ts` and `room.controller.ts`
- `wallRampartRepairCap(rcl)` — returns the hit cap for the given RCL; imported by `room.controller.ts`
- `repairJob(creep)` / `repairTargetToRepair(creep)` — used by legacy fallback roles

Wall/rampart hit caps live in `wallRampartRepairCap()`. Tower threshold (90 % charge gate) lives in `tower.basics.ts`. To change staged caps, edit `role.doctor.ts` and update STRATEGY.md.

## Legacy Compatibility

- Legacy role balancing helpers — `src/creep.roleBalance.ts`
- Legacy body planner (`balanceSpec()`) — `src/creep.roleBalance.ts` (DO NOT use for strategic-path creeps; use `planBodyForArchetype()` in `creep.capabilities.ts` instead)
- Legacy direct harvesting helper — `src/creep.harvest.ts`
- Legacy fallback roles — `src/role.harvester.ts`, `src/role.builder.ts`, `src/role.upgrader.ts`, `src/role.doctor.ts`
- Emergency defender behavior — `src/role.defender.ts`
- Manual role stub — `src/role.manual.ts`

Legacy role files should not be the primary path for new strategic behavior.
**Warning**: legacy roles (`harvester`, `builder`) can delete creep memory (`delete Memory.creeps[creep.name]`) when idle. See `KNOWN_ISSUES.md`.

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
3. Update `updateRemoteRoomPlans()`, `remoteSpawnRequest()`, and `assignRemoteCreep()` in `src/room.controller.ts`.
4. Update console-facing docs in `console/REMOTE_MINING_CONSOLE.md` if API behavior or defaults change.
5. Keep expansion opt-in through Memory.

Changing wall/rampart repair caps or tower repair policy:

1. Update `.ai/memory/STRATEGY.md` first.
2. Edit `wallRampartRepairCap()` in `src/role.doctor.ts` for the staged hit caps.
3. Edit the `energyRatio >= 0.9` gate in `src/tower.basics.ts` if the tower threshold changes.
4. The repair-job validity check in `currentJobStillValid()` (`src/room.controller.ts`) automatically uses `wallRampartRepairCap` — no separate update needed.
