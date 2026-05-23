# Architecture Overview

## Project

A TypeScript Screeps AI bot that manages a colony economy — source mining, hauling, construction, repair,
upgrading, remote harvesting, and defense. Bundled via Rollup into `dist/main.js` and pushed to the
Screeps server via `grunt-screeps`.

## Source Map (25 modules)

```
src/
  main.ts                  Entry point — Screeps calls loop() every tick
  env.ts                   BUILD_COMMIT from git hash (injected by rollup banner)
  hostileUtils.ts          Shared hostile detection helpers (`isHostile`, `findHostiles`)
  utils.shared.ts          Shared utilities (`firstStoredResource`, `nudgeFromRoomEdge`, `mostCriticalCreep`, `isReachable`)
  repair.rules.ts          Repair rules (`wallRampartRepairCap`, `repairStructureFilter`)
  remote.operations.ts     Remote room operations (scouting, roads, haulers, miners, energy targets, memory GC)

  creep.capabilities.ts    Body → capability derivation, archetype inference, body planning
  creep.jobRunner.ts       Job execution dispatch (19 job types)
  creep.memoryManagement.ts Dead creep cleanup, fallback role assignment
  creep.populationControl.ts Emergency defender spawning
  creep.harvest.ts         Legacy direct-harvest helper
  creep.roleBalance.ts     Legacy body planner (defender only)

  room.controller.ts       Main economic controller (~2,838 lines; spawn planning, job assignment)
  room.structures.ts       Structure discovery, link classification

  tower.basics.ts          Tower attack/heal/repair

  role.harvester.ts        Legacy harvester fallback
  role.builder.ts          Legacy builder fallback
  role.upgrader.ts         Legacy upgrader fallback
  role.doctor.ts           Legacy doctor fallback (no longer exports shared utilities)
  role.defender.ts         Defender combat behavior
  role.manual.ts           Manual-control stub

  memoryAudit.ts           Memory consistency audit (runs on deploy)
  debug.ts                 Console debug helpers
  spawn.renewal.ts         Per-tick renew-spawn reservation helper
  types.d.ts               All Memory extensions and type unions
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
│ 5. memoryAudit.runFullAudit()               │
│    - Full consistency audit on new deploy   │
│    - Skipped if CPU bucket < 0              │
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
│    e. creepJobRunner.run() — execute job    │
│    f. Fallback: role.harvester/builder/...  │
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
| **Strategic** | `room.controller` assigns `jobType`/`jobTargetId` → `creep.jobRunner` executes | All economic creeps (miners, haulers, workers, healers, remote roles, mineral miners) |
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
