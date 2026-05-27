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
  main.ts                  Screeps loop entry; patrol dispatch + hostile evade flow
  hostileUtils.ts          Armed-hostile helpers (`isHostile`, `findHostiles`)
  memoryAudit.ts           Deploy-time audit + legacy defense role migration
  types.d.ts               Memory extensions and type unions

  creep/
    capabilities.ts        Archetype inference, body capabilities/planning
    memoryManagement.ts    Dead-memory cleanup + legacy role remap
    jobRunner.ts           Strategic job execution
    movement.ts            Shared movement helpers
    traffic.ts             Yield priorities (patrol gets top priority)
    roleBalance.ts         Legacy body planner kept for compatibility
    populationControl.ts   Legacy emergency defender module (retired from loop)

  role/
    patrol.ts              Patrol behavior (expel mode, rotate + converge + renew)
    doctor.ts              Shared repair-cap helpers + legacy fallback role
    builder.ts             Legacy fallback
    harvester.ts           Legacy fallback
    upgrader.ts            Legacy fallback
    manual.ts              Manual stub
    defender.ts            Legacy defender role (retired from loop)

  room/
    controller.ts          Economic assignment + remote assignment
    constants.ts           Shared tunables (including hostile evade distance)
    spawn.ts               Capability accounting helpers
    remote/spawn.ts        Strategic spawn requests (includes patrol sizing)
    remote/planning.ts     Remote plan updates + fail-safe danger marker
    remote/*               Fleet, miner, hauler, maintenance, roads, routing

  tower/
    basics.ts              Tower attack/heal/repair behavior
  spawn/renewal.ts         Renew reservation helpers
```

## Tick Flow

- `main.ts`
  - memory management
  - build-change memory audit
  - room controller + towers
  - remote assignment per creep
  - patrol role execution before economic flow
  - non-patrol hostile evade and job runner/fallback

## Core Defense Hooks

- Patrol spawn target (`room/remote/spawn.ts`):
  - `baseline = ceil(enabledRemotes / 2)`
  - `hostileRooms = (homeArmedHostiles > 0 ? 1 : 0) + enabledRemotesWithVisibleArmedHostiles`
  - `cap = 2 + 2 * enabledRemotes`
  - `target = min(baseline + hostileRooms, cap)`
  - `RCL < 6`: emergency home-defense-only spawning capped at 1 patrol for any armed home threat
- Patrol behavior (`role/patrol.ts`):
  - coordinated multi-threat room assignment: min-1 per armed threat room, then remaining patrols by threat score
  - target HEAL > RANGED_ATTACK > ATTACK
  - clear visible invader cores when no armed target is present in threat room
  - rotate remotes every `getPatrolRotationTicks()` (currently 100)
  - renew logic allows home-room top-up during remote-only threats and critical-TTL sustain during long incursions
- Evade radius (`room/constants.ts`): `REMOTE_HOSTILE_EVADE_DISTANCE`
- During armed failsafe home retreat (`main.ts`): creeps already on `travelRoom -> homeRoom` take directed home-exit steering with hostile-avoid costs before generic flee.
- Fail-safe danger marker (`room/remote/planning.ts`): armed-hostile only, with non-combat retreat/spawn blocking when the threatened remote room has zero deployed non-renewing patrol coverage from that home.
- Non-creep threats (invader core / hostile controller) are intentionally telemetry-only and should not trigger fail-safe retreat/spawn blocking.
- Controller attack fallback (`creep/jobRunner.ts`): CLAIM creeps auto-attack controllers only for NPC Invader owner/reservation states.

## Types and Memory

- Archetype union includes `patrol` plus legacy compatibility values (`doctor`, `defender`).
- Remote plan tracks `dangerUntil`, `skipReason`, `lastPatrolDangerNotifyAt`, plus non-creep threat telemetry (`lastSeenInvaderCoreAt`, `lastSeenHostileControllerAt`).

## Repair Utilities

`role/doctor.ts` remains the shared home for:

- `repairStructureFilter()`
- `wallRampartRepairCap()`

These are still consumed by tower/job/room repair logic.

## Notes

- `populationControl.ts` and `role/defender.ts` are retained as legacy code but are no longer called from the main loop.
- Legacy memory migration (`defender -> patrol`, `doctor -> worker`) is one-time guarded in `memoryManagement.ts` and reinforced in `memoryAudit.ts`.
