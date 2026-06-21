# Review 11 — Fix audit (patch 12)

**Date:** 2026-05-27  
**Branch:** `RCL7/dev1`  
**Addresses:** findings from `review-11.md`

---

## What was fixed

### ✅ Critical 1 — Danger markers now mode-agnostic (`planning.ts`)

**Was:** `if (remote.mode !== 'harvest') { continue; }` ran at line 94, before all
visibility, hostile-detection, and `skipReason`/`dangerUntil` logic. `reserve` and
`claim` remotes never had their danger markers updated, so `remoteArmedFailsafeActive()`
could never return `true` for them.

**Fix:** Moved the visibility check and the full danger-marker state machine (scouting,
`lastSeenHostiles`, `lastSeenInvaderCoreAt`, `lastSeenHostileControllerAt`, danger
set/clear with `dangerUntil`) above the mode gate. The mode gate now only guards
harvest-specific planning (sources, paths, roads, containers). `continue` statements
inside the danger block still correctly skip harvest planning when danger is active.

**Confirmed real by:** `types.d.ts:53` — `type RemoteRoomMode = 'harvest' | 'reserve' | 'claim'`

---

### ✅ Medium — `transit-danger` dead branch removed (`planning.ts`)

**Was:** Clear-hold condition checked `remote.skipReason === 'transit-danger'` but
no code anywhere in the codebase ever writes that value. Branch was unreachable.

**Fix:** Removed `|| remote.skipReason === 'transit-danger'` from the condition.

---

## What was NOT actually a problem

### ❌ Critical 2 — Movement assumes melee bodies (`patrol.ts`)

Review flagged that `if (creep.attack(target) === ERR_NOT_IN_RANGE)` would fail to
trigger movement if a patrol had zero ATTACK parts.

**Not a current bug.** All 7 patrol body templates in `capabilities.ts:22-29` include
at least one `ATTACK` part. No real patrol can be spawned without melee. This is a
theoretical robustness concern for future template changes, not an active runtime issue.
Deferred.

---

### ❌ Low — `rangedHeal` called without part check (`patrol.ts`)

Review noted `creep.rangedHeal(closest)` is called without checking HEAL parts.

**Not an issue.** `healFriendly()` already guards with
`if (creep.getActiveBodyparts(HEAL) <= 0) { return; }` at the top of the function
before any heal/rangedHeal call.

---

## Deliberate design choices (not bugs)

### 🟡 Renew FSM during armed threats (`patrol.ts`)

A patrol with TTL ≤ 300 starts renewing regardless of active armed threats. Once
renewed past TTL 500, it re-engages if threats are still present.

**By design.** A nearly-dead patrol is more valuable after renewal than as a
sacrifice. The review notes this explicitly as a policy choice, not a crash bug.
No change.

### 🟡 Danger gate is armed-creep-only

`findHostiles()` returns only armed player/NPC creeps. Invader cores and hostile
controller/reservation state do not trigger `skipReason='danger'`. They are tracked
separately (`lastSeenInvaderCoreAt`, `lastSeenHostileControllerAt`) but do not fire
the retreat/spawn-block gate.

**By design.** The gate intent is "armed-creep threat present." Invader cores are
a separate concern. No change.

### 🟡 Coverage cache 1-tick mismatch (`planning.ts`)

Patrol coverage is cached per-tick; if `renewing` flags change mid-tick, the cached
map may be 1 tick stale. Self-corrects next tick.

**Acceptable tradeoff for CPU.** No change.
