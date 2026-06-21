# Review 10 — Patrol patch 10 verification

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Target commit:** `c030b732` (“patrol patch 10”)

## Summary

Patch 10 delivers the promised follow-ups from review 09: **renew FSM (300 / 500 / 1400)**, **tick-scoped CPU caches** for patrol lists / threat assignments / remote coverage, **controller + entry-anchor travel** (less blind `(25,25)`), **50-tick loiter** before rotating remotes, and **hybrid patrol templates** (`ATTACK` + `RANGED_ATTACK` + `HEAL` on larger tiers). `npm run build` passes on this tree.

## Review 09 reconciliation

| Item | Status after patch 10 |
|------|----------------------|
| R8-1 edge (`renewing` bypassed any-armed check) | **Addressed** — `shouldRenewPatrolNow` uses an explicit renewing branch: abort renew when armed threats exist and `TTL > 500`; stop when threat-free and `TTL >= 1400`. |
| R8-6 CPU (per-patrol creep scans) | **Improved** — one `Game.creeps` scan per home per tick for assignments; remote planning uses one aggregated coverage map per home per tick. |
| R8-4 (no ranged on patrol) | **Templates updated** — see caveat below on **combat code**. |
| R8-5 (center-tile routing) | **Mostly improved** — cross-room targets use controller or mirrored exit; fallback `(25,25)` remains for invisible targets / renew travel to home / loiter fallback. |

## Caveats / follow-ups

### Hybrid bodies vs combat loop

`PATROL_BODY_TEMPLATES` now include `RANGED_ATTACK`, but `runThreatResponse` still only calls `creep.attack()` on hostiles and the invader core — **no `rangedAttack` / `rangedMassAttack`**. Ranged parts still help a little (tower damage split) but do not match “hybrid expel” expectations until the combat path uses ranged when `getActiveBodyparts(RANGED_ATTACK) > 0`.

### Renew-under-threat window (by design vs patch 9)

When `TTL <= 300`, `shouldRenewPatrolNow` sets `memory.renewing = true` **without** gating on `hasAnyArmedThreat`. While threats are visible, renew continues until `TTL > 500`, then renew is cleared and the creep re-engages. That is a deliberate tradeoff (short emergency renew under fire); if the desired behavior is “never path to spawn while any armed threat is visible,” that would need an extra guard.

### `patrolRotateAt` memory

`rotatePatrolTarget` still writes `patrolRotateAt`, but rotation timing is now driven by `patrolLoiterUntil` + cadence. The field is mostly **legacy / telemetry** unless something else reads it.

### Deferred

**R8-8** (legacy `populationControl` / `defender` cleanup) remains out of scope per `review-08-response.md`.
