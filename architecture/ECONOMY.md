# Economy Architecture

## Overview

The economy runs on a **capability-demand model**: measure what the room needs, measure what creeps can
provide, spawn to fill deficits, assign work to satisfy demand. This replaces the old fixed-role-count
approach.

## Room Controller Pipeline

`room.controller.run(room)` executes each tick:

```
buildContext()       → gather structures, sources, creeps, sites, resources
initialiseRoomPlan()→ ensure plan/remoteRooms/claimTargets exist
updateRemoteRoomPlans() → learn remote source data, place roads/containers
rememberRcl()       → persist current controller level
manageMinerStandby() → promote/demote standby miners
updatePlanAssignments() → tally assigned work per source/mineral
rememberLoad()      → write room.memory.load (capabilities, demand, deficits)
rememberPlans()     → persist source/mineral planning snapshots
runLinks()          → transfer energy from source→hub/controller links
reportPassiveInfrastructure() → periodic log (every 100 ticks)
assignJobs()        → assign jobType/jobTargetId to each creep
runSpawnPlanner()   → spawn creeps to fill measured deficits
```

## Creep Archetypes & Body Plans

| Archetype | Body Strategy |
|-----------|--------------|
| `miner` | WORK-heavy, static (5W1C1M) or mobile (5W1C3M), scales down with energy |
| `hauler` | CARRY+MOVE triples (2C1M per 150 energy), optional trailing WORK when budget allows |
| `worker` | WORK:CARRY:MOVE at configurable `workRatio` (1–3 WORK per CARRY+MOVE pair) |
| `doctor` | Fixed templates with HEAL; WORK+CARRY for energy handling |
| `mineralMiner` | Same body as static miner, assigned to mineral |
| `remoteMiner` | Static (container) or mobile variant, WORK-heavy |
| `remoteHauler` | CARRY+MOVE triples, optional trailing WORK at higher budgets |
| `remoteMaintainer` | WORK+CARRY+MOVE fixed templates |
| `remoteScout` | 1–2 MOVE parts only |
| `claimer` | CLAIM+MOVE pairs scaled to budget; min 1 part, reserve mode min 2 |

Body planning lives in `planBodyForArchetype()` in `creep.capabilities.ts`. Legacy body planning
(`balanceSpec()` in `creep.roleBalance.ts`) is used only for emergency defenders.

## Spawn Planning Priority

`chooseSpawnRequest()` in `room.controller.ts` selects the next creep to spawn:

```
1. Emergency worker          → if no creeps exist (recovery)
2. Local source miner        → per uncovered source
3. Standby local miner       → 1 per room (renewable substitute)
4. Doctor                    → if no heal capability & energy ≥ 450
5. Hauler                    → minimum 2 at RCL4+ with storage
6. Hauler capacity           → capacity deficit
7. Worker work capacity      → work deficit
8. Mineral miner             → if mineral ready (extractor exists, container exists, mineral.mineralAmount > 0)
9. Claim target              → configured claimTargets
10. Remote creeps            → via remoteSpawnRequest() (see REMOTES.md)
```

**Gate**: If any local spawn request is pending (not enough energy), remote requests are skipped
entirely. This prevents remote expansion from starving the home economy.

## Gathering Priority

When an empty (or partially-loaded) creep decides what to collect:

```
For haulers/workers with free capacity:
  1. Pick up dropped resources       (any type, any amount — decays fastest)
  2. Salvage tombstones / ruins      (non-decaying or slow-decaying)
  2.5 Withdraw non-energy resources from the planned mineral-site container
     - Local haulers require at least 50% of their total carry capacity at the mineral site
  3. Withdraw from storage / structures:
     - Workers: storage-first whenever room storage has energy
     - Haulers: source containers (at miner/mineral sites), then source links, then hub/controller/sink links
     - For local haulers only, mining-site source containers/links are considered only if they hold at least 50% of hauler carry capacity

For haulers carrying energy but with free capacity & available drops:
  → Continue gathering dropped resources (skip spending phase)

Exclusive for workers (fallback if nothing above):
  4. Harvest from source (temporary fallback; reassigned once energy is loaded)
```

Dropped resources are prioritized above all other sources because they decay
at `ceil(amount / 1000)` per tick. Tombstones last 5M ticks, ruins last 500,
containers/storage are permanent — only floor drops are time-critical.

## Energy Spending Priority

When a creep has energy and needs a spending job:

```
1. Refill spawn / extensions     (gates: keep towers ≥70%, skip if worker+storage)
2. Refill towers below reserve   (70% threshold)
3. Resume primary job            (remembered build/repair/upgrade)
4. Deposit to storage/terminal   (for haulers)
5. Guaranteed builder            (at least 1 worker builds before any upgrade)
6. Controller upgrade            (minimum work threshold)
7. Build more construction sites
8. Repair                        (when no sites or storage > 5000)
9. Upgrade with remaining energy
```

## Job Execution

Jobs are stored in creep memory and executed by `creep.jobRunner.run()`:

```
Job fields: jobType, jobTargetId, jobRoomName, jobResourceType, jobAssignedAt
```

Each tick the runner:
1. Dispatches to the correct handler based on `jobType`
2. Stores `lastJobResult` in creep memory
3. Clears the job if the result is terminal (target gone, energy depleted, done)
4. Runs `opportunisticHealNearby()` for non-heal jobs (HEAL parts auto-heal nearby creeps)

## Source Miner Lifecycle

### Local miners

```
Target: 1 miner per source
          │
          ▼
Miner assigned to source ──→ TTL < 500? ──→ Renew at spawn
          │                               │
          │                               ▼
    Stay on source                    Renew loop (TTL ≥ 1300 stop)
```

The miner self-renews at spawn when TTL drops below 500 (`HOME_RENEW_START_TTL`) and stops renewing
once TTL reaches 1300 (`HOME_RENEW_STOP_TTL`). The same miner stays assigned to its source throughout.

### Remote miners

Remote miners do not renew at the home spawn. Instead, handoff replacement uses `remoteStandby`:
- When an active remote miner's TTL drops to 200 or below, spawn a standby replacement for that source.
- Source-targeted standby replacements are spawned before active deficit replacements and block duplicate active spawns for that source.
- Source-less standby miners are reassigned to uncovered accessible remote sources instead of idling indefinitely.
- The standby travels to the remote room and pre-positions near the mining site (kept within range 4-10).
- When the incumbent miner dies, the standby is promoted and takes over harvesting that source.

## Job Reservation System

To prevent multiple creeps targeting the same resource (e.g., three haulers all going for the same
dropped energy), `room.controller.ts` builds a `JobReservations` object each tick:

```
Reservations track:
  - resources: {targetId → amount}      for withdraw from tombstone/ruin
  - dropped: {targetId → amount}         for pickup of dropped resources
  - energySinks: {targetId → amount}     for refill spawn/tower
  - constructionProgress: {siteId → hp}  for build progress (10-tick lookahead)
  - repairProgress: {structId → hp}      for repair progress (5-tick lookahead)
  - sourceWork: {sourceId → work}        for mining work
  - sourceMinerCount: {sourceId → count} for miner assignment
  - mineralWork: total                   for mineral mining
  - upgraderWork: total                  for controller upgrade
```

Creeps are sorted by archetype priority (miner=1, mineralMiner=2, hauler=3, doctor=4, worker=5)
and assigned jobs in order, deducting from reservations to avoid pile-ups.

## Links

Links are classified into groups by `room.structures.ts`:
- **source** — near sources (≤2 range), send energy outward
- **hub** — near storage/spawn (≤3 range), receive energy
- **controller** — near controller (≤4 range), receive energy for upgrading
- **sink** — near ≥3 extensions, receive energy for spawn refill
- **other** — unclassified

`runLinks()` transfers energy from sources/hubs/other to receivers (sinks, hubs, controller links).
Transfer threshold: 400 energy. Only hub links send when spawn pressure is zero.
