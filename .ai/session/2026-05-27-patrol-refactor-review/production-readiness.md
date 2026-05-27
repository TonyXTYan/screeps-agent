# Patrol Feature — Production Readiness Audit

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Patch window audited:** patches 9–12 (current HEAD: `6bf7c45c` "patrol patch 11" + patch 12 planning fix)  
**Method:** Full static analysis of all key files; codegraph structural lookups; runtime cost calculations  

---

## Executive Summary

The patrol feature is **production-ready with caveats**. The end-to-end integration is complete and correctly wired: spawn planning requests patrols at the right priority, the tick loop routes patrol creeps exclusively through `role/patrol.ts`, memory cleanup is automatic on death, and the fail-safe danger markers (patch 12) now correctly cover all enabled remote modes including `reserve` and `claim`. The critical bug from review-11 (danger markers only updating for `harvest` remotes) is confirmed fixed. No blockers were found. There are two warnings worth tracking and two policy-grade notes.

---

## Blockers 🔴

None.

---

## Warnings 🟠

### 🟠 W1 — Sole patrol renewing creates full remote coverage gap

**File:** `src/room/remote/spawn.ts:517-518`, `src/room/remote/planning.ts:306-309`

When a room has exactly 1 enabled remote (`targetPatrol = 1`), and that patrol enters renew at TTL ≤ 300, it spends up to ~1100 ticks renewing (TTL 300 → 1400). During that window:

- `patrolCoverageByRemoteRoom()` in `planning.ts:306` excludes renewing patrols (`if (creep.memory.renewing) { continue; }`), so coverage reads as 0.
- `countFleetForArchetype()` in `spawn.ts:518` **does** count renewing patrols. So `patrolCount = 1 >= targetPatrol = 1` and no replacement is spawned.
- The danger marker fires immediately (`hasArmedHostiles && threatCoverage === 0`), blocking remote spawns and retreating remote creeps for up to `REMOTE_DANGER_TICKS` ticks.

Net effect: one hostile appearing in the remote room during the patrol's renew window triggers a full remote shutdown (remote creeps retreat home, remote spawn requests blocked) with no patrol replacement spawned. This is the **intended renew-is-more-valuable policy**, but it means a hostile can halt remote income for `REMOTE_DANGER_TICKS` ticks (hardcoded in `room/constants.ts`) with zero patrol response.

**Recommendation:** For rooms with exactly 1 enabled remote that have reached baseline patrol operation, consider whether `targetPatrol` should be `ceil(n/2) + 1` to ensure a replacement is always spawning while one renews. This is a policy change, not a bug.

---

### 🟠 W2 — RCL ≥ 6 patrol has no `minimumBodyCost` guard

**File:** `src/room/remote/spawn.ts:521-527`

The `patrolSpawnRequest` at RCL ≥ 6 returns a request with no `minimumBodyCost` or `useFullEnergyCapacity` set. The spawn planner then uses `defaultBudget = max(300, floor(energyCapacityAvailable * 0.5))`. If energy is temporarily low (e.g., during recovery), the scaled-down path in `runSpawnPlanner` (`src/room/remote/spawn.ts:119-183`) can produce the cheapest patrol template at 140 energy (`TOUGH, ATTACK, MOVE`). `meetsMinimumBody` for `patrol` has no archetype-specific check (falls through to `return true`), so this tiny body passes.

A 140-energy patrol is functional (has `ATTACK`) but provides minimal combat value. The RCL < 6 emergency path correctly uses `useFullEnergyCapacity: true` + `minimumBodyCost`; the RCL ≥ 6 path does not.

**Recommendation:** Add a `minimumBodyCost` to the RCL ≥ 6 patrol request equal to the best template affordable at `energyCapacityAvailable`, same as the RCL < 6 emergency path. Or add a `patrol` case to `meetsMinimumBody` requiring at least TOUGH+ATTACK+RANGED_ATTACK+MOVE×3+HEAL (template 3, 440 energy) for non-trivial combat value.

---

## Notes 🟡

### 🟡 N1 — `ATTACK`-only movement in threat response is brittle against future template changes

**File:** `src/role/patrol.ts:70` — `runThreatResponse()`

Movement toward a hostile target is driven exclusively by:
```typescript
if (creep.attack(target) === ERR_NOT_IN_RANGE) {
    creep.moveTo(target, ...);
}
```

If `attack()` returns `ERR_NO_BODYPART` (e.g., all ATTACK parts lost to damage), movement does not trigger. The creep would stall at range > 3, only firing ranged attacks when the hostile moves into range 3. All 7 current templates include at least one `ATTACK` part, so this cannot happen with freshly spawned patrols. However, a heavily-damaged patrol could have all ATTACK parts destroyed while RANGED_ATTACK parts remain, producing this stall condition.

Review-11-fixed correctly noted this is theoretical today. Flag it here for the day templates change.

---

### 🟡 N2 — Renew coverage 1-tick cache mismatch is acceptable

**Files:** `src/room/remote/planning.ts:298-313`, `src/role/patrol.ts:332-337`

Both the patrol coverage cache (`patrolCoverageByRemoteRoom`) and the patrol threat assignment cache (`patrolThreatAssignmentCache`) are tick-scoped. If a patrol's `renewing` flag changes mid-tick (during the same `for (name in Game.creeps)` loop pass), the cached coverage map does not reflect it until next tick. This can produce a 1-tick mismatch where a patrol that just cleared its `renewing` flag is still excluded from coverage.

Self-corrects next tick. Acceptable for CPU efficiency. No action needed.

---

## Confirmed OK ✅

**1. End-to-end integration — fully wired**

- `patrolSpawnRequest` is called from `chooseSpawnRequest` at `src/room/remote/spawn.ts:241`, positioned before hauler/worker/mineral/remote requests. Patrol is spawned with `homeRoom = context.room.name` and no `remoteRoom`, which is correct.
- `legacyRoleForArchetype('patrol')` returns `'patrol'` (`src/room/targeting.ts:95`), so the spawn memory has `role: 'patrol'`.
- `main.ts:127` — `if (creep.memory.role === 'patrol') { rolePatrol.run(creep); continue; }` — patrol is dispatched before `fleeFromHostiles`, `tryRenewHomeCreep`, `creepJobRunner`, and all legacy role fallbacks. The `continue` prevents any interference.
- `creepJobRunner.run()` never executes for patrol creeps.

**2. Memory management — automatic cleanup on death**

`memoryManagement.ts:7-10` deletes the entire `Memory.creeps[name]` entry when a creep is gone. All patrol-specific fields (`patrolRoom`, `patrolLoiterRoom`, `patrolLoiterUntil`, `patrolRouteIndex`, `patrolRotateAt`, `renewing`) are stored in `CreepMemory` and are cleaned up automatically.

**3. Fail-safe correctness after patch 12 — verified**

`updateRemoteRoomPlans` (`src/room/remote/planning.ts:73`) now runs the full danger-marker state machine (visibility check, `lastSeenHostiles`, `hasArmedHostiles`, `threatCoverage`, `skipReason='danger'`, `dangerUntil` set/clear, clear-hold logic) for **all enabled remotes regardless of mode**. The `if (remote.mode !== 'harvest') { continue; }` gate at line 153 now only guards the harvest-specific planning sections.

For `reserve` and `claim` remotes with armed hostiles:
- `remoteArmedFailsafeActive()` in `planning.ts:322` correctly reads `remotePlan.skipReason === 'danger'` and `remotePlan.dangerUntil > Game.time`.
- `controller.ts:160` — claimer/reserver retreat path fires correctly.
- `spawn.ts:305` — spawn skip for `reserve`/`claim` remotes fires correctly.

**4. Body template coverage — all RCL levels affordable**

Patrol body templates in `src/creep/capabilities.ts:22-30` (7 templates, costs: 1160, 830, 770, 440, 430, 320, 140 energy). The cheapest template (template 6: `[TOUGH, ATTACK, MOVE]` = 140 energy) fits within any room's energy capacity at any RCL (minimum 300). No RCL level produces a `planBodyForArchetype('patrol', budget)` that returns an empty array, provided `budget >= 140`.

All 7 templates include at least one `ATTACK` part.

**5. Spawn demand sizing — correct**

At RCL ≥ 6: `baseline = ceil(enabledRemotes / 2)`, `target = min(baseline + hostileRooms, 2 + 2*enabledRemotes)`. For 1 remote: 1 patrol. For 3 remotes: 2 patrols. Formula documented in `architecture/DEFENSE.md` and matches `spawn.ts:512-516`.

At RCL < 6: 1 patrol spawned only when home has armed hostiles. Demand is correctly capped at 1.

**6. Edge cases in patrol.ts — all safe**

- **Empty `enabledRemotes` + not in home room** (`patrol.ts:86-90`): creep navigates `moveTo(25,25,homeRoom)` safely.
- **Empty `enabledRemotes` + already in home room** (`patrol.ts:87-91`): `return` is hit, creep idles. No crash.
- **`homeRoom` undefined** (`patrol.ts:31`): falls back to `creep.room.name`. Spawn always sets `homeRoom`, so this path is theoretical only.
- **`controllerLoiterPoint` seed** (`patrol.ts:232`): includes `Game.time` in the hash input — new seed each tick, no infinite retry on same position. Fallback to `null` after 20 attempts is safe; `controllerLoiterStep` returns `false` and caller falls back to center hold.
- **`patrolTravelAnchor` fallback** (`patrol.ts:183-191`): three-step fallback (controller pos → mirrored exit → `25,25`). The `25,25` fallback is a valid cross-room travel destination; `moveTo` handles unreachable rooms gracefully.

**7. Renew FSM — no double-management**

Patrol's `shouldRenewPatrolNow` / `tryRenewPatrol` exclusively handle renew state (`patrol.ts:440-481`). The `continue` on `main.ts:127` prevents `tryRenewHomeCreep` from ever executing for patrol creeps. No contention.

**8. Tick-scoped caches — correct**

- `patrolCacheTick` in `patrol.ts:14` and `patrolCoverageCacheTick` in `planning.ts:32` are module-level and correctly reset via `refreshPatrolCachesForTick()` / `refreshPatrolCoverageCacheForTick()` at the start of each tick's first call.
- Cache keys are per-homeRoom for coverage, and `homeRoom + '|' + threatSignature(threats)` for threat assignment — no cross-home contamination.

**9. Architecture alignment — docs and code in sync after patch 12**

`architecture/DEFENSE.md` and `architecture/REMOTES.md` describe the danger fail-safe as mode-agnostic. Code now matches. All other documented behaviors (renew TTL thresholds, coverage formula, baseline patrol math, threat priority scoring, hybrid combat actions) verified to match `patrol.ts` and `spawn.ts` implementations.

**10. Known issues registry — no unresolved patrol blockers**

`.ai/memory/KNOWN_ISSUES.md` lists patrol combat as expel-mode only (war-defense/offense deferred) — this is a feature gap, not a bug. No other open patrol issues are listed. The legacy-role memory deletion risk exists but does not apply to patrol (patrol does not use legacy role fallbacks that call `delete Memory.creeps[creep.name]`).
