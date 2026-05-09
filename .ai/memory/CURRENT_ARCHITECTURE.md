---
name: Current Architecture
description: Code-facing architecture notes for the current Screeps bot
type: project
---

# Current Architecture

The bot is in a migration state: the strategic path is capability-based room control, while older role scripts remain as fallback behavior.

## Top-Level Loop

`src/main.ts` runs this order:

1. Log the current game tick.
2. Run `creepMemoryManagement.run()`.
3. For each owned room:
   - `populationControl.checkDefenders(room)`
   - `roomController.run(room)`
   - `towerBasics.run(room)`
4. For each non-spawning creep:
   - Assign remote jobs for configured remote creeps that lack a job.
   - Run `role.defender` immediately for defender creeps.
   - Flee nearby hostiles for non-defenders.
   - Run `creepJobRunner.run(creep)`.
   - Fall back to legacy role modules by `creep.memory.role`.

Owned rooms are discovered from rooms containing owned spawns.

## Room Controller

`src/room.controller.ts` is the main strategic module.

It builds a room context containing:

- structures and link groups
- sources and mineral
- friendly creeps
- dropped resources
- tombstones and ruins
- construction sites
- repair targets
- injured creeps
- source and mineral plans

It then:

1. Initializes `room.memory.plan`.
2. Remembers RCL, load, source plans, and mineral plan.
3. Runs link transfers.
4. Reports passive infrastructure periodically.
5. Assigns jobs with per-tick reservations.
6. Runs spawn planning.

## Jobs

Jobs are stored in creep memory as:

- `jobType`
- `jobTargetId`
- `jobRoomName`
- `jobResourceType`
- `jobAssignedAt`

`src/creep.jobRunner.ts` executes jobs. If execution returns a terminal result, it clears the job so the room controller can assign new work.

Primary jobs are remembered for workers through:

- `primaryJobType`
- `primaryTargetId`
- `primaryRoomName`
- `primaryResourceType`
- `primaryAssignedAt`

This lets build, repair, and upgrade creeps refuel then return to the same task instead of retargeting every tick.

## Capabilities And Archetypes

`src/creep.capabilities.ts` derives capabilities from live, undamaged body parts.

Current archetypes:

- `worker`
- `miner`
- `hauler`
- `doctor`
- `claimer`
- `remoteMiner`
- `remoteHauler`
- `mineralMiner`

Archetypes are spawn intent and debugging metadata. Job assignment should still be driven by capabilities and room demand.

## Spawn Planning

`chooseSpawnRequest()` in `src/room.controller.ts` selects the next creep need.

Current high-level order:

1. Emergency worker if no creeps exist.
2. Missing source miner.
3. Doctor if no heal capability and energy capacity is sufficient.
4. Hauler capacity deficit.
5. Worker work deficit.
6. Passive mineral miner when safe.
7. Configured claim target.
8. Configured remote room creep.

Body planning happens in `planBodyForArchetype()`.

## Structure Discovery

`src/room.structures.ts` scans room structures and classifies links as:

- source
- hub
- controller
- sink
- other

It writes structure IDs to `room.memory.structures` when the cache is stale (periodic refresh) or structure counts change. Current code does not yet use this as a read-through cache.

## Defense

Defense has three layers:

- Towers attack hostiles first.
- `creep.populationControl.ts` spawns defenders before economic spawn planning.
- Non-defender creeps flee nearby hostiles.

Tower repair priority (when no hostiles present):

1. Heal injured creeps.
2. Very urgent structure repair (< 500 hits).
3. Urgent structure repair (< 10 000 hits).
4. Normal structure repair via `repairStructureFilter` — non-wall/rampart only.
5. Absolute fallback repair (> 50 % energy) — non-wall/rampart only.
6. Wall/rampart repair via staged cap — **only at ≥ 90 % energy**; cap scales by RCL (see STRATEGY.md).

Walls and ramparts are intentionally separated from normal repair to prevent low-RCL rooms from sinking energy into fortifications. The staged caps live in `wallRampartRepairCap()` in `src/role.doctor.ts`.

There is no strategic combat squad logic yet.

## Remotes

Remote behavior is opt-in through `room.memory.plan.remoteRooms` or `room.memory.plan.claimTargets`.

`remoteSpawnRequest()` requests remote creeps. `assignRemoteCreep()` handles travel and simple remote harvesting, hauling, reserving, and claiming.

Remote danger policy is present as `dangerUntil`, but threat detection and automatic danger updates are limited.

## Legacy Fallback

Legacy roles still exist and can run when no job is assigned. They use state flags such as `dumping`, `building`, `repairing`, and `upgrading`.

New strategy should prefer the room controller and job runner. Legacy fallback should shrink over time.
