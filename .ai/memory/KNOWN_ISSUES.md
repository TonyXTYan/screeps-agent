---
name: Known Issues
description: Current known alignment, cleanup, and architecture follow-up work
type: project
---

# Known Issues

This file tracks known follow-up work that future agents should consider before making nearby edits.

## Runtime Cleanup

- `src/main.ts` still logs `sync test 1`; remove it or replace it with useful telemetry.
- `.DS_Store` files exist in the repo and `.ai`; remove them in a dedicated cleanup commit and make sure `.gitignore` covers them.

## Strategic Alignment

- `sourceSpawnDeficit()` guarantees one miner per source, but does not clearly spawn extra miner work for underpowered assigned miners.
- Legacy role scripts can still delete creep memory when idle; this should not be part of the long-term strategic path.
- Remote spawn capacity is measured broadly, not per configured remote room.
- Remote danger policy exists in Memory but needs stronger detection/update logic.

## Architecture Cleanup

- Structure discovery writes IDs to Memory every tick, but the cache is not yet read back.
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
