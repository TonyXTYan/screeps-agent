# Review 08 Response (Implementation)

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Scope implemented:** `R8-1`, `R8-2`, `R8-3`, `R8-7`  
**Follow-up implemented (Patch 10):** `R8-1 edge`, `R8-4`, `R8-5`, `R8-6`  
**Still deferred:** `R8-8`

## Implemented

1. **R8-1 (critical renew-abandon)**
   - Updated `shouldRenewPatrolNow` to block critical renew when **any armed threat** is visible, not only home-room armed threats.
   - File: `src/role/patrol.ts`

2. **R8-2 (fail-safe lifted too early with in-room patrol)**
   - Updated `remoteArmedFailsafeActive` to keep retreat/spawn blocking active until danger state clears; patrol presence no longer disables fail-safe while threat is active.
   - File: `src/room/remote/planning.ts`

3. **R8-3 (instant clear churn on visible room clear)**
   - Added `REMOTE_DANGER_CLEAR_HOLD_TICKS = 50`.
   - On visible no-hostile ticks while in danger state, danger is clamped to a short hold window before clearing.
   - Files: `src/room/constants.ts`, `src/room/remote/planning.ts`

4. **R8-7 (dead export cleanup)**
   - Removed unused `patrolCoverageForHome` export.
   - File: `src/room/remote/planning.ts`

## Documentation alignment

- Updated defense and remotes architecture docs to match implemented behavior:
  - critical renew blocked by any visible armed threat,
  - fail-safe no longer lifts just because patrol is in-room,
  - 50-tick post-clear hold before danger clears.
- Files: `architecture/DEFENSE.md`, `architecture/REMOTES.md`

## Deferred items

- **R8-8** Legacy `populationControl`/`defender` tree cleanup

## Follow-up patch notes (Patch 10)

- **R8-1 edge case** fixed: renewing patrols now use the 300/500/1400 FSM (`start<=300`, threat-abort `>500`, threat-free stop `>=1400`).
- **R8-4** addressed with hybrid patrol templates (`ATTACK + RANGED_ATTACK + HEAL`) at mid/high tiers.
- **R8-5** addressed by replacing cross-room center-tile navigation with controller/entry-anchor routing and 50-tick controller-area loiter.
- **R8-6** addressed with tick-scoped caches for patrol threat assignments and remote-room patrol coverage scans.

Only `R8-8` remains intentionally deferred.
