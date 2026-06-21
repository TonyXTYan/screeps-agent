# Review 11 — Algorithm audit (code-only, no docs)

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Patch window:** patches 9–11 (latest: `6bf7c45c` “patrol patch 11”)  
**Method:** algorithm-only audit (ignore architecture docs + prior review narratives)  

## Scope

Audit patrol + remote fail-safe algorithms for:

- **Correctness** (state transitions, invariants, hidden assumptions)
- **Runtime safety** (null/undefined, action return codes, visibility dependence)
- **Cache correctness** (tick invalidation, keying, cross-home cross-threat contamination)
- **Performance pitfalls** (avoidable repeated scans, hidden multiplicative costs)

Files examined:

- `src/role/patrol.ts` (renew FSM, rotation/loiter, assignment caches, combat)
- `src/room/remote/planning.ts` (danger marker, clear hold, coverage cache)
- `src/room/remote/spawn.ts` (spawn skip via `remoteArmedFailsafeActive`)
- `src/room/controller.ts` (retreat/idle via `remoteArmedFailsafeActive`)
- `src/creep/capabilities.ts` (patrol body templates)
- `src/types.d.ts` (patrol loiter memory fields)

## Executive summary

Patch 11 completes “hybrid patrol” by actively using ranged parts during combat. Patch 10 significantly improves CPU by adding tick-scoped caches and a renew FSM.

However, there is one **high-impact correctness gap** in the fail-safe algorithm:

- **Danger state is only updated for `remote.mode === 'harvest'`.**  
  This can cause **claim/reserve remotes** to never set or refresh `skipReason='danger'`/`dangerUntil`, even though **the global retreat/spawn blocking gates consult that state**.

Additionally, the new combat logic is safe for the current templates, but movement in threat response is brittle if a patrol body ever exists without `ATTACK` parts.

## Findings (prioritized)

### 🔴 Critical 1 — Fail-safe danger marker does not update for non-`harvest` remotes

**File:** `src/room/remote/planning.ts`  
**Function:** `updateRemoteRoomPlans(homeRoom)`

The danger marker algorithm (visible armed hostiles + patrol coverage == 0 ⇒ set `skipReason='danger'` and `dangerUntil`) is executed only after this early continue:

```94:95:src/room/remote/planning.ts
        if (remote.mode !== 'harvest') { continue; }

        const visible = Game.rooms[remoteName];
        if (!visible) { continue; }
```

**Impact:** Any remote plan in `mode: 'claim'` or `mode: 'reserve'` will not refresh:

- `remote.skipReason`
- `remote.dangerUntil`
- the 50-tick clear-hold logic

Yet both **remote creep assignment** and **remote spawn request selection** consult `remoteArmedFailsafeActive()`:

```160:168:src/room/controller.ts
    if (remoteArmedFailsafeActive(homeRoom, remoteRoom, configuredRemotePlan)) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
```

```301:306:src/room/remote/spawn.ts
        if (!remote.enabled) { continue; }
        if (remote.manualPauseUntil && remote.manualPauseUntil > Game.time) { continue; }
        if (remoteArmedFailsafeActive(context.room.name, roomName, remote)) { continue; }
```

**Failure mode:** armed hostiles in a claim/reserve remote do not trigger retreat/spawn blocking because the memory markers are never updated in that mode (or remain stale).

**Recommendation:** Split “danger marker maintenance” from “harvest planning.”  
At minimum: compute visibility + armed hostile presence + coverage + update/clear danger markers for **all enabled remotes regardless of mode**, then keep the harvest-only sections (sources/roads/container planning) behind the `remote.mode === 'harvest'` gate.

---

### 🔴 Critical 2 — Threat response movement assumes melee bodies exist

**File:** `src/role/patrol.ts`  
**Function:** `runThreatResponse()`

The new patch 11 logic fires ranged actions when possible, but melee movement is still only triggered on `ERR_NOT_IN_RANGE` from `creep.attack(...)`:

```59:82:src/role/patrol.ts
    const target = selectCombatTarget(creep, targetRoom.hostiles);
    if (target) {
        const range = creep.pos.getRangeTo(target);
        if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
            const nearbyHostiles = targetRoom.hostiles.filter((hostile) => creep.pos.getRangeTo(hostile) <= 3).length;
            if (nearbyHostiles >= 2) {
                creep.rangedMassAttack();
            } else {
                creep.rangedAttack(target);
            }
        }
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 1, visualizePathStyle: { stroke: '#ef4444' } });
        }
        return;
    }
```

**Why it matters:** If a patrol creep ever has **zero `ATTACK` parts** (legacy creep, manually spawned odd body, future template change, or bad migration), then:

- `creep.attack(target)` returns `ERR_NO_BODYPART` (not `ERR_NOT_IN_RANGE`)
- movement toward the target does not trigger
- ranged only fires at range <= 3

**Failure mode:** patrol can stall at range \(> 3\), never closing distance.

**Recommendation:** Prefer movement decisions based on range and available parts, not attack return codes. For example:

- If it has `ATTACK` parts: close to melee range when needed.
- Else if it has `RANGED_ATTACK`: kite/keep range and use ranged behavior.
- Otherwise: fallback to “move toward target” or “retreat” depending on intent.

---

### 🟠 High — Renew FSM can preempt engagement under armed threats (short window)

**File:** `src/role/patrol.ts`  
**Function:** `shouldRenewPatrolNow()`

Renew state machine (post patch 10) starts renewing when `TTL <= 300`, regardless of threat presence:

```441:446:src/role/patrol.ts
    if (ttl > PATROL_RENEW_START_TTL) { return false; }
    creep.memory.renewing = true;
    return true;
```

Once renewing, it only aborts renew under armed threats after TTL rises above 500:

```431:441:src/role/patrol.ts
    if (creep.memory.renewing) {
        if (hasAnyArmedThreat && ttl > PATROL_RENEW_THREAT_STOP_TTL) {
            creep.memory.renewing = false;
            return false;
        }
        // ...
        return true;
    }
```

**Impact:** A patrol with TTL \(<= 300\) can choose to renew (and travel to home spawn) even if armed hostiles are visible elsewhere. This is not a crash bug; it’s a policy choice that can look like “abandon defense” if the patrol was the only responder.

**Recommendation:** Decide explicitly whether “TTL-critical renew” is allowed during active armed threats. If not, gate the `TTL <= 300` start condition behind `!hasAnyArmedThreat` (or allow only when the only threats are home-room threats with adequate tower coverage, etc.).

---

### 🟠 High — Danger gate is armed-creep-only; invader cores/controller threats don’t trigger failsafe

**File:** `src/room/remote/planning.ts`  
**Function:** `updateRemoteRoomPlans()`

The fail-safe trigger uses:

- `hostiles = findHostiles(visible)`
- `hasArmedHostiles = hostiles.length > 0`

So if the only threat signal is `StructureInvaderCore` or hostile controller/reservation, the remote can remain non-danger for the retreat/spawn-block gate.

**Impact:** Non-combat creeps may enter remotes containing an invader core (or hostile controller state) until armed hostile creeps appear.

**Recommendation:** If the goal is “armed-creeps-only gate,” keep as-is. If the goal is broader “unsafe remote” gating, incorporate `hostileCore` and/or `hostileController` into danger logic (possibly with separate `skipReason` values).

---

### 🟡 Medium — `transit-danger` appears unused

**File:** `src/room/remote/planning.ts`  
`updateRemoteRoomPlans()` checks:

```135:135:src/room/remote/planning.ts
        if (remote.skipReason === 'danger' || remote.skipReason === 'transit-danger') {
```

But no code in `src/` sets `skipReason = 'transit-danger'` (as of this audit). This makes the branch partially dead and risks confusing future maintenance.

**Recommendation:** Either remove `transit-danger` handling, or implement the intended state transition and ensure it is used in a single clear place.

---

### 🟡 Medium — Patrol coverage caches are tick-scoped; ordering can create 1-tick mismatches

**Files:**

- `src/room/remote/planning.ts` `patrolCoverageByRemoteRoom()`
- `src/role/patrol.ts` renew state toggles

Coverage excludes `creep.memory.renewing`. If coverage is computed early in the tick (e.g. during room loops) and patrol renew flags change later, the cached map may not reflect that until next tick.

**Impact:** 1-tick “coverage” mismatch is possible (usually benign, self-corrects next tick).

**Recommendation:** Acceptable for performance; if this ever causes flapping, consider computing coverage after patrol renew decisions (hard in current loop ordering) or relaxing the exclusion.

---

### 🟢 Low — `rangedHeal` called without part checks

**File:** `src/role/patrol.ts`  
**Function:** `healFriendly()`

The function calls `creep.rangedHeal(closest)` if `heal()` is out of range, without checking that the creep has active `HEAL` parts that can ranged-heal (Screeps uses `HEAL` for both heal and rangedHeal; no separate body part). This is not unsafe, but it may be wasted intents if parts are damaged to 0 or if the chosen target is not eligible.

**Recommendation:** Optional: guard with `creep.getActiveBodyparts(HEAL) > 0` (already present) and consider using `rangedHeal` only when range is 2–3.

---

### 🟢 Low — Patrol loiter point selection is moderately expensive

**File:** `src/role/patrol.ts`  
**Function:** `controllerLoiterPoint()`

Up to 20 attempts per patrol tick, each doing `lookFor()` checks. Might be fine, but during high-creep ticks it’s a non-trivial constant.

**Recommendation:** If CPU pressure appears: reduce attempts, cache a chosen loiter point per patrol per room for the loiter window, or skip `LOOK_CREEPS` checks.

## Suggested fixes (minimal diffs)

1. **Move danger marker update outside harvest-only block**
   - Step A: load visibility + hostile signals + patrol coverage for all enabled remotes
   - Step B: apply `skipReason/dangerUntil` state machine for all modes
   - Step C: only run sources/roads/container planning when `remote.mode === 'harvest'`

2. **Make threat-response movement robust without melee**
   - Replace `if (attack(...) === ERR_NOT_IN_RANGE) moveTo(...)` with:
     - `if (range > 1 && hasAttackParts) moveTo(...)`
     - `else if (range > 3 && hasRangedParts) moveTo(...)` (or “hold range” policy)

## Minimal test checklist (in-game)

- **Claim remote danger:** configure a `mode: 'claim'` remote, spawn a claimer, then inject armed hostiles; verify `assignRemoteCreep()` and spawn request selection respond appropriately.
- **Reserve remote danger:** same for `mode: 'reserve'`.
- **Renew-under-threat:** set a patrol to ~250 TTL and trigger an armed remote threat; verify intended behavior (renew travel vs re-engage).
- **Ranged combat:** spawn a hybrid patrol and confirm:
  - `rangedMassAttack` fires with 2+ hostiles in 3
  - `rangedAttack` fires with 1 hostile in 3
  - melee still closes and hits

## Documentation reconciliation (post patch 11)

This section cross-checks the current code against:

- `architecture/DEFENSE.md`
- `architecture/REMOTES.md`

### Mismatch 1 (Critical): fail-safe scope vs mode gate

Both docs describe the armed-hostile fail-safe as a remote-level mechanism (retreat + spawn block) without restricting it to harvest-mode remotes.

Code in `src/room/remote/planning.ts` currently gates danger marker maintenance behind:

```94:94:src/room/remote/planning.ts
        if (remote.mode !== 'harvest') { continue; }
```

So `skipReason='danger'` / `dangerUntil` are not updated for non-harvest remotes (`claim`, `reserve`).  
This creates a doc/code mismatch and a real runtime gap because `remoteArmedFailsafeActive(...)` relies on those fields in:

- `src/room/controller.ts` (remote creep retreat/idle)
- `src/room/remote/spawn.ts` (remote spawn skip)

**Recommendation:** Prefer code fix (mode-agnostic danger marker maintenance). If not fixing code now, add an explicit doc caveat that danger marker updates are currently harvest-only.

### In-sync item: renew FSM policy

Docs describe patrol renew FSM as:

- start renew at `TTL <= 300`
- while armed threats exist, keep renewing until `TTL > 500`, then re-engage
- while threat-free, renew until `TTL >= 1400`

Code matches this behavior in `src/role/patrol.ts` `shouldRenewPatrolNow()`.

### In-sync item: hybrid patrol combat capability

Docs describe hybrid patrol composition and patch 11 behavior.
Code now actively uses ranged intents in `runThreatResponse()`:

- `rangedMassAttack()` when >= 2 hostiles in range 3
- `rangedAttack(target)` when one hostile in range 3
- still performs melee `attack()` + close movement

### Remaining algorithmic risks (not documentation mismatches)

- **Movement robustness edge:** threat movement currently hinges on `attack(...) === ERR_NOT_IN_RANGE`; bodies without `ATTACK` parts could stall.
- **Armed-only danger gate:** invader core/controller threats remain telemetry-only by design; docs and code align here.

## Updated priority summary

1. **Critical:** make danger marker updates mode-agnostic (or document harvest-only limitation explicitly).
2. **High:** harden threat movement logic for non-melee-capable patrol bodies.
3. **Policy decision:** confirm whether TTL-critical renew during active threats is desired doctrine or should be stricter.


