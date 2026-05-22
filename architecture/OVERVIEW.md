# Architecture Overview

## Project

A TypeScript Screeps AI bot that manages a colony economy — source mining, hauling, construction, repair,
upgrading, remote harvesting, and defense. Bundled via Rollup into `dist/main.js` and pushed to the
Screeps server via `grunt-screeps`.

## Source Map (28 modules)

```
src/
  main.ts                         Entry point — Screeps calls loop() every tick
  env.ts                          BUILD_COMMIT from git hash (injected by rollup banner)
  types.d.ts                      All Memory extensions and type unions

  constants/                      Shared constants (body ratios, danger ticks)
  utils/                          Shared helpers (path, creep targeting)

  combat/
    hostiles.ts                   Hostile detection (isHostile, findHostiles)
    flee.ts                       Non-combat creep flee/retreat from hostiles
    heal.ts                       Emergency combat healing logic
    defender.ts                   Defender combat behavior

  jobs/
    runner.ts                     Job execution dispatch (19 job types)

  creeps/
    capabilities.ts               Body → capability derivation, archetype inference, body planning
    memory.ts                     Dead creep cleanup, fallback role assignment
    harvest.ts                    Legacy direct-harvest helper
    population.ts                 Emergency defender spawning
    roleBalance.ts                Legacy body planner (defender only)
    roles/                        Legacy fallback state machines
      builder.ts, harvester.ts, upgrader.ts, doctor.ts, manual.ts

  room/
    controller.ts                 Main economic controller
    structures.ts                 Structure discovery, link classification

  renewal/
    home.ts                       Home creep renewal logic
    remote.ts                     Remote creep renewal (in room/controller.ts)
    standby.ts                    Standby miner parking
    spawn.ts                      Per-tick renew-spawn reservation helper

  tower/
    basics.ts                     Tower attack/heal/repair

  console/
    api.ts                        Console helpers (remoteMining, debug, runMemoryAudit)

  debug/
    index.ts                      Console debug output (tickAutoDebug, tickRemoteCreepLog)
    paths.ts                      Debug path visualization

  audit/
    memory.ts                     Memory consistency audit (runs on deploy)
```

## Tick Loop (main.ts — 77 lines, thin orchestrator)

The `loop()` function has been extracted into focused modules. Combat logic lives in `src/combat/`, console APIs in `src/console/`, debug path hooks in `src/debug/paths.ts`, and renewal logic in `src/renewal/`.

```
┌─────────────────────────────────────────────┐
│ loop() — called by Screeps every tick       │
├─────────────────────────────────────────────┤
│ 1. refreshDebugPathScan() — debug/paths.ts  │
│ 2. installConsoleHelpers() — console/api.ts │
│ 3. installDebugHelpers() — debug/index.ts   │
│ 4. installMoveDebugHook() — debug/paths.ts  │
│ 5. Log tick, generate pixel if bucket ≥10k  │
├─────────────────────────────────────────────┤
│ 6. creepMemoryManagement.run()              │
│ 7. memoryAudit.runFullAudit() on code change│
├─────────────────────────────────────────────┤
│ 8. For each owned room:                     │
│    a. populationControl.checkDefenders()    │
│    b. roomController.run()                  │
│    c. towerBasics.run()                     │
├─────────────────────────────────────────────┤
│ 9. For each non-spawning creep:             │
│    a. Assign remote jobs if remoteRoom set  │
│    b. tryRenewStandbyMiner() — renewal/     │
│    c. Run defender combat (bypasses jobs)   │
│    d. fleeFromHostiles() — combat/flee.ts   │
│    e. tryRenewHomeCreep() — renewal/home.ts │
│    f. creepJobRunner.run() — jobs/runner.ts │
│    g. Fallback: legacy role handlers        │
├─────────────────────────────────────────────┤
│ 10. debug.tickRemoteCreepLog() / tickAutoDebug()│
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
