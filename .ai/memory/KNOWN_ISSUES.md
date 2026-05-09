---
name: Known Issues
description: Current known alignment, cleanup, and architecture follow-up work
type: project
---

# Known Issues

This file tracks known follow-up work that future agents should consider before making nearby edits.

## Runtime Cleanup

- `.DS_Store` files exist in the repo and `.ai`; remove them in a dedicated cleanup commit and make sure `.gitignore` covers them.
- `isArmedHostile()` is duplicated 5 times identically (`role.defender.ts`, `tower.basics.ts`, `creep.populationControl.ts`, `room.controller.ts`, `main.ts`). Extract to a shared `utils.ts` module.
- `installMoveDebugHook` in `main.ts` monkey-patches `Creep.prototype.moveTo` every tick unconditionally. Should be guarded behind a check for whether any remote room has `debugPaths: true`.

## Strategic Alignment

- Local miners now include one standby substitute, but active source miner scaling is still mostly count-based and does not explicitly add extra active miners when per-source WORK is under target.
- Legacy role scripts (`role.harvester.ts`, `role.builder.ts`) still `delete Memory.creeps[creep.name]` when idle. This can destroy remote-creep memory (archetype, remoteRoom, sourceId, homeRoom) if a remote creep falls through to legacy fallback and happens to be idle. Remove or add a guard.
- Remote danger detection is visibility-driven only; unseen hostiles between scout passes can still cause delayed pauses. Additionally, only scouts write `dangerUntil` — miners and haulers that detect hostiles flee locally but never communicate back, so the home room keeps spawning replacements into danger.
- Remote path demand can be noisy when long paths are temporarily incomplete (fallback distance is conservative by design).
- Wall/rampart repair caps (`wallRampartRepairCap` in `role.doctor.ts`) are hardcoded; a future improvement would make them configurable via `room.memory.plan` for rooms that want custom defense budgets.

## Architecture Cleanup

- Two parallel body planning systems exist: `creep.capabilities.ts:planBodyForArchetype()` (strategic) and `creep.roleBalance.ts:balanceSpec()` (legacy). They can produce different bodies for similar purposes. Unify when legacy roles are fully retired.
- Structure discovery cache is still write-through only (not read back); writes are now throttled and forced on structure-count changes.
- `firstStoredResource()` exists in both `creep.jobRunner.ts` and `room.controller.ts`; consider consolidating once shared utilities exist.
- `closest()` and `closestByRange()` in `room.controller.ts` overlap heavily.
- `interruptReason` is written for observability but not consumed.
- Opportunistic `remoteHauler` repair branch in `assignRemoteCreep()` (`room.controller.ts:169-176`) is dead code since remote haulers no longer have WORK parts. The fallthrough at line 178 handles routing correctly, but the dead branch should be removed.
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
