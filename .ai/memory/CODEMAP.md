---
name: Code Map
description: Quick mapping from architecture concepts to implementation files
type: project
---

# Code Map

Use this as the first stop before editing code.

## Tick Flow

- `src/main.ts` — Screeps `loop()` entry point and tick orchestration
- `src/bootstrap/codeChange.ts` — build-commit change detection and `Memory.lastBuildCommit` update
- `src/bootstrap/consoleApi.ts` — global console helpers (`remoteMining`, `runMemoryAudit`)
- `src/creep.memoryManagement.ts` — dead creep memory cleanup and fallback role/remote initialization
- `src/memoryAudit.ts` — memory consistency audit orchestration (runs on deploy when commit hash changes)
- `src/memoryAuditRooms.ts` — memory-audit room/remote-plan cleanup helpers and valid source/remote key set builders
- `src/memoryAuditCreeps.ts` — memory-audit creep helpers (stale travel cleanup + audit helper re-exports)
- `src/memoryAuditSourceAssignments.ts` — memory-audit duplicate source-assignment and orphaned source-reference cleanup
- `src/memoryAuditRemoteMemory.ts` — memory-audit invalid remote/home creep-memory cleanup
- `src/env.ts` — exports `BUILD_COMMIT` from build-injected git hash
- `src/creep.populationControl.ts` — emergency defender spawning before economic spawn planning
- `src/room.controller.ts` — room-level orchestration entrypoint (plan init/update, links, jobs, spawn planner)
- `src/room.structures.ts` — structure discovery and structure-cache orchestration
- `src/rooms/controllerState.ts` — room context build plus room-plan snapshot and assignment update helpers
- `src/rooms/controllerLoad.ts` — room load snapshot memory writes and passive infrastructure reporting
- `src/rooms/linkGroups.ts` — link group classification policy (source/hub/controller/sink/other)
- `src/rooms/structureMemoryCache.ts` — room structure-memory refresh/write policy and change detection
- `src/spawn.renewal.ts` — per-tick spawn reservation helper for renew actions
- `src/creeps/bodyPlans.ts` — strategic archetype body planning (`planBodyForArchetype`)
- `src/creeps/renewal.ts` — home renew gating and standby remote-miner parking
- `src/combat/emergencyHealing.ts` — critical ally heal targeting and retreat-heal helpers
- `src/combat/flee.ts` — non-defender hostile flee orchestration
- `src/combat/healing.ts` — shared heal-target prioritization helpers
- `src/combat/remoteRetreat.ts` — remote danger marking, home-retreat routing, and edge-nudge helpers
- `src/tower.basics.ts` — tower attack, heal, and repair behavior
- `src/creep.jobRunner.ts` — job-runner orchestration, clearJob helper, and side-effect hook integration before legacy role fallback
- `src/creeps/jobs/edgeExitPathing.ts` — room-exit targeting and forced exit-step pathing helpers
- `src/creeps/jobs/edgeNavigation.ts` — room-edge recovery, edge sidestep, and random escape nudges
- `src/creeps/jobs/execution.ts` — job dispatch map and job-clear policy
- `src/creeps/jobs/executionHarvest.ts` — harvest/mineral execution handlers and stationing behavior
- `src/creeps/jobs/executionTargets.ts` — job target/station resolver helpers
- `src/creeps/jobs/executionTransfer.ts` — resource transfer/withdraw/pickup/deposit execution handlers
- `src/creeps/jobs/executionWork.ts` — build/repair/upgrade/heal/controller/idle execution handlers
- `src/creeps/jobs/memory.ts` — job memory setters, resource/travel job assignment helpers, and primary-job resume memory helpers
- `src/creeps/jobs/movement.ts` — movement compatibility exports (`travelRoom`, `moveToJobTarget`, `moveToWithdrawTarget`)
- `src/creeps/jobs/movementStuck.ts` — shared travel-stuck memory tracking and move-path reset helpers
- `src/creeps/jobs/movementTargets.ts` — generic move-to-target pathing and repathing behavior
- `src/creeps/jobs/movementTravelRoom.ts` — cross-room `travelRoom` exit routing and escape behavior
- `src/creeps/jobs/sideEffects.ts` — opportunistic job side effects: remote-hauler pass-by maintenance, adjacent offload/link relay, and HEAL-part auto-healing
- `src/creeps/jobs/traffic.ts` — traffic-yield requests, priority negotiation, and yield-memory cleanup
- `src/debug.ts` — console debug API and debug tick cadence/orchestration
- `src/debug/homeEnergySummary.ts` — home-room energy/recovery summary formatting for debug output
- `src/debug/homeStatus.ts` — home debug orchestration (creep status, mineral section, and summary logging)
- `src/debug/homeStatusLine.ts` — home creep status-line formatting and target/job label helpers
- `src/debug/homeStatusMineral.ts` — home mineral/extractor/container debug-section rendering
- `src/debug/pathVisuals.ts` — debug path visualization hook for `Creep.moveTo`
- `src/debug/remoteSourceDetails.ts` — remote source detail lines and dropped-resource debug-section rendering
- `src/debug/remoteSourceSummary.ts` — remote source allocation/capacity summary debug-section rendering
- `src/debug/remoteSources.ts` — remote source debug section orchestration
- `src/debug/remoteStatusNav.ts` — remote target/nav/path debug label helpers
- `src/debug/remoteStatus.ts` — remote creep-status debug orchestration and owned-room enumeration for debug ticks
- `src/debug/remoteStatusLineBuilder.ts` — remote creep status-line construction helpers (status/pathing/claim/nav tags)
- `src/debug/remoteStatusLines.ts` — remote creep-status line collection and sort orchestration
- `src/repairs/policy.ts` — shared repair filters and RCL-staged wall/rampart caps
- `src/resources/store.ts` — shared Store helpers for first-resource selection and stored-resource totals
- `src/rooms/controllerTypes.ts` — shared room-controller interfaces used by extracted modules
- `src/rooms/energy.ts` — room energy pressure, spawn/tower refill targeting, terminal reserve math, and energy recovery hysteresis
- `src/rooms/links.ts` — room link transfer loop and link receiver/sender selection
- `src/rooms/jobs/assignment.ts` — local new-job assignment orchestration
- `src/rooms/jobs/assignmentHauling.ts` — haul/resource acquisition assignment policy (pickup/salvage/mineral/energy withdraw branches)
- `src/rooms/jobs/current.ts` — current-job retention, reservation carry-forward, and interrupt policy
- `src/rooms/jobs/emergencyEnergy.ts` — shared emergency energy-delivery decision, interrupt, and assignment helpers
- `src/rooms/jobs/energyTargets.ts` — local energy gather/withdraw/deposit target-selection policy
- `src/rooms/jobs/energyWork.ts` — worker/hauler energy spending orchestration and primary-job resume checks
- `src/rooms/jobs/energyWorkAssignment.ts` — build/repair/upgrade/refill assignment helpers for energy spending
- `src/rooms/jobs/reservations.ts` — job reservation ledgers and progress reservation accounting
- `src/rooms/jobs/sourceAssignment.ts` — source assignment, static-mining memory, and stationary-target helpers
- `src/rooms/jobs/targets.ts` — local resource pickup, salvage, and mineral-container withdrawal target selection
- `src/rooms/jobs/validity.ts` — current-job target validity, terminal/storage guards, and build/repair/work checks
- `src/rooms/jobs/work.ts` — construction/repair/upgrade target selection and upgrade reservation policy
- `src/rooms/planning/sources.ts` — local source/mineral planning and source demand/coverage helpers
- `src/rooms/spawning/accounting.ts` — current/pending fleet capability accounting, pending spawn request helpers, and renewal-demand selection
- `src/rooms/spawning/bodyPolicy.ts` — minimum spawn body checks and legacy role mapping
- `src/rooms/spawning/planner.ts` — spawn loop and spawn execution
- `src/rooms/spawning/requestSelection.ts` — local spawn demand modeling and spawn-request selection policy
- `src/rooms/spawning/remote.ts` — remote spawn request orchestration by remote mode
- `src/rooms/spawning/remoteHarvest.ts` — harvest-mode remote spawn demand selection
- `src/rooms/spawning/remoteHarvestSourceDemand.ts` — harvest-mode per-source remote spawn demand and standby replacement policy
- `src/rooms/spawning/remotePolicy.ts` — remote spawn gating and skip-logging orchestration
- `src/rooms/spawning/remotePolicyCost.ts` — remote spawn minimum-cost policy by remote archetype
- `src/rooms/spawning/remotePolicyShared.ts` — shared remote spawn policy predicates and route-congestion helpers
- `src/rooms/spawning/spawnRequestHelpers.ts` — pending-spawn snapshot plus spawn name/memory helpers
- `src/rooms/remotes/assignment.ts` — remote creep assignment orchestration and shared remote plan/travel/build/claimer branches
- `src/rooms/remotes/assignmentRoleMaintainer.ts` — remote maintainer role assignment and remote energy fallback flow
- `src/rooms/remotes/assignmentRoleMiner.ts` — remote miner source-slot assignment and station routing setup
- `src/rooms/remotes/assignmentRoles.ts` — remote scout/fallback role assignment and role-handler exports
- `src/rooms/remotes/coverage.ts` — remote coverage compatibility exports
- `src/rooms/remotes/remoteCoverageProjections.ts` — remote per-source workforce coverage, replacement horizons, and idle-hauler detection
- `src/rooms/remotes/remoteSourceStations.ts` — remote source station/static-mining policy and miner slot-capping helpers
- `src/rooms/remotes/energy.ts` — remote hauler energy-target orchestration, target-path gating, and stuck-target avoid-target memory
- `src/rooms/remotes/energyTargets.ts` — remote cross-source target selection and assigned-source container preference
- `src/rooms/remotes/energySourceTargets.ts` — remote per-source container/drop target enumeration and source-energy accounting
- `src/rooms/remotes/remoteEnergyTargetPicker.ts` — shared remote energy target-picking helpers
- `src/rooms/remotes/energyClaims.ts` — remote energy target claim accounting, access-slot scoring, and reachability checks
- `src/rooms/remotes/fleet.ts` — home-room remote fleet enumeration and role counts
- `src/rooms/remotes/fleetStandby.ts` — remote standby replacement helpers and source-targeted standby selection
- `src/rooms/remotes/haulerCycle.ts` — remote hauler pickup/return/top-up orchestration and cycle-state memory
- `src/rooms/remotes/haulerHome.ts` — remote hauler home-behavior compatibility exports
- `src/rooms/remotes/haulerHomeDelivery.ts` — remote hauler home-side delivery routing and sink selection
- `src/rooms/remotes/haulerHomeIdle.ts` — remote hauler home idle/wander target selection and wander memory
- `src/rooms/remotes/haulerHomeRenewal.ts` — remote hauler renew-cycle policy and spawn renew flow
- `src/rooms/remotes/infrastructure.ts` — remote road/container build eligibility and construction-site targeting
- `src/rooms/remotes/maintenance.ts` — remote maintainer presence, infrastructure demand, and degraded-route demand checks
- `src/rooms/remotes/minerStation.ts` — remote miner station stall detection and route-health mutation
- `src/rooms/remotes/remoteRouteHealth.ts` — remote source route-health mutation and station-failure policy
- `src/rooms/remotes/pathing.ts` — remote path serialization, distance fallback, entry/station selection, and route-health helpers
- `src/rooms/remotes/planning.ts` — remote room planning orchestration (visibility, danger marking, and defaults)
- `src/rooms/remotes/remotePlanningSources.ts` — remote source path/container/road planning and source-demand updates
- `src/rooms/remotes/renewal.ts` — generic non-hauler remote renew flow
- `src/rooms/remotes/roads.ts` — remote road-site placement and road-cursor helpers
- `src/rooms/remotes/scouts.ts` — remote scout pack accounting, non-scout assignment checks, and visible-room crowd checks
- `src/rooms/remotes/scoutOverflow.ts` — overflow remote-scout wander routing, neighbor-room selection, and in-room wander targets
- `src/rooms/remotes/standbyMiner.ts` — standby remote-miner source handoff and remote pre-positioning
- `src/utils/hash.ts` — deterministic string hash helper for wander target selection
- `src/utils/selection.ts` — generic closest-target selection helpers

## Shared Utilities

- Hostile detection is centralized in `src/hostileUtils.ts` (`isHostile`, `findHostiles`) and used by `combat/flee.ts`, `room.controller.ts`, `tower.basics.ts`, `creep.populationControl.ts`, and `role.defender.ts`.
- `spawn.renewal.ts` — shared `acquireRenewSpawn()` / `nearestSpawn()` helper used by home, remote, and defender renew flows.
- `src/utils/hash.ts` — shared deterministic hash helper for stable pseudo-random room positions.

## Architecture Docs

- Architecture overview — `architecture/OVERVIEW.md`
- Economy details — `architecture/ECONOMY.md`
- Remote behavior details — `architecture/REMOTES.md`
- Defense details — `architecture/DEFENSE.md`
- Known follow-up work — `.ai/memory/KNOWN_ISSUES.md`
- RCL/labs/power deferred work — `.ai/memory/ROADMAP.md`

## Core Economy

- Source/mineral planning — `src/rooms/planning/sources.ts`
- Link classification — policy in `src/rooms/linkGroups.ts`, orchestration in `src/room.structures.ts`
- Link transfers — `src/rooms/links.ts`
- Energy pressure, refill targeting, terminal reserve floors, and recovery hysteresis — `src/rooms/energy.ts`
- Job memory writes and primary-job resume memory — `src/creeps/jobs/memory.ts`
- Local source/mineral/gather/fallback job assignment — orchestration in `src/rooms/jobs/assignment.ts`, haul/resource acquisition policy in `src/rooms/jobs/assignmentHauling.ts`
- Current-job retention, interrupt policy, and reservation carry-forward — `src/rooms/jobs/current.ts`
- Shared emergency energy-delivery interruption/assignment policy — `src/rooms/jobs/emergencyEnergy.ts`
- Miner source assignment, static-mining memory, and stationary-target helpers — `src/rooms/jobs/sourceAssignment.ts`
- Current-job target validity and resource/work guards — `src/rooms/jobs/validity.ts`
- Energy spending and primary build/repair/upgrade resume — orchestration in `src/rooms/jobs/energyWork.ts` with assignment helpers in `src/rooms/jobs/energyWorkAssignment.ts`
- Local energy gather/withdraw/deposit target selection — `src/rooms/jobs/energyTargets.ts`
- Local resource pickup/salvage/mineral-withdraw target selection — `src/rooms/jobs/targets.ts`
- Construction/repair/upgrade target selection and upgrade reservation policy — `src/rooms/jobs/work.ts`
- Spawn accounting and current/pending capability measurement — `src/rooms/spawning/accounting.ts`
- Spawn body minimums and legacy role mapping — `src/rooms/spawning/bodyPolicy.ts`
- Local spawn demand selection — `src/rooms/spawning/requestSelection.ts`; spawn loop/execution lives in `src/rooms/spawning/planner.ts`, with pending-spawn snapshot and spawn name/memory helpers in `src/rooms/spawning/spawnRequestHelpers.ts`. Multiple free spawns share a pending-request ledger with planned bodies so in-flight creeps count toward capacity and per-source/per-role caps via `src/rooms/spawning/accounting.ts`.
- Remote spawn demand selection — orchestration in `src/rooms/spawning/remote.ts`, harvest-mode flow in `src/rooms/spawning/remoteHarvest.ts`, and per-source/standby demand policy in `src/rooms/spawning/remoteHarvestSourceDemand.ts`
- Remote spawn gates and minimum body checks (blocks remote spawns when home requests pending, throttles remotes under low stored/spawn energy, and rejects uneconomic scaled remote bodies) — orchestration in `src/rooms/spawning/remotePolicy.ts`, minimum-cost policy in `src/rooms/spawning/remotePolicyCost.ts`, and shared policy predicates/helpers in `src/rooms/spawning/remotePolicyShared.ts`
- Remote fleet enumeration and role counts — `src/rooms/remotes/fleet.ts`
- Remote standby replacement helpers and source-targeted standby selection — `src/rooms/remotes/fleetStandby.ts`
- Remote per-source coverage and replacement horizons — `src/rooms/remotes/remoteCoverageProjections.ts`; station limits/static-mining policy live in `src/rooms/remotes/remoteSourceStations.ts` with compatibility exports from `src/rooms/remotes/coverage.ts`
- Remote maintainer demand checks — `src/rooms/remotes/maintenance.ts`
- Remote scout pack accounting and crowding checks — `src/rooms/remotes/scouts.ts`
- Remote creep assignment orchestration — `src/rooms/remotes/assignment.ts`
- Remote role-specific assignment helpers — `src/rooms/remotes/assignmentRoles.ts`, `src/rooms/remotes/assignmentRoleMiner.ts`, `src/rooms/remotes/assignmentRoleMaintainer.ts`
- Overflow remote-scout wander routing — `src/rooms/remotes/scoutOverflow.ts`
- Remote standby miner system (TTL-triggered source-targeted handoff with remote pre-positioning; blank standby reassignment; pending container-site awareness; no standby renew) — `src/rooms/remotes/standbyMiner.ts` with standby detection/replacement helpers from `src/rooms/remotes/fleetStandby.ts`, source coverage/replacement math from `src/rooms/remotes/remoteCoverageProjections.ts` plus station policy from `src/rooms/remotes/remoteSourceStations.ts` (compat exports in `src/rooms/remotes/coverage.ts`), and runtime coordination in `src/creep.jobRunner.ts` and `src/creeps/renewal.ts`
- Remote route health and road placement (degraded-route memory, prioritized road sites, route-health maintainer recovery bypass) — remote room planning orchestration in `src/rooms/remotes/planning.ts`, source-level path/container/road planning in `src/rooms/remotes/remotePlanningSources.ts`, station stall tracking in `src/rooms/remotes/minerStation.ts`, route-health mutation/station-failure policy in `src/rooms/remotes/remoteRouteHealth.ts`, pathing helpers in `src/rooms/remotes/pathing.ts`, road-site mechanics in `src/rooms/remotes/roads.ts`
- Body capability derivation — `src/creep.capabilities.ts`
- Body planning by archetype — `src/creeps/bodyPlans.ts`
- Remote hauler capacity cap (per source) — `src/rooms/remotes/planning.ts`
- Remote hauler energy targeting — orchestration (`findRemoteEnergySource`, target-path gating, stuck-target avoidance memory) lives in `src/rooms/remotes/energy.ts`; per-source container/drop target enumeration and source-energy accounting live in `src/rooms/remotes/energySourceTargets.ts`; assigned-source-first pickup and cross-source overflow selection helpers live in `src/rooms/remotes/energyTargets.ts`; shared target-picking helpers live in `src/rooms/remotes/remoteEnergyTargetPicker.ts`. Per-target claim caps, claim subtraction, access-slot scoring, and reachability checks live in `src/rooms/remotes/energyClaims.ts`.
- Hauling, refill, build, repair, upgrade assignment — source/mineral/gather orchestration in `src/rooms/jobs/assignment.ts`, haul/resource acquisition policy in `src/rooms/jobs/assignmentHauling.ts`, emergency energy-delivery policy in `src/rooms/jobs/emergencyEnergy.ts`, source-assignment/static-mining helpers in `src/rooms/jobs/sourceAssignment.ts`, energy-spending orchestration in `src/rooms/jobs/energyWork.ts`, energy-spend assignment helpers in `src/rooms/jobs/energyWorkAssignment.ts`, current-job retention/interrupt policy in `src/rooms/jobs/current.ts`, current-job validity in `src/rooms/jobs/validity.ts`, resource target helpers in `src/rooms/jobs/targets.ts`, energy target helpers in `src/rooms/jobs/energyTargets.ts`, and energy-state helpers from `src/rooms/energy.ts`; haulers/workers pick dropped resources, salvage ruins/tombstones, then non-energy minerals from the planned mineral container. Workers prefer room storage as the primary `withdrawEnergy` target whenever storage has energy. Haulers prioritize draining hub/controller/sink links first (keeping them ready for `src/rooms/links.ts` transfers), then fall back to terminal, source containers, and source links as overflow. Energy-carrying local haulers/support creeps preempt idle/deposit/withdraw/build/repair/upgrade work to refill spawn/extensions during spawn pressure, then low towers. Terminal energy follows an RCL reserve floor (RCL6/7/8 = 5k/10k/50k) breakable only during energy recovery. Non-miner `harvestSource` assignments are treated as temporary fallback jobs and are interrupted once energy is loaded or storage is available.
- Remote maintainer build targeting is sticky on the current road/container site to prevent rapid target oscillation; retargeting happens only when that target is no longer a valid road/container construction site — `src/rooms/remotes/infrastructure.ts`.
- Remote hauler cycle (assigned-source-first remote pickup with cross-source pickup only for large overflow when assigned source is dry, fill-to-full top-up, far-pickup return at >=75% load, home delivery prioritizes spawn/extension refill then low towers before storage/terminal, post-trip renew only when TTL<1000 to TTL>1400, no-job home idle/wander with TTL<500 renew gate; energy pressure can defer starting renew, but active renew cycles persist next to spawn until TTL>1400) — pickup/return/top-up orchestration in `src/rooms/remotes/haulerCycle.ts`, home-side delivery helpers in `src/rooms/remotes/haulerHomeDelivery.ts`, renew-cycle helpers in `src/rooms/remotes/haulerHomeRenewal.ts`, home-idle/wander helpers in `src/rooms/remotes/haulerHomeIdle.ts` (compat exports in `src/rooms/remotes/haulerHome.ts`), target orchestration in `src/rooms/remotes/energy.ts`, per-source target enumeration/accounting in `src/rooms/remotes/energySourceTargets.ts`, and cross-source selection helpers in `src/rooms/remotes/energyTargets.ts`; renew requests reserve free spawns through `src/spawn.renewal.ts` so multiple renewers spread across multiple spawns, adjacent renewers can preempt reservations held by creeps still traveling to the spawn, and spawn planning keeps one free spawn when multiple spawns are idle to avoid renew-only reservation lockouts.
- Job execution for those assignments — orchestration/clearJob in `src/creep.jobRunner.ts`; dispatch and clear-policy in `src/creeps/jobs/execution.ts`; harvest/mineral handlers in `src/creeps/jobs/executionHarvest.ts`; transfer/withdraw/pickup/deposit handlers in `src/creeps/jobs/executionTransfer.ts`; build/repair/upgrade/heal/controller/idle handlers in `src/creeps/jobs/executionWork.ts`; shared target/station helpers in `src/creeps/jobs/executionTargets.ts`; movement compatibility exports live in `src/creeps/jobs/movement.ts` with cross-room travel in `src/creeps/jobs/movementTravelRoom.ts`, generic move-to-target flow in `src/creeps/jobs/movementTargets.ts`, and stuck-memory/reset helpers in `src/creeps/jobs/movementStuck.ts`; room-edge recovery/edge sidestep live in `src/creeps/jobs/edgeNavigation.ts` and exit-routing/forced-exit pathing live in `src/creeps/jobs/edgeExitPathing.ts`; traffic-yield negotiation lives in `src/creeps/jobs/traffic.ts`; opportunistic offload, HEAL-part auto-heal, link relay, and remote-hauler pass-by build/repair live in `src/creeps/jobs/sideEffects.ts`
- Recovery log regression checker — `.ai/scripts/check-screeps-recovery-regressions.py` parses console NDJSON for recovery-pull mismatches, remote-hauler renew loops, flatlined demand recovery, and stale post-full recovery pull.

## Types And Memory

- Shared unions (`CreepArchetype`, `CreepJobType`, `EnergyStructure`, `WithdrawStructure`, recovery/remote mode unions) — `src/types/shared.d.ts`
- Room/load/source/mineral/remote plan memory interfaces — `src/types/roomPlans.d.ts`
- Creep, room, spawn, and root Memory extensions — `src/types/memory.d.ts`
- Runtime Memory writes for structures/load/plans/energy recovery — `src/room.controller.ts`, `src/rooms/controllerState.ts`, `src/rooms/controllerLoad.ts`, `src/room.structures.ts`, `src/rooms/energy.ts`
- Shared Store resource helpers — `src/resources/store.ts`

## Repair Utilities (Shared)

`src/repairs/policy.ts` exports strategic repair helpers used across the codebase:

- `repairStructureFilter(structure, rcl)` — RCL-staged hit-cap filter for walls/ramparts; imported by `tower.basics.ts`, `room.controller.ts`, and legacy doctor behavior
- `wallRampartRepairCap(rcl)` — returns the hit cap for the given RCL; imported by `room.controller.ts` and job execution repair checks
- `repairJob(creep)` / `repairTargetToRepair(creep)` — used by legacy fallback roles

Wall/rampart hit caps live in `wallRampartRepairCap()`. Tower energy thresholds (dynamic peace/combat gates) live in `tower.basics.ts`. To change staged caps, edit `src/repairs/policy.ts` and update `architecture/DEFENSE.md`.

## Legacy Compatibility

- Legacy role balancing helpers — `src/creep.roleBalance.ts`
- Legacy body planner (`balanceSpec()`) — `src/creep.roleBalance.ts` (DO NOT use for strategic-path creeps; use `planBodyForArchetype()` in `creeps/bodyPlans.ts` instead)
- Legacy direct harvesting helper — `src/creep.harvest.ts`
- Legacy fallback roles — `src/role.harvester.ts`, `src/role.builder.ts`, `src/role.upgrader.ts`, `src/role.doctor.ts`
- Emergency defender behavior — `src/role.defender.ts`
- Manual role stub — `src/role.manual.ts`

Legacy role files should not be the primary path for new strategic behavior.
**Warning**: legacy roles (`harvester`, `builder`) can delete creep memory (`delete Memory.creeps[creep.name]`) when idle. See `KNOWN_ISSUES.md`.

## Common Edit Paths

Adding a new local economy job:

1. Add the job to `CreepJobType` in `src/types/shared.d.ts`.
2. Add execution in `src/creeps/jobs/execution*.ts` and orchestration dispatch in `src/creep.jobRunner.ts`; use `src/creeps/jobs/movement.ts` as the compatibility surface, with `src/creeps/jobs/movementTravelRoom.ts` for cross-room travel, `src/creeps/jobs/movementTargets.ts` for move-to-target behavior, and `src/creeps/jobs/movementStuck.ts` for stuck/reset helpers; use `src/creeps/jobs/edgeNavigation.ts` for room-edge/exit routing and `src/creeps/jobs/traffic.ts` for yield negotiation.
3. Add assignment and reservation logic in `src/rooms/jobs/assignment.ts`, with energy target helpers in `src/rooms/jobs/energyTargets.ts` and resource target helpers in `src/rooms/jobs/targets.ts` if needed.
4. Add or update capability derivation in `src/creep.capabilities.ts` and body planning in `src/creeps/bodyPlans.ts` if needed.
5. Update relevant `architecture/*.md` docs if behavior changes.

Adding a new strategic Memory setting:

1. Update `src/types/memory.d.ts` and `src/types/roomPlans.d.ts` (or `src/types/shared.d.ts` if it introduces a new union).
2. Initialize defaults in `src/room.controller.ts`.
3. Read the setting in assignment or spawn planning.
4. Add an example in the relevant `architecture/*.md` doc.

Changing construction priority:

1. Update `architecture/ECONOMY.md`.
2. Update `constructionPriority()` in `src/rooms/jobs/work.ts`.
3. Validate in-game that builders choose the intended sites.

Changing remote behavior:

1. Update `architecture/REMOTES.md`.
2. Update `RemoteRoomPlan` in `src/types/roomPlans.d.ts` if the config changes.
3. Update `updateRemoteRoomPlans()` in `src/rooms/remotes/planning.ts` (and `src/rooms/remotes/remotePlanningSources.ts` for source-level planning), `remoteSpawnRequest()` orchestration in `src/rooms/spawning/remote.ts` (`src/rooms/spawning/remoteHarvest.ts` + `src/rooms/spawning/remoteHarvestSourceDemand.ts` for harvest-mode demand), `assignRemoteCreep()` in `src/rooms/remotes/assignment.ts`, plus the relevant helper under `src/rooms/remotes/`.
4. Update console-facing docs in `console/REMOTE_MINING_CONSOLE.md` if API behavior or defaults change.
5. Keep expansion opt-in through Memory.

Changing wall/rampart repair caps or tower repair policy:

1. Update `architecture/DEFENSE.md` first.
2. Edit `wallRampartRepairCap()` in `src/repairs/policy.ts` for the staged hit caps.
3. Edit the energy thresholds in `tower.basics.ts` (lines 46–47):
   - `minEnergyForRepair` — controls heal/repair of normal structures (0.5 combat, 0.7 peace)
   - `minEnergyForDefense` — controls wall/rampart repair (0.4 combat, 0.75 peace)
4. The repair-job validity check in `currentJobStillValid()` (`src/rooms/jobs/validity.ts`) automatically uses `wallRampartRepairCap` — no separate update needed.
