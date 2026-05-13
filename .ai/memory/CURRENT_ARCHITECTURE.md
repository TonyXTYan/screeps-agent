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
3. Run `memoryAudit.runIfBuildChanged()` — runs a memory consistency audit when the 8-char git build commit hash differs from `Memory.lastBuildCommit` (skipped if CPU bucket < 500).
4. For each owned room:
   - `populationControl.checkDefenders(room)`
   - `roomController.run(room)`
   - `towerBasics.run(room)`
4. For each non-spawning creep:
   - Assign remote jobs for configured remote creeps that lack a job.
   - Try to renew standby miners (local and remote standby).
   - Run `role.defender` immediately for defender creeps.
   - Flee nearby hostiles for non-defenders; heal-capable creeps instead chase emergency patients (critical HP or hostile pressure) and heal them.
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
- `defender`
- `remoteMiner`
- `remoteHauler`
- `remoteMaintainer`
- `remoteScout`
- `mineralMiner`

Archetypes are spawn intent and debugging metadata. Job assignment is driven by capabilities and room demand.

**Body plans by archetype:**

| Archetype | Body strategy |
|-----------|---------------|
| `miner` / `remoteMiner` / `mineralMiner` | WORK-heavy, CARRY+MOVE for static; extra MOVE for non-static |
| `hauler` (local) | CARRY+MOVE triples with optional trailing WORK when budget allows |
| `remoteHauler` | CARRY+MOVE triples with optional trailing WORK when budget allows |
| `worker` | WORK:CARRY:MOVE at configurable workRatio |
| `remoteMaintainer` | Fixed templates: WORK+WORK+CARRY+CARRY+MOVE×3, scaled down |
| `remoteScout` | Single MOVE or double MOVE |
| `doctor` | WORK+CARRY+MOVE+HEAL templates |
| `claimer` | Dynamic CLAIM+MOVE scaling — builds at least `minClaimParts` CLAIM+MOVE pairs, adds more while budget allows. Returns `[]` if budget can't meet minimum. Reserve mode requires `minClaimParts: 2`; claim mode allows 1. |

There is a legacy body planning system (`creep.roleBalance.ts:balanceSpec()`) used only by defender spawning and the legacy role system. It uses a different encoding (array-index-based part ratios) and should not be used for new strategic path creeps.

## Spawn Planning

`chooseSpawnRequest()` in `src/room.controller.ts` selects the next creep need.

Current high-level order:

1. Emergency worker if no creeps exist.
2. Missing source miner coverage, then one standby local miner.
3. Doctor if no heal capability and energy capacity is sufficient.
4. Hauler capacity deficit.
5. Worker work deficit.
6. Passive mineral miner when safe.
7. Configured claim target.
8. Configured remote room creep (`remoteSpawnRequest()`).

**Home room priority gate**: if any home-room spawn request is pending, remote requests are skipped entirely. This prevents remote spawns from starving local economy needs.

**Remote room spawn sub-order** (inside `remoteSpawnRequest()`):

1. Scout (if sources are unknown or stale).
2. Claimer (if reserve/claim is needed).
3. Miner per source (based on WORK deficit).
4. Hauler per source (capped at 2 per source, capacity demand capped at 2500 per source).
5. Maintainer (if roads/containers need building or repair).
6. Standby miner (one per remote room, idle at home, dispatches when active miner TTL < 300).

Body planning happens in `planBodyForArchetype()`.

**Local miner lifecycle** uses a standby duty flag:

- Rooms target `sources + 1` local miners.
- One miner is `standby` near spawn and gets renewed.
- When an active miner drops below swap TTL, standby is promoted to that source and the low-TTL miner rotates to standby.
- Standby miners are renewed at the spawn when TTL < 1450.

**Remote miner lifecycle** mirrors the local pattern:

- Remote rooms target `sources + 1` miners (including one `remoteStandby`).
- The standby miner waits idle at the home room spawn, renewed via `tryRenewStandbyMiner()`.
- When any active remote miner's TTL drops below `REMOTE_STANDBY_DISPATCH_TTL` (300), the standby is dispatched to take its source.
- Double-dispatch prevention: if another non-standby miner already holds the same source assignment, the standby aborts dispatch.

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
5. Wall/rampart repair via staged cap — **only at ≥ 90 % energy**; cap scales by RCL (see STRATEGY.md).

Heal/repair behavior only runs when tower energy is above 50 %.

Walls and ramparts are intentionally separated from normal repair to prevent low-RCL rooms from sinking energy into fortifications. The staged caps live in `wallRampartRepairCap()` in `src/role.doctor.ts`.

There is no strategic combat squad logic yet.

## Remotes

Remote behavior is opt-in through `room.memory.plan.remoteRooms` or `room.memory.plan.claimTargets`.

`updateRemoteRoomPlans()` handles remote-room runtime planning when visibility exists:

- applies remote defaults (`reserve`, `buildRoads`, `maintainRoads`)
- detects hostile danger and sets `dangerUntil`
- learns per-source station/container/path metadata
- computes per-source `workDemand` and `haulerCapacityDemand`
- retries incomplete `PathFinder` results quickly using a fallback path-distance estimate
- places container and road construction sites with per-tick caps
- skips road placement in owned rooms so manual base layouts are preserved

**Hauler capacity demand is capped** at `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE` (2500) to bound the `income * distance * 2 * 1.2` demand for distant rooms.

`remoteSpawnRequest()` is per-remote and per-source:

- unknown-source remotes request `remoteScout` first
- known-source remotes request `remoteMiner` and `remoteHauler` from source-level deficits (capped at 2 haulers per source)
- reserve/claim requests use `claimer`; reserve mode enforces 2 `CLAIM` parts and claim mode allows 1
- maintenance requests spawn `remoteMaintainer` when roads/containers need work
- one `remoteStandby` miner per remote room

`assignRemoteCreep()` handles remote execution:

- danger-aware retreat to home room
- `remoteScout` hold behavior, with overflow scouts wandering to avoid home-exit blocking
- source-assigned remote mining/hauling
- remote standby dispatch when an active miner is near death
- reserve/claim controller actions for configured modes

## Legacy Fallback

Legacy roles still exist and can run when no job is assigned. They use state flags such as `dumping`, `building`, `repairing`, and `upgrading`.

**Warning**: legacy roles (`role.harvester.ts`, `role.builder.ts`) still delete creep memory (`delete Memory.creeps[creep.name]`) when idle. If a remote creep falls through to legacy fallback and hits this path, all strategic memory is lost. See `KNOWN_ISSUES.md`.

New strategy should prefer the room controller and job runner. Legacy fallback should shrink over time.

## Memory Audit

`src/memoryAudit.ts` runs a one-time consistency audit when the build commit hash changes (i.e., right after deploy). It is skipped if CPU bucket is below 500.

All checks auto-fix issues:

| Check | Fix |
|-------|-----|
| Orphaned room memory | Deletes `Memory.rooms` entries unreferenced by any active room |
| Stale remote plans | Clears expired danger, stale skip reasons, stale hostiles, non-existent source plans |
| Duplicate source assignments | Keeps strongest miner (most WORK, best TTL), unassigns others from `assignedSourceId` |
| Orphaned source references | Clears `sourceId`/`assignedSourceId` not matching any source in any plan |
| Stale travel memory | Resets stuck-tracker fields if stuck > 20 ticks |
| Invalid creep memory | Clears invalid `remoteRoom`, orphaned `remoteStandby`, stale `scoutWanderRoom`, remote fields on non-remote creeps |

The build commit hash lives in `src/env.ts` (injected by rollup `output.banner`). `Memory.lastBuildCommit` stores the last-seen hash.
