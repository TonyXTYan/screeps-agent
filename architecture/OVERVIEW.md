# Architecture Overview

## Project

TypeScript Screeps AI managing economy, remotes, and defense. Build output is `dist/main.js`.

## Source Map

```
src/
  main.ts                  Entry point
  env.ts                   BUILD_COMMIT injection surface
  hostileUtils.ts          Armed-hostile detection (`isHostile`, `findHostiles`)
  memoryAudit.ts           Deploy-time memory consistency audit
  debug.ts                 Console/debug helpers
  types.d.ts               Memory/type unions

  creep/
    capabilities.ts        Archetype inference, body capabilities, body planning
    jobRunner.ts           Strategic job execution
    memoryManagement.ts    Dead-memory cleanup + legacy-role migration
    movement.ts            Pathing helpers
    traffic.ts             Yield negotiation/priorities + head-on swap
    harvest.ts             Legacy harvest helper
  role/
    patrol.ts              Patrol defense behavior (expel mode)
    doctor.ts              Shared repair-cap helpers + legacy fallback
    builder.ts             Legacy fallback role
    harvester.ts           Legacy fallback role
    upgrader.ts            Legacy fallback role
    manual.ts              Manual stub

  room/
    controller.ts          Context build + assignment + remote assignment
    constants.ts           Shared tuning constants
    spawn.ts               Local spawn capability accounting helpers
    remote/spawn.ts        Strategic spawn request selection (including patrol)
    remote/planning.ts     Remote planning + fail-safe danger telemetry
    remote/*               Remote fleet/miner/hauler/road/maintenance subsystems

  tower/
    basics.ts              Tower attack/heal/repair logic
  spawn/
    renewal.ts             Renew reservation helpers
```

## Tick Loop (`main.ts`)

1. Refresh debug hooks/helpers.
2. Run `creepMemoryManagement.run()`.
3. Run `memoryAudit.runFullAudit()` on build change.
4. For each owned room: `roomController.run(room)` then `towerBasics.run(room)`.
5. For each non-spawning creep:
   - Assign remote jobs if `remoteRoom` is set.
   - Handle standby miner parking.
   - If role is `patrol`, run `role/patrol.ts` and skip economic flow.
   - Otherwise run hostile-evade flow (`REMOTE_HOSTILE_EVADE_DISTANCE`).
   - Try home renew.
   - Run strategic job runner.
   - Fall back to legacy role scripts when needed.

## Key Type Unions

`CreepArchetype` includes `patrol` and retains `doctor` as the active HEAL-body archetype. The `defender` archetype has been removed; `memoryAudit.ts` migrates any surviving `defender` memory entries to `patrol` on each deploy.

`CreepJobType` remains the strategic job union used by `jobRunner`.

## Defense Model

- Towers are first line.
- Patrol creeps are strategic expel units (RCL6+ baseline plus hostile surge), with low-RCL home-only emergency fallback.
- Non-patrol creeps evade nearby armed hostiles.
- Armed-hostile remotes with zero patrol coverage trigger a temporary non-combat retreat/spawn block failsafe.

## Build

- `npm run build` compiles TypeScript to `dist/main.js`.
- Build hash is written into bundle; changed hash triggers memory audit on next tick.
