# Architecture Overview

## Project

A TypeScript Screeps AI bot that manages a colony economy — source mining, hauling, construction, repair,
upgrading, remote harvesting, and defense. Bundled via Rollup into `dist/main.js` and pushed to the
Screeps server via `grunt-screeps`.

## Source Map

```
src/
  main.ts                  Entry point — Screeps calls loop() every tick
  env.ts                   BUILD_COMMIT from git hash (injected by rollup banner)
  hostileUtils.ts          Shared hostile detection helpers (`isHostile`, `findHostiles`)
  memoryAudit.ts           Memory consistency audit (runs on deploy)
  debug.ts                 Console debug helpers
  types.d.ts               All Memory extensions and type unions

  creep/
    capabilities.ts        Body → capability derivation, archetype inference, body planning
    jobRunner.ts           Job execution dispatch (19 job types)
    memoryManagement.ts    Dead creep cleanup, fallback role assignment
    populationControl.ts   Emergency defender spawning
    harvest.ts             Legacy direct-harvest helper
    roleBalance.ts         Legacy body planner (defender only)
    movement.ts            Path following, stuck detection, exit navigation, room-edge nudging
    traffic.ts             Traffic yield system: request, honour, assign, priorities

  role/
    harvester.ts           Legacy harvester fallback
    builder.ts             Legacy builder fallback
    upgrader.ts            Legacy upgrader fallback
    doctor.ts              Legacy doctor fallback + shared repair utilities
    defender.ts            Defender combat behavior
    manual.ts              Manual-control stub

  room/
    controller.ts          Main economic controller: context, job assignment, link management
    structures.ts          Structure discovery, link classification
    constants.ts           All magic numbers (tower ratios, TTLs, thresholds, terminal reserves)
    types.ts               RoomControllerContext, JobReservations, SpawnRequest, plan types
    energy.ts              Energy demand, withdrawal/deposit targets, refill helpers, link receivers
    work.ts                Construction/repair/upgrade reservation and targeting
    source.ts              Source/mineral plan building, static harvest memory
    spawn.ts               Home spawn planning: body sizing, demand sizing
    targeting.ts           closest / closestReachable / closestByRange / heal-target helpers
    jobMemory.ts           setJob / setTravelJob / setResourceJob / primary-job memory helpers
    jobManage.ts           Job retention, emergency energy delivery, job validity checks
    storeUtils.ts          Store utility helpers
    flags.ts               Named-flag overrides (DONOT_MAINTAIN → skip repair for flagged structure)
    remote/
      fleet.ts             Remote fleet queries: counts, caps, assignments, wander helpers
      energy.ts            Remote energy source selection and claim tracking
      miners.ts            Remote miner station priming, route health, standby assignment
      haulers.ts           Remote hauler cycle management
      maintenance.ts       Remote maintenance-pressure telemetry (event-driven)
      spawn.ts             Remote spawn planning, body sizing
      planning.ts          Remote room plan init, route-health tracking, plan persistence
      roads.ts             Remote road site placement, infrastructure site selection
      routing.ts           Remote entry/exit estimation, station finding, route serialisation

  spawn/
    renewal.ts             Per-tick renew-spawn reservation helper

  tower/
    basics.ts              Tower attack/heal/repair
```

## Tick Loop (main.ts)

```
┌─────────────────────────────────────────────┐
│ loop() — called by Screeps every tick       │
├─────────────────────────────────────────────┤
│ 1. Refresh debug-path state                 │
│ 2. Install console helpers (once)           │
│ 3. Log tick, generate pixel if bucket ≥10k  │
├─────────────────────────────────────────────┤
│ 4. creepMemoryManagement.run()              │
│    - Delete dead creep memory               │
│    - Restore remote assignments for orphans │
│    - Assign fallback roles                  │
├─────────────────────────────────────────────┤
│ 5. memoryAudit.runIfBuildChanged()          │
│    - Full consistency audit on new deploy   │
│    - Skipped if CPU bucket < 500            │
├─────────────────────────────────────────────┤
│ 6. For each owned room:                     │
│    a. populationControl.checkDefenders()    │
│    b. roomController.run()                  │
│    c. towerBasics.run()                     │
├─────────────────────────────────────────────┤
│ 7. For each non-spawning creep:             │
│    a. Assign remote jobs if remoteRoom set  │
│    b. Try to renew standby miners           │
│    c. Run defender combat (bypasses jobs)   │
│    d. Flee hostiles (or emergency heal)     │
│    e. creep/jobRunner.run() — execute job   │
│    f. Fallback: role/harvester/builder/...  │
├─────────────────────────────────────────────┤
│ 8. debug.tickRemoteCreepLog() — periodic    │
└─────────────────────────────────────────────┘
```

## Data Flow

```
Room state
    ↓
RoomController builds context (structures, sources, creeps, sites, ...)
    ↓
Measure capabilities & demand
    ↓
Compute deficits (miner, hauler, worker, heal, mineral)
    ↓
Spawn planning — chooseSpawnRequest() → spawnCreep()
    (pending bodies are counted so multiple spawns do not duplicate demand)
    ↓
Job assignment — setJob(type, target) on creep memory
    ↓
Job execution — creepJobRunner.run() each tick
    ↓
Job completion → clearJob() → reassigned next tick
```

## Two Execution Paths

| Path | How | Used for |
|------|-----|----------|
| **Strategic** | `room/controller` assigns `jobType`/`jobTargetId` → `creep/jobRunner` executes | All economic creeps (miners, haulers, workers, healers, remote roles, mineral miners) |
| **Legacy fallback** | Boolean state flags in creep memory (`dumping`, `building`, `repairing`, `upgrading`) | Runs when `creepJobRunner` returns false (no job assigned) |

The strategic path is the primary path. Legacy fallback exists for compatibility and should shrink over time.

## Key Type Unions

**CreepArchetype** — spawn intent + capability label:
```
worker | miner | hauler | doctor | claimer | remoteMiner |
remoteHauler | remoteMaintainer | remoteScout | mineralMiner | defender
```

**CreepJobType** — executable work unit:
```
harvestSource | withdrawEnergy | withdrawResource | pickupEnergy |
pickupResource | depositEnergy | depositResource | refillSpawn |
refillTower | build | repair | upgrade | heal | mineMineral |
depositMineral | reserveController | claimController | travelRoom | idle
```

## Build & Deploy

```
npm run build    → rollup -c → dist/main.js
npm run push     → grunt-screeps → Screeps server
npm run deploy   → build + push
npm run watch    → auto-rebuild on file save
```

Build injects the 8-char git commit hash via rollup `output.banner` (`var __BUILD_COMMIT__ = "abcd1234"`). The server detects new deploys by comparing against `Memory.lastBuildCommit` and triggers a one-time memory audit.
