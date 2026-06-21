# Review 09 — Patrol patch 9 verification + residual risk scan

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Target commit reviewed:** `c78cb7fc` (“patrol patch 9”)  

## Scope

Verify the last commit’s stated fixes:

- **R8-1** Critical renew-abandon under armed threats
- **R8-2** Fail-safe should not lift just because patrol is in-room
- **R8-3** Avoid instant clear churn on visible “danger cleared”
- **R8-7** Remove dead `patrolCoverageForHome` export

Also scan for remaining patrol-system problems/regressions introduced or still present.

## Verified outcomes

### ✅ R8-2 — Fail-safe no longer lifts due to patrol presence

`remoteArmedFailsafeActive()` no longer checks patrol coverage to disable the gate. It now keys off `skipReason === 'danger'`, `dangerUntil`, and current hostile visibility. This fixes the prior race where a single patrol entering the remote would re-enable remote economy while combat remained live.

### ✅ R8-3 — 50-tick post-clear hold implemented

When a remote is in danger state and becomes visible with **no armed hostiles**, the plan clamps `dangerUntil` to `Game.time + REMOTE_DANGER_CLEAR_HOLD_TICKS` and keeps `skipReason='danger'` until the hold expires. This reduces immediate re-entry churn on brief hostile pathing/visibility changes.

### ✅ R8-7 — Dead export removed

`patrolCoverageForHome` is gone. Coverage gating is now exclusively the remote-local function (`patrolCoverageForRemoteRoom`), which avoids “coverage at home suppresses danger” failure modes.

### ✅ Build sanity

`npm run build` passes on `c78cb7fc`.

## R8-1 status (critical renew): **Mostly addressed, but one edge case remains**

Patch 9 updates the critical renew branch to block renewing when **any visible armed threat exists** (not just home threats). That fixes the specific “remote-only armed threats” gap *for non-renewing patrols*.

**However**, `shouldRenewPatrolNow()` still has this precedence:

- If `creep.memory.renewing === true`, it returns based on **home** armed threats only.

This means a patrol that has already entered renewing mode can continue renewing even when **remote-only armed threats** are visible, because the `renewing` early-return bypasses `hasAnyArmedThreat`.

**Practical impact:** a patrol may “stick” to renewing behavior while a remote threat remains live (especially if it started renewing while threats were clear, then threats re-appeared).

**Suggested follow-up:** in the `creep.memory.renewing` case, consider blocking when `hasAnyArmedThreat` is true (or at least when the threat is in the currently-assigned threat room), not only `hasArmedHomeThreat`.

## Residual patrol-system risks (still present after patch 9)

These are **not** necessarily bugs; they are operational/correctness/CPU risks to keep in mind.

### 🟡 CPU: per-tick “scan all creeps” patterns

- `src/role/patrol.ts` → `activeHomePatrolNames()` scans `Game.creeps` to build the patrol list.
- `src/room/remote/planning.ts` → `patrolCoverageForRemoteRoom()` scans `Game.creeps` inside `updateRemoteRoomPlans()` for each visible remote.

In heavy-creep or multi-remote scenarios, these add avoidable O(N) loops per tick. If CPU becomes tight during invasions (when pathing costs are already high), consider memoizing tick-scoped patrol lists/coverage per home.

### 🟡 Combat doctrine: melee/heal-only patrol templates

Patrol bodies currently include `ATTACK` + `HEAL` without `RANGED_ATTACK`. This may be fine for v1 expel vs basic NPC invaders, but can struggle vs kiting or ranged/heal compositions. This is consistent with earlier review deferrals (war modes).

### 🟡 Movement: center-tile navigation

Patrol threat response and rotation path toward `(25,25)` in room targets. This is simple and often good enough, but can be inefficient or “terrain-unlucky” compared to using exits/stations/anchors or cached approach routes.

## Net result

**Patch 9 successfully fixes the intended R8-2 / R8-3 / R8-7 items and improves R8-1.**  
The main remaining patrol-system correctness edge case observed is the `renewing` early-return still being home-threat-only, which can reintroduce a “renew while remote threat exists” behavior in some timelines.

