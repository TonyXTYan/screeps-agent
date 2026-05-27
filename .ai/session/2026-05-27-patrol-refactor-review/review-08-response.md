# Review 08 Response (Implementation)

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Scope implemented:** `R8-1`, `R8-2`, `R8-3`, `R8-7`  
**Deferred:** `R8-4`, `R8-5`, `R8-6`, `R8-8`

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

- **R8-4** Melee-only patrol body composition (war-mode/combat doctrine scope)
- **R8-5** Center-tile navigation optimization
- **R8-6** Per-tick assignment scan optimization
- **R8-8** Legacy `populationControl`/`defender` tree cleanup

These are intentionally deferred to avoid expanding this patch beyond the selected `R8-1/2/3 + cleanup` scope.
