# Architecture Overview

## Project

A TypeScript Screeps AI bot that manages a colony economy — source mining, hauling, construction, repair,
upgrading, remote harvesting, and defense. Bundled via Rollup into `dist/main.js` and pushed to the
Screeps server via `grunt-screeps`.

## Source Map (128 modules)

```
src/
  main.ts                  Entry point — Screeps calls loop() every tick; orchestration only
  env.ts                   BUILD_COMMIT from git hash (injected by rollup banner)
  hostileUtils.ts          Shared hostile detection helpers (`isHostile`, `findHostiles`)

  bootstrap/
    codeChange.ts          Build-commit change detection and Memory.lastBuildCommit update
    consoleApi.ts          Global console helpers (`remoteMining`, `runMemoryAudit`)

  combat/
    emergencyHealing.ts    Critical ally heal targeting and retreat-heal helpers
    flee.ts                Non-defender hostile flee orchestration
    healing.ts             Shared heal-target prioritization helpers
    remoteRetreat.ts       Remote danger marking, home-retreat routing, and edge-nudge helpers

  debug/
    homeEnergySummary.ts   Home-room energy pressure/recovery summary formatting for debug output
    homeStatus.ts          Home debug orchestration (creep status + mineral section + summary logging)
    homeStatusLine.ts      Home creep status-line formatting and target/job label helpers
    homeStatusMineral.ts   Home-room mineral/extractor/container debug section rendering
    pathVisuals.ts         Remote debug path visualization moveTo hook
    remoteSourceDetails.ts Remote source detail and dropped-resource debug section rendering
    remoteSourceSummary.ts Remote source allocation/capacity summary rendering
    remoteSources.ts       Remote source debug section orchestration
    remoteStatusNav.ts     Remote navigation/target path debug labels
    remoteStatus.ts        Remote creep-status debug orchestration and owned-room enumeration
    remoteStatusLineBuilder.ts Remote creep status-line construction helpers (status/pathing/claim/nav tags)
    remoteStatusLines.ts   Remote creep-status line collection and sort orchestration

  creep.capabilities.ts    Body → capability derivation and archetype inference
  creep.jobRunner.ts       Job-runner orchestration, clearJob helper, and side-effect hook integration
  creep.memoryManagement.ts Dead creep cleanup, fallback role assignment
  creep.populationControl.ts Emergency defender spawning
  creep.harvest.ts         Legacy direct-harvest helper
  creep.roleBalance.ts     Legacy body planner (defender only)

  creeps/
    bodyPlans.ts           Strategic body planning by archetype (`planBodyForArchetype`)
    renewal.ts             Home creep renew gating and standby remote-miner parking
    jobs/
      edgeExitPathing.ts   Exit targeting and forced exit-step pathing helpers
      edgeNavigation.ts    Room-edge recovery, edge sidestep, and random escape helpers
      execution.ts         Job dispatch map and job-clear policy
      executionHarvest.ts  Harvest/mineral execution handlers and stationing behavior
      executionTargets.ts  Job target/station resolver helpers
      executionTransfer.ts Resource transfer/withdraw/pickup/deposit execution handlers
      executionWork.ts     Build/repair/upgrade/heal/controller/idle execution handlers
      memory.ts            Job memory setters, resource/travel jobs, primary-job resume memory
      movement.ts          Movement compatibility exports (`travelRoom`, `moveToJobTarget`, `moveToWithdrawTarget`)
      movementStuck.ts     Shared travel-stuck memory tracking and move-path reset helpers
      movementTargets.ts   Generic move-to-target pathing/repathing logic
      movementTravelRoom.ts Cross-room travelRoom exit routing and escape behavior
      sideEffects.ts       Opportunistic job side effects: healing, offload, and remote-hauler maintenance
      traffic.ts           Traffic-yield requests and priority negotiation

  repairs/
    policy.ts              Shared repair filters and RCL-staged wall/rampart caps

  resources/
    store.ts               Shared Store helpers for resource discovery/totals

  rooms/
    controllerLoad.ts      Room load snapshot memory writes and passive infrastructure reporting
    controllerState.ts     Room context build + room plan snapshot/assignment update helpers
    controllerTypes.ts     Shared room-controller interfaces for extraction modules
    energy.ts              Room energy pressure, refill target, tower ratio, and terminal reserve helpers
    linkGroups.ts          Link group classification policy (source/hub/controller/sink/other)
    links.ts               Link transfer loop and receiver/sender selection
    jobs/
      assignment.ts        Local new-job assignment orchestration
      assignmentHauling.ts Local haul/resource acquisition assignment policy
      current.ts           Current-job retention, reservations, and interrupt policy
      emergencyEnergy.ts   Shared emergency energy-delivery interrupt and assignment policy
      energyTargets.ts     Local energy gather/withdraw/deposit target selection policy
      energyWork.ts        Worker/hauler energy spending orchestration and primary-job resume
      energyWorkAssignment.ts Build/repair/upgrade/refill assignment helpers used by energy-work orchestration
      reservations.ts      Job reservation ledgers and progress reservation accounting
      sourceAssignment.ts  Source assignment, static-mining memory, and stationary-target helpers
      targets.ts           Local resource pickup/salvage/mineral withdrawal targets
      validity.ts          Current-job target validity and resource/work guards
      work.ts              Build/repair/upgrade target ranking and upgrade reservation policy
    planning/
      sources.ts           Local source/mineral planning and source demand/coverage helpers
    spawning/
      accounting.ts        Current/pending fleet capability accounting and renewal-demand helpers
      bodyPolicy.ts        Minimum spawn body checks and legacy role mapping
      planner.ts           Spawn loop and spawn execution
      requestSelection.ts  Local spawn demand modeling and spawn-request selection policy
      remote.ts            Remote spawn request orchestration by remote mode
      remoteHarvest.ts     Harvest-mode remote spawn demand selection
      remoteHarvestSourceDemand.ts Harvest-mode per-source remote spawn demand and standby replacement policy
      remotePolicy.ts      Remote spawn gating and skip logging orchestration
      remotePolicyCost.ts  Remote spawn minimum-cost policy by remote archetype
      remotePolicyShared.ts Shared remote spawn policy predicates and helpers
      spawnRequestHelpers.ts Pending-spawn snapshot plus spawn name/memory helper policy
    remotes/
      assignment.ts        Remote creep assignment orchestration and shared remote plan/travel/build/claimer branches
      assignmentRoleMaintainer.ts Remote maintainer role assignment and remote energy fallback
      assignmentRoleMiner.ts Remote miner source-slot assignment and station routing setup
      assignmentRoles.ts   Remote scout/fallback role assignment and role-handler exports
      coverage.ts          Remote coverage compatibility exports
      remoteCoverageProjections.ts Remote per-source workforce coverage, replacement horizons, and idle-hauler detection
      energy.ts            Remote hauler energy-target orchestration, target-path gating, and stuck-target avoidance memory
      energyTargets.ts     Remote cross-source target selection and assigned-source container preference
      energySourceTargets.ts Remote per-source container/drop target enumeration and source-energy accounting
      remoteSourceStations.ts Remote source station/static-mining policy and miner slot-capping helpers
      remoteEnergyTargetPicker.ts Shared remote energy target-picking helpers
      energyClaims.ts      Remote energy claim accounting, access-slot scoring, and reachability checks
      fleet.ts             Remote fleet enumeration and role-count helpers
      fleetStandby.ts      Remote standby replacement and source-targeted standby helpers
      haulerCycle.ts       Remote hauler pickup/return/top-up/orchestration state machine
      haulerHome.ts        Remote hauler home-behavior compatibility exports
      haulerHomeDelivery.ts Remote hauler home-side delivery routing and sink selection
      haulerHomeIdle.ts    Remote hauler home idle/wander target selection and wander memory
      haulerHomeRenewal.ts Remote hauler renew-cycle policy and spawn renew flow
      infrastructure.ts    Remote infrastructure build eligibility and target selection
      maintenance.ts       Remote maintainer presence/demand checks
      minerStation.ts      Remote miner station stall tracking and route-health updates
      remoteRouteHealth.ts Remote source route-health mutation and station-failure policy
      pathing.ts           Remote path serialization, distance fallback, station selection
      planning.ts          Remote room planning orchestration (visibility/danger/defaults)
      remotePlanningSources.ts Remote source path/container/road planning and demand updates
      renewal.ts           Generic non-hauler remote renew flow
      roads.ts             Remote road-site placement helpers
      scouts.ts            Remote scout pack accounting and room-crowding checks
      scoutOverflow.ts     Overflow remote-scout wander routing and fallback room selection
      standbyMiner.ts      Standby remote-miner handoff and pre-positioning
    structureMemoryCache.ts Room structure-memory refresh/write policy and change detection

  utils/
    hash.ts                Deterministic string hash helper
    selection.ts           Generic closest-target selection helpers

  room.controller.ts       Room orchestration entrypoint and system call sequence (~37 lines)
  room.structures.ts       Structure discovery and structure-cache orchestration

  tower.basics.ts          Tower attack/heal/repair

  role.harvester.ts        Legacy harvester fallback
  role.builder.ts          Legacy builder fallback
  role.upgrader.ts         Legacy upgrader fallback
  role.doctor.ts           Legacy doctor fallback + shared repair utilities
  role.defender.ts         Defender combat behavior
  role.manual.ts           Manual-control stub

  memoryAudit.ts           Memory audit orchestration entry point (runs on deploy)
  memoryAuditCreeps.ts     Memory audit creep helpers (stale travel + re-exports)
  memoryAuditSourceAssignments.ts Memory audit source-assignment dedupe and orphaned-source cleanup
  memoryAuditRemoteMemory.ts Memory audit invalid remote/home creep-memory cleanup
  memoryAuditRooms.ts      Memory audit room/remote-plan cleanup and valid-source/remote set helpers
  debug.ts                 Console debug API and debug tick cadence/orchestration
  spawn.renewal.ts         Per-tick renew-spawn reservation helper

  types/
    shared.d.ts            Global unions (`CreepArchetype`, `CreepJobType`, `EnergyStructure`, etc.)
    roomPlans.d.ts         Room structure/load/source/mineral/remote plan memory interfaces
    memory.d.ts            Creep/room/spawn/root Memory interface extensions
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
│ 5. memoryAudit.runFullAudit() on build diff │
│    - Full consistency audit on new deploy   │
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
