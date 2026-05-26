---
name: Code Map
description: Quick mapping from architecture concepts to implementation files
type: project
---

# Code Map

Use this as the first stop before editing code.

## Source Layout

```
src/
  creep/
    capabilities.ts       Body → capability derivation, archetype inference, body planning
    harvest.ts            Legacy direct-harvest helper used by legacy roles
    jobRunner.ts          Job execution dispatch (19 job types)
    memoryManagement.ts   Dead creep cleanup, fallback role assignment
    movement.ts           Path following, stuck detection, exit navigation, room-edge nudging
    populationControl.ts  Emergency defender spawning
    roleBalance.ts        Legacy body planner (defender only)
    traffic.ts            Traffic yield system: request, honour, assign, priorities

  role/
    builder.ts            Legacy builder fallback
    defender.ts           Defender combat behavior
    doctor.ts             Legacy doctor fallback + shared repair utilities (repairStructureFilter, wallRampartRepairCap)
    harvester.ts          Legacy harvester fallback
    manual.ts             Manual-control stub
    upgrader.ts           Legacy upgrader fallback

  room/
    constants.ts          All magic numbers (tower ratios, TTLs, thresholds, terminal reserves)
    controller.ts         Main economic controller: context build, job assignment, link management
    energy.ts             Energy demand checks, withdrawal/deposit targets, refill helpers, link receivers
    jobManage.ts          Job retention (keepCurrentJob), emergency energy delivery, job validity checks
    jobMemory.ts          setJob / setTravelJob / setResourceJob / primary-job memory helpers
    source.ts             Source/mineral plan building, static harvest memory, assignment helpers
    spawn.ts              Home spawn planning: body sizing, demand sizing, pending capability tracking
    flags.ts              Named-flag overrides: isMaintenanceDisabled (DONOT_MAINTAIN → skip repair)
    storeUtils.ts         Store utility helpers
    structures.ts         Structure discovery, link classification
    targeting.ts          closest / closestReachable / closestByRange / heal-target helpers
    types.ts              RoomControllerContext, JobReservations, SpawnRequest, SourcePlan, MineralPlan
    work.ts               Construction/repair/upgrade reservation and targeting helpers
    remote/
      energy.ts           Remote energy source selection and hauler claim tracking
      fleet.ts            Remote fleet queries: counts, caps, source assignments, wander helpers
      haulers.ts          Remote hauler cycle management (pickup → delivery → renew → idle)
      maintenance.ts      Remote maintenance-pressure telemetry (decay/backlog snapshots)
      miners.ts           Remote miner station priming, route health, standby assignment
      planning.ts         Remote room plan initialisation, route-health tracking, plan persistence
      roads.ts            Remote road site placement, infrastructure site selection
      routing.ts          Remote entry/exit estimation, station finding, route serialisation
      spawn.ts            Remote spawn planning, request generation, body sizing

  spawn/
    renewal.ts            Per-tick spawn reservation helper for renew actions

  tower/
    basics.ts             Tower attack → heal → repair (cascading); RCL-staged wall/rampart caps

  debug.ts                Console debug helpers
  env.ts                  BUILD_COMMIT from build-injected git hash
  hostileUtils.ts         isHostile / findHostiles — shared hostile detection
  main.ts                 Screeps loop() entry point
  memoryAudit.ts          Memory consistency audit (runs on deploy when commit hash changes)
  types.d.ts              All CreepMemory / RoomMemory / SpawnMemory extensions and type unions
```

## Tick Flow

- `src/main.ts` — Screeps `loop()` entry point, standby miner parking, hostile flee/retreat, home renew gating
- `src/creep/memoryManagement.ts` — dead creep memory cleanup and fallback role/remote initialization
- `src/memoryAudit.ts` — memory consistency audit (runs on deploy when commit hash changes)
- `src/env.ts` — exports `BUILD_COMMIT` from build-injected git hash
- `src/creep/populationControl.ts` — emergency defender spawning before economic spawn planning
- `src/room/controller.ts` — main room-level economic controller (room plans, remotes, spawn planning, job assignment)
- `src/spawn/renewal.ts` — per-tick spawn reservation helper for renew actions
- `src/tower/basics.ts` — tower attack, heal, and repair behavior
- `src/creep/jobRunner.ts` — executes assigned jobs before legacy role fallback

## Shared Utilities

- Hostile detection is centralized in `src/hostileUtils.ts` (`isHostile`, `findHostiles`) and used by `main.ts`, `room/controller.ts`, `tower/basics.ts`, `creep/populationControl.ts`, and `role/defender.ts`.
- `firstStoredResource(store)` — exists in `creep/jobRunner.ts` and `room/work.ts`.
- `closest()` / `closestByRange()` — in `room/targeting.ts`.
- `spawn/renewal.ts` — shared `acquireRenewSpawn()` / `nearestSpawn()` helper used by home, remote, and defender renew flows.
- `creep/movement.ts` — `moveToJobTarget`, `moveToWithdrawTarget`, path utilities; imported by `creep/jobRunner.ts`.
- `creep/traffic.ts` — `honorTrafficYieldRequest`, `requestTrafficYieldForPath`; imported by `creep/movement.ts` and `creep/jobRunner.ts`.

## Architecture Docs

- Architecture overview — `architecture/OVERVIEW.md`
- Economy details — `architecture/ECONOMY.md`
- Remote behavior details — `architecture/REMOTES.md`
- Defense details — `architecture/DEFENSE.md`
- Known follow-up work — `.ai/memory/KNOWN_ISSUES.md`
- RCL/labs/power deferred work — `.ai/memory/ROADMAP.md`

## Core Economy

- Source/mineral planning — `src/room/source.ts`
- Link classification — `src/room/structures.ts`
- Spawn demand selection — `src/room/spawn.ts` + `src/room/remote/spawn.ts`; multiple free spawns share a pending-request ledger with planned bodies so in-flight creeps count toward capacity and per-source/per-role caps.
- Home room priority gate (blocks remote spawns when home requests pending, throttles remotes under low stored/spawn energy) — `src/room/remote/spawn.ts`
- Remote standby miner system (TTL-triggered source-targeted handoff with remote pre-positioning) — `src/room/remote/miners.ts`, `src/room/controller.ts`, `src/main.ts`
- Remote route health and road placement — `src/room/remote/planning.ts`, `src/room/remote/roads.ts`
- Remote maintenance-pressure telemetry (setup/death/audit-triggered recompute) — `src/room/remote/maintenance.ts`, `src/room/remote/planning.ts`, `src/memoryAudit.ts`, `src/debug.ts`
- Body capability derivation — `src/creep/capabilities.ts`
- Body planning by archetype — `src/creep/capabilities.ts`
- Hauling, refill, build, repair, upgrade assignment — `src/room/controller.ts` + `src/room/energy.ts`
- Remote hauler cycle — `src/room/remote/haulers.ts`
- Job execution for those assignments — `src/creep/jobRunner.ts`
- Recovery log regression checker — `.ai/scripts/check-screeps-recovery-regressions.py`

## Types And Memory

- Creep, room, spawn memory extensions — `src/types.d.ts`
- Job type union — `src/types.d.ts`
- Archetype union (worker, miner, hauler, doctor, claimer, defender, remoteMiner, remoteHauler, remoteMaintainer, remoteScout, mineralMiner) — `src/types.d.ts`
- Room plan, load, and `energyRecoveryReason` memory — `src/types.d.ts`
- Runtime Memory writes for structures/load/plans — `src/room/controller.ts`, `src/room/structures.ts`
- Controller context and reservation types — `src/room/types.ts`

## Repair Utilities (Shared)

`src/role/doctor.ts` exports strategic repair helpers used across the codebase:

- `repairStructureFilter(structure, rcl)` — RCL-staged hit-cap filter for walls/ramparts; imported by `tower/basics.ts` and `room/controller.ts`
- `wallRampartRepairCap(rcl)` — returns the hit cap for the given RCL; imported by `room/jobManage.ts`
- `repairJob(creep)` / `repairTargetToRepair(creep)` — used by legacy fallback roles

Wall/rampart hit caps live in `wallRampartRepairCap()`. Tower energy thresholds live in `tower/basics.ts`. To change staged caps, edit `role/doctor.ts` and update `architecture/DEFENSE.md`.

## Legacy Compatibility

- Legacy role balancing helpers — `src/creep/roleBalance.ts`
- Legacy body planner (`balanceSpec()`) — `src/creep/roleBalance.ts` (DO NOT use for strategic-path creeps; use `planBodyForArchetype()` in `creep/capabilities.ts` instead)
- Legacy direct harvesting helper — `src/creep/harvest.ts`
- Legacy fallback roles — `src/role/harvester.ts`, `src/role/builder.ts`, `src/role/upgrader.ts`, `src/role/doctor.ts`
- Emergency defender behavior — `src/role/defender.ts`
- Manual role stub — `src/role/manual.ts`

Legacy role files should not be the primary path for new strategic behavior.
**Warning**: legacy roles (`harvester`, `builder`) can delete creep memory (`delete Memory.creeps[creep.name]`) when idle. See `KNOWN_ISSUES.md`.

## Common Edit Paths

Adding a new local economy job:

1. Add the job to `CreepJobType` in `src/types.d.ts`.
2. Add execution in `src/creep/jobRunner.ts`.
3. Add assignment and reservation logic in `src/room/controller.ts` (or the relevant `room/*.ts` helper).
4. Add or update capability/body planning in `src/creep/capabilities.ts` if needed.
5. Update relevant `architecture/*.md` docs if behavior changes.

Adding a new strategic Memory setting:

1. Update `src/types.d.ts`.
2. Initialize defaults in `src/room/controller.ts`.
3. Read the setting in assignment or spawn planning.
4. Add an example in the relevant `architecture/*.md` doc.

Changing construction priority:

1. Update `architecture/ECONOMY.md`.
2. Update `constructionPriority()` in `src/room/work.ts`.
3. Validate in-game that builders choose the intended sites.

Changing remote behavior:

1. Update `architecture/REMOTES.md`.
2. Update `RemoteRoomPlan` in `src/types.d.ts` if the config changes.
3. Update the relevant function in `src/room/remote/planning.ts`, `src/room/remote/spawn.ts`, or `src/room/controller.ts`.
4. Update console-facing docs in `console/REMOTE_MINING_CONSOLE.md` if API behavior or defaults change.
5. Keep expansion opt-in through Memory.

Changing wall/rampart repair caps or tower repair policy:

1. Update `architecture/DEFENSE.md` first.
2. Edit `wallRampartRepairCap()` in `src/role/doctor.ts` for the staged hit caps.
3. Edit the energy thresholds in `src/tower/basics.ts`:
   - `minEnergyForRepair` — controls heal/repair of normal structures (0.5 combat, 0.7 peace)
   - `minEnergyForDefense` — controls wall/rampart repair (0.4 combat, 0.75 peace)
4. The repair-job validity check in `currentJobStillValid()` (`src/room/jobManage.ts`) automatically uses `wallRampartRepairCap` — no separate update needed.
