---
name: Known Issues
description: Current known alignment, cleanup, and architecture follow-up work
type: project
---

# Known Issues

This file tracks known follow-up work that future agents should consider before making nearby edits.

## Runtime Cleanup

- `.DS_Store` files exist in the repo and `.ai`; remove them in a dedicated cleanup commit and make sure `.gitignore` covers them.

## Strategic Alignment

- Local miners now include one standby substitute, but active source miner scaling is still mostly count-based and does not explicitly add extra active miners when per-source WORK is under target.
- Legacy role scripts (`role.harvester.ts`, `role.builder.ts`) still `delete Memory.creeps[creep.name]` when idle. This can destroy remote-creep memory (archetype, remoteRoom, sourceId, homeRoom) if a remote creep falls through to legacy fallback and happens to be idle. Remove or add a guard.
- Remote danger detection is visibility-driven only; unseen hostiles between scout passes can still cause delayed pauses. Additionally, only scouts write `dangerUntil` — miners and haulers that detect hostiles flee locally but never communicate back, so the home room keeps spawning replacements into danger.
- (Fixed) Remote miner over-spawning: `projectedRemoteMinerWork` now uses full body capabilities for spawning creeps and the spawn loop caps room miners at `sourceCount` active to prevent accumulation.
- (Fixed) Remote hauler now picks from the source container with the most energy (not just the assigned source's container), preventing haulers from ignoring productive sources.
- (Fixed) Remote hauler now opportunistically builds road/container construction sites within range 3 while transiting (not only in the remote room with a near-full container).
- (Fixed) Local standby miner race: `sourceSpawnDeficit` now accepts `pendingStandbyMiners` count and suppresses redundant active-miner spawns when a standby is in-flight and total coverage remains adequate. Previously, if an active miner died while the standby was spawning, an extra active miner was spawned, yielding N+2 for N sources.
- (Fixed) Doctor WORK parts no longer inflate `workerWork` in `measureCapabilities`. Doctors have 2 WORK parts in their body plan but prioritize healing; their work capacity was counted as available for building/repairing/upgrading, reducing the worker deficit signal and causing under-supply of workers.
- (Fixed) Remote hauler idle detection now works when the remote room is invisible. `hasIdleRemoteHauler` no longer immediately returns `false` for unviewed rooms; instead it checks for an empty-store hauler waiting at home, treating it as idle to prevent spawning duplicates before the first one departs.
- (Fixed) Remote hauler home-room loop: `assignRemoteCreep()` no longer routes empty `remoteHauler` creeps in the home room to withdraw from local links. That branch trapped haulers in home `withdrawEnergy`/`depositEnergy` cycling and prevented outbound remote hauling.
- (Fixed) Worker `workRatio` now activates at RCL 3+ (was RCL 4+), and ratio 3 at RCL 4+ with >30k construction (was RCL 6+). This gives workers more WORK parts per body at lower RCL, reducing the number of workers needed to meet demand.
- (Fixed) Worker energy-spending priority regression: `assignEnergySpendingJob` could assign the "guaranteed upgrader" before the "guaranteed builder". In low-worker rooms this starved construction despite available storage energy. The ordering is restored so one builder is reserved before upgrade whenever construction sites exist.
- (Fixed) Hauler refill-from-storage: empty haulers never considered storage as a withdrawal source, so when no containers/links had energy but storage did and spawns needed refilling, haulers idled instead of doing storage→spawn runs. Fixed by adding a hauler-specific check in `assignJob`'s gathering phase (`room.controller.ts`) that routes the hauler to storage when `refillSpawnTarget` or `refillTowerTarget` is non-null.
- (Fixed) Hauler overflow: `chooseSpawnRequest()` had no hard count maximum for local haulers — only a capacity check. Old small-body haulers (from early-game or low-energy spawns) kept `haulerCapacity` below demand, causing 7–8 haulers to accumulate at RCL 6. Fixed by refactoring `desiredHaulerCapacity` to return `{ demand, maxCount }` (exposing the already-computed `maxHaulerCreeps`) and adding a `haulerCountWithPending < maxHaulerCount` guard in `chooseSpawnRequest`. RemoteHaulers were already adequately capped (`MAX_REMOTE_HAULERS_PER_SOURCE=2`, per-room cap, idle detection).
- (Fixed) Worker overflow: `chooseSpawnRequest()` had no hard count cap — workers spawned until total WORK capacity met `desiredWorkerWork()` (up to 12+ at high RCL with many construction sites), producing 12 workers at RCL 6. Fixed by adding `maxWorkerCount` per-RCL cap `[0,2,2,2,3,4,4,4,4]` in `chooseSpawnRequest()`, adding `!pending.some(r => r.archetype === 'worker')` to the emergency-recovery guard, adding `'defender'` to `CreepArchetype` in `types.d.ts`, adding a defender role check in `inferArchetype()` before the `return 'worker'` fallback, and excluding `'defender'` archetype from `workerWork` in `measureCapabilities()`. Previously ATTACK+MOVE defender creeps were misclassified as workers and consumed a worker count slot.
- Remote path demand can be noisy when long paths are temporarily incomplete (fallback distance is conservative by design).
- Wall/rampart repair caps (`wallRampartRepairCap` in `role.doctor.ts`) are hardcoded; a future improvement would make them configurable via `room.memory.plan` for rooms that want custom defense budgets.

## Architecture Cleanup

- Two parallel body planning systems exist: `creep.capabilities.ts:planBodyForArchetype()` (strategic) and `creep.roleBalance.ts:balanceSpec()` (legacy). They can produce different bodies for similar purposes. Unify when legacy roles are fully retired.
- Structure discovery cache is still write-through only (not read back); writes are now throttled and forced on structure-count changes.
- `firstStoredResource()` exists in both `creep.jobRunner.ts` and `room.controller.ts`; consider consolidating once shared utilities exist.
- `closest()` and `closestByRange()` in `room.controller.ts` overlap heavily.
- `interruptReason` is written for observability but not consumed.
- Remote hauler repair/build branches in `assignRemoteCreep()` rely on the optional trailing WORK part added by `planBodyForArchetype` (only when budget allows +100 energy). These branches do nothing if the hauler spawned without the WORK part.
- Remote room memory (plans, serialized paths, demand data) is never garbage-collected when a room is disabled. Over many enable/disable cycles, this accumulates stale memory.
- `room.controller.ts` is 2,868 lines — a god module. Candidates for extraction: remote room logic (~400 lines), spawn planning (~250 lines), job assignment (~300 lines).

## Deferred By Strategy

- Market trading is not enabled.
- Lab reactions and boosts are not enabled.
- Factory automation is not enabled.
- Power processing is not enabled.
- Observer automation is not enabled.
- Nuker automation is not enabled.
- Combat squads and remote defense are not enabled.
- Autonomous claiming is not enabled.

These should stay disabled until `.ai/memory/STRATEGY.md` is updated with explicit policy.
