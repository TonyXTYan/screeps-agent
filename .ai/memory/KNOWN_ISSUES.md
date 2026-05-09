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
- Legacy role scripts can still delete creep memory when idle; this should not be part of the long-term strategic path.
- Remote danger detection is visibility-driven only; unseen hostiles between scout passes can still cause delayed pauses.
- Remote path demand can be noisy when long paths are temporarily incomplete (fallback distance is conservative by design).
- Wall/rampart repair caps (`wallRampartRepairCap` in `role.doctor.ts`) are hardcoded; a future improvement would make them configurable via `room.memory.plan` for rooms that want custom defense budgets.

## Architecture Cleanup

- Structure discovery cache is still write-through only (not read back); writes are now throttled and forced on structure-count changes.
- `firstStoredResource()` exists in both `creep.jobRunner.ts` and `room.controller.ts`; consider consolidating once shared utilities exist.
- `closest()` and `closestByRange()` in `room.controller.ts` overlap heavily.
- `interruptReason` is written for observability but not consumed.

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
