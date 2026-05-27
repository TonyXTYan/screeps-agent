# Code Review: Patrol Refactor (RCL7/dev1 uncommitted changes)

**Date:** 2026-05-27  
**Branch:** RCL7/dev1  
**Scope:** Uncommitted working-tree changes — defender→patrol rename, danger mechanism rewrite, patrol role introduction

---

## Summary

The PR replaces the `defender` role with a new `patrol` archetype that actively rotates through remote rooms and engages threats. Key structural changes: removed `populationControl.checkDefenders`, removed `retreatRemoteCreepFromHostiles`, replaced `dangerUntil`-gated dispatch with a `manualPauseUntil` console-only gate, and moved threat detection to `planning.ts` + `patrolCoverageForHome`.

**10 findings (3 critical/high correctness, 2 medium, 3 low/functional, 2 performance).**

---

## Findings

### 🔴 1 — `dangerUntil`/`skipReason` set but never checked as dispatch or spawn gate

**File:** `src/room/remote/planning.ts:103`  
**Also affects:** `src/room/controller.ts:151`, `src/room/remote/spawn.ts:294`

`planning.ts` sets `remote.skipReason='danger'` and `remote.dangerUntil=Game.time+1500` when hostiles are detected with no patrol coverage. But:
- `controller.ts:151` now checks **`manualPauseUntil`** (not `dangerUntil`) to block assignment
- `spawn.ts:294` also checks only **`manualPauseUntil`**
- `dangerUntil` is read only by `debug.ts` (display) and `memoryAudit.ts` (expiry cleanup)
- `skipReason` is read only by `memoryAudit.ts`

**Failure scenario:** Hostiles appear in a remote room with no patrol → `dangerUntil` set → workers continue being assigned to and spawned for that room anyway → creeps walk into combat.

**Fix:** Either gate `assignRemoteCreep` and `remoteSpawnRequest` on `dangerUntil` (or `skipReason === 'danger'`), or remove the `dangerUntil`/`skipReason` write if it's intentionally been replaced with a different mechanism.

---

### 🔴 2 — Remote creeps can't retreat home: `fleeFromHostiles` uses `maxRooms:1`

**File:** `src/main.ts:314`

`fleeFromHostiles` (the sole flee path for non-patrol creeps) calls:
```typescript
PathFinder.search(creep.pos, hostiles.map(...), { flee: true, maxRooms: 1 })
```
`maxRooms:1` restricts the path to the current room. The creep circles near the room edge but never crosses to home. Next tick, `assignRemoteCreep` re-issues the remote job (the room has no `manualPauseUntil` gate, and the creep is still in the remote room) → assign remote job → flee within room → cycle repeats → creep dies.

The removed `retreatRemoteCreepFromHostiles` used `maxRooms:8` and explicitly found the exit toward home.

**Failure scenario:** Remote miner in hostile room loops between `fleeFromHostiles` (stays in room) and `assignRemoteCreep` (re-issues remote job) until death.

**Fix:** Add explicit home-retreat logic when a remote creep is in a hostile room — either restore `retreatRemoteCreepFromHostiles`-style logic or set `setTravelJob(creep, homeRoom)` in `fleeFromHostiles` when `creep.memory.homeRoom && creep.room.name !== homeRoom`.

---

### 🟠 3 — Danger cleared unconditionally when patrol coverage > 0 + hostiles still present

**File:** `src/room/remote/planning.ts:120–122`

The logic:
```typescript
if (remote.skipReason === 'danger' || remote.skipReason === 'transit-danger') {
    if (hostiles.length === 0) {
        // clear + log ✓
    } else {
        // hostiles present BUT patrol exists → also clears, silently
        remote.skipReason = undefined;
        remote.dangerUntil = undefined;
    }
}
```

**Failure scenario:** Room R has `skipReason='danger'`. A patrol creep spawns (patrolCoverage=1). Next tick: `hostiles > 0`, patrol coverage > 0 → danger-set block skipped → else-branch unconditionally clears danger state with live hostiles. Room shows as safe in debug. The cycle repeats every tick a patrol exists during an active incursion, causing notification spam and preventing any stable danger window.

**Fix:** The else-branch should either `continue` (leave the existing danger in place while patrol handles it) or not clear `dangerUntil` until hostiles are gone.

---

### 🟠 4 — Invader cores and hostile-controlled rooms no longer trigger the danger flag

**File:** `src/room/remote/planning.ts` (removed block around `hostileCore` / `hostileControl`)

The old code explicitly detected:
- `STRUCTURE_INVADER_CORE` (with `ticksToCollapse`-based TTL)
- Hostile controller owner or reservation

Both are now gone. Only `findHostiles()` (creeps) triggers danger.

**Failure scenario:** An invader core spawns in a remote room before its creep wave. `hostiles.length === 0`, danger is never set, remote miners arrive and take damage from the core every tick until the core produces attackers. Hostile-controller rooms are also never blocked.

**Fix:** Re-add `STRUCTURE_INVADER_CORE` and hostile-controller checks, or explicitly document that these are handled out-of-band (e.g., patrol visual inspection).

---

### 🟠 5 — `assignOverflowRemoteScout` calls `clearJob` instead of `setTravelJob(homeRoom)` on hostile contact

**File:** `src/room/remote/fleet.ts:534`

```typescript
if (hostiles.length > 0) {
    clearJob(creep);   // ← was setTravelJob(creep, homeRoomName)
    return true;
}
```

With no movement order set, `fleeFromHostiles` may fire (maxRooms:1, stays in room). Next tick, `assignRemoteCreep` re-enters `assignOverflowRemoteScout`, finds hostiles again, clears job again → infinite loop. Scout never retreats home.

**Fix:** Restore `setTravelJob(creep, homeRoomName)` (the pre-PR behavior), or call `setTravelJob` before `return true`.

---

### 🟡 6 — RCL < 6 home rooms have no emergency defense after `checkDefenders` removal

**File:** `src/room/remote/spawn.ts:466`

`patrolSpawnRequest` has `if (rcl < 6) { return null; }`. The removed `populationControl.checkDefenders(room)` had no RCL floor — it would spawn defenders at any RCL when hostiles entered the home room.

**Failure scenario:** An RCL 4–5 base is attacked in the home room. No combat creep is ever spawned. Towers alone may not handle sustained raids or boosted attackers.

**Fix:** Either lower the RCL gate for patrol spawning (RCL 3+ can afford a minimal `[TOUGH, ATTACK, MOVE]` at 140 energy), or restore a lightweight emergency-defender spawn path for low-RCL rooms.

---

### 🟡 7 — `targetPatrol` scales with total hostile *creep* count, not room count → over-spawning

**File:** `src/room/remote/spawn.ts:484`

```typescript
const targetPatrol = baselinePatrol + visibleArmedHostiles;
```

`visibleArmedHostiles` is the sum of all hostile creeps across all remote rooms. A standard 4-creep NPC invader wave in one room yields `targetPatrol = baseline + 4`.

**Failure scenario:** 1 enabled remote, 4 invaders visible → `targetPatrol = 5`. Bot tries to spawn 5 patrol creeps at 320–1100 energy each. Spawn queue is saturated for dozens of ticks, starving remote-miner and remote-hauler replacements. NPC invaders typically self-destruct in 300–500 ticks anyway.

**Fix:** Scale by number of hostile *rooms* (`visibleArmedHostiles > 0 ? 1 : 0` per room) rather than total creep count, or cap the patrol bonus at e.g. `Math.min(visibleArmedHostiles, enabledRemoteNames.length)`.

---

### 🔵 8 — `creep.rangedAttack()` called on bodies with no `RANGED_ATTACK` parts

**File:** `src/role/patrol.ts:54`

All five `PATROL_BODY_TEMPLATES` use only TOUGH/ATTACK/MOVE/HEAL. The combat path:
```typescript
if (creep.pos.getRangeTo(target) <= 3) {
    creep.rangedAttack(target);   // always ERR_NO_BODYPART
}
```

`rangedAttack` and `attack` use separate action slots so melee still works, but the `rangedAttack` call is dead code that runs every combat tick.

**Fix:** Remove the `rangedAttack` call, or add RANGED_ATTACK parts to at least the larger templates if ranged attack is intended.

---

### 🔵 9 — `patrolCoverageForHome` iterates all `Game.creeps` without caching, called once per hostile remote room per tick

**File:** `src/room/remote/planning.ts:263`

Called inside the `updateRemoteRoomPlans` loop at line 101 for every remote room where `hostiles.length > 0`. With K hostile-visible remote rooms, it runs K full scans of `Game.creeps`.

**Failure scenario:** Multi-room invasion, 5 rooms with hostiles visible, 50 creeps → 250 iterations in a single `updateRemoteRoomPlans` call, every tick for the duration of the invasion. Compounds with existing per-tick costs (traffic, pathfinding) during the highest-CPU ticks.

**Fix:** Compute `patrolCoverageForHome(homeRoom.name)` once before the remote-room loop and pass it in, or memoize with a tick-scoped cache.

---

### 🔵 10 — `migrateLegacyDefenseMemoryEntries` scans all `Memory.creeps` every tick post-migration

**File:** `src/creep/memoryManagement.ts:4`

The migration function runs unconditionally in `run()` (called every tick). After the first tick where all defender/doctor roles are migrated, it continues scanning all creep memory entries every tick forever with no early-exit.

**Fix:** Either move the migration to a one-time path (memoryAudit already does this on deploy; the tick-level scan is redundant after that), or add a guard: skip the loop entirely if a "migrated" flag is set in `Memory`.

---

---

## Follow-up Review: Last 5 Commits (patrol-system + patches 1–4)

**Scope:** commits `3953ac4`, `684ad24`, `2c96946`, `54910b0`, `269b3b9`  
**Date:** 2026-05-27 (continued session)  
**Method:** 3-angle (line-by-line, removed-behavior, cross-file tracer) + verify  
**Result:** 9 findings (3 confirmed, 4 plausible, 2 plausible-low)

---

### 🔴 F1 — `shouldRenewPatrolNow` critical-TTL branch ignores armed home threat

**File:** `src/role/patrol.ts:216`

```typescript
if (ttl <= PATROL_RENEW_CRITICAL_TTL) { return true; }  // ← no hasArmedHomeThreat check
```

A patrol with TTL ≤ 300 abandons an active home-room defense fight to go renew. `hasArmedHomeThreat` is computed 3 lines above but never checked here.

**Fix:** `if (ttl <= PATROL_RENEW_CRITICAL_TTL && !hasArmedHomeThreat) { return true; }`

---

### 🔴 F2 — Renewing patrol counted as active coverage, silences remote danger

**File:** `src/room/remote/planning.ts:280` (`patrolCoverageForHome`)

`patrolCoverageForHome` counts any non-spawning patrol creep, including those with `memory.renewing=true`. A renewing patrol at the home spawn will never enter `runThreatResponse` (its `shouldRenewPatrolNow` returns `!hasArmedHomeThreat` = true for remote-only threats). Result: `patrolCoverage > 0` → `skipReason='danger'` never set → remote miners dispatched into live armed hostiles.

**Fix:** Exclude `creep.memory.renewing === true` from the count in `patrolCoverageForHome`.

---

### 🔴 F3 — Freshly-spawned patrol counted as coverage before it can reach remote threat

**File:** `src/room/remote/planning.ts:280` (same function)

The tick a patrol exits the spawn (no longer `creep.spawning`), it counts as coverage=1. The patrol is still in the home room and may be 10+ rooms from the hostile remote room. `skipReason='danger'` is suppressed and remote miners are re-dispatched while the threat is live.

**Fix:** Same as F2 (exclude renewing), or additionally exclude creeps that are in the home room with `ticksToLive > MIN_DEPLOY_TTL_THRESHOLD` as a proxy for "just spawned."

---

### 🟠 F4 — RCL3 patrol body has no HEAL (budget 320–439 selects T5)

**File:** `src/creep/capabilities.ts:22` (`PATROL_BODY_TEMPLATES`)

- T4 = `[TOUGH,ATTACK,MOVE×2,HEAL]` costs **440**
- T5 = `[TOUGH,ATTACK×2,MOVE×3]` costs **320** — **no HEAL**
- At RCL3 (`energyCapacity=800`): budget = `max(300, 400) = 400` → T4 doesn't fit → T5 selected

A patrol spawned for home defense at RCL3 cannot self-heal. It dies quickly under any sustained damage.

**Fix:** Lower T4's cost to ≤ 400 (e.g. remove one ATTACK → `[TOUGH,ATTACK,MOVE×2,HEAL]` = 390), closing the gap.

---

### 🟠 F5 — `attackController` returning `OK` clears `reserveController` job every tick

**File:** `src/creep/jobRunner.ts:644`

`shouldClearJob('reserveController', OK)` returns `true`. When the controller is Invader-owned, `reserveController` → `ERR_INVALID_TARGET` → `attackController()` → `OK` → job cleared every tick. Next tick: `assignRemoteCreep` re-assigns `reserveController`. The attack fires correctly each tick but job memory is written and cleared on every single tick.

**Fix:** When `attackController` was used, return `ERR_BUSY` instead of the `OK` result so `shouldClearJob` does not clear the job; or add a dedicated `'attackController'` job type.

---

### 🟡 F6 — No hold-off when visible room clears danger; workers re-enter immediately

**File:** `src/room/remote/planning.ts:132`

When `hasArmedHostiles=false` and `skipReason='danger'`, both `skipReason` and `dangerUntil` are cleared in the same tick. Workers are dispatched on the very next tick. If hostiles have only briefly retreated, workers re-enter before the patrol has confirmed the room clear.

**Fix:** On clear, keep `dangerUntil` intact; only clear `skipReason`. Let `remoteArmedFailsafeActive` expire the timer naturally via the `dangerUntil > Game.time` check.

---

### 🟡 F7 — Invader core without guards never triggers `skipReason='danger'`

**File:** `src/room/remote/planning.ts:118`

Only `hasArmedHostiles` sets danger. An invader core that has spawned but not yet produced guards (`hasArmedHostiles=false`) doesn't block remote dispatch. Workers enter the room and are in melee range when guards first appear.

**Fix:** Add `|| (hostileCore !== null && patrolCoverage === 0)` to the danger-set condition.

---

### 🔵 F8 — Remote creep with cleared `remoteRoom` bypasses directed retreat

**File:** `src/main.ts:333` (`directedRetreatToHomeStep`)

`assignRemoteCreep` is guarded by `if (creep.memory.remoteRoom)` (line 124). A creep whose `remoteRoom` was cleared by memoryAudit is never sent to `travelRoom`, so `directedRetreatToHomeStep` checks `jobType==='travelRoom'` → fails → falls back to `maxRooms:1` flee which may oscillate in the hostile room.

**Fix:** In `fleeFromHostiles`, defensively set `travelRoom` to `homeRoom` when `memory.homeRoom` is set and the creep is in a foreign room, regardless of `remoteRoom`.

---

### 🔵 F9 — First-tick crash leaves `legacyDefenseMigrationDone=true` with defender creeps un-migrated

**File:** `src/creep/memoryManagement.ts:81`

`migrateLegacyDefenseMemoryEntries` writes `Memory.legacyDefenseMigrationDone=true` unconditionally on the first post-deploy tick. If the tick crashes after writing the flag (before `memoryAudit` runs), the per-tick migration is permanently skipped and any surviving `defender`-role creep is never migrated — it falls through to economic job dispatch with an attack-capable body.

**Fix:** Write the flag only after successfully iterating all creeps (not before), or remove the per-tick migration entirely and rely solely on `memoryAudit.migrateLegacyDefenseRoles`.

---

## Files Changed (scope reference)

| File | Key change |
|------|------------|
| `src/creep/capabilities.ts` | Added `patrol` archetype, `PATROL_BODY_TEMPLATES`, mapped `defender` role → `patrol` |
| `src/creep/memoryManagement.ts` | Added per-tick migration for defender→patrol, doctor→builder |
| `src/creep/traffic.ts` | Added `patrol` to high-priority archetype list |
| `src/main.ts` | Removed `populationControl.checkDefenders`, `retreatRemoteCreepFromHostiles`, `markRemoteDanger`; added patrol role dispatch |
| `src/memoryAudit.ts` | Added one-time `migrateLegacyDefenseRoles` on deploy |
| `src/room/constants.ts` | Added `REMOTE_HOSTILE_EVADE_DISTANCE = 5` |
| `src/room/controller.ts` | Switched danger gate from `dangerUntil` → `manualPauseUntil`; removed live-hostile dispatch block |
| `src/room/remote/fleet.ts` | `assignOverflowRemoteScout`: `setTravelJob` → `clearJob` on hostiles |
| `src/room/remote/planning.ts` | Rewrote danger detection: removed invader-core/hostile-control, added patrol-coverage gate, added `Game.notify` |
| `src/room/remote/spawn.ts` | Replaced doctor spawn → `patrolSpawnRequest`; switched `dangerUntil` → `manualPauseUntil` gate |
| `src/room/spawn.ts` | Added `patrol` to tracked-separately archetype list |
| `src/room/targeting.ts` | Updated `legacyRoleForArchetype` for patrol/doctor |
| `src/role/patrol.ts` | **New file** — patrol rotation, threat response, renew logic |
| `src/types.d.ts` | Added `patrol` to `CreepArchetype`; added `manualPauseUntil`, `lastPatrolDangerNotifyAt` to `RemoteRoomPlan`; added patrol memory fields |
