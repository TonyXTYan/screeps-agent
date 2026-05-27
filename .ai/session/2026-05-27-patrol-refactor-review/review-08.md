# Code Review 8: Patrol System (committed state on RCL7/dev1)

**Date:** 2026-05-27  
**Branch:** RCL7/dev1  
**Reviewer:** Composer (agent)  
**Scope:** Full patrol system as implemented — `role/patrol.ts`, `room/remote/spawn.ts`, `room/remote/planning.ts`, `main.ts` integration, `architecture/DEFENSE.md` alignment  
**Method:** Cross-file trace + architecture doc compare + reconcile against `notes.md` (initial review + follow-up F1–F9)

---

## Executive summary

The patrol system is a coherent **three-layer defense** design: towers → patrol creeps (expel mode) → non-combat evade + armed-hostile fail-safe. It replaces the old `defender` / `populationControl` emergency path with a strategic archetype that rotates remotes, coordinates under multi-room threats, and ties economy safety to **room-local** patrol presence.

Most serious issues from the earlier refactor review (`notes.md`) appear **fixed** (hostile-room-based spawn sizing, danger not cleared while hostiles remain, renewing patrols excluded from coverage, RCL&lt;6 emergency spawn with full energy budget). Remaining concerns are mostly **edge-case combat/economy races** and **deferred scope** (war modes, invader-core fail-safe).

**Verdict:** Production-viable for expel mode. Small targeted fixes recommended for renew-abandon and fail-safe lift timing.

---

## Architecture (what works well)

```
room/controller.run
  → updateRemoteRoomPlans     (danger marker, telemetry)
  → assignJobs                (fail-safe retreat)
  → runSpawnPlanner           (patrol spawn priority)

main loop (per creep)
  → rolePatrol.run            (before flee / job runner)
  → fleeFromHostiles          (non-patrol)
```

| Area | Assessment |
|------|------------|
| Dispatch order | Patrol runs before flee/job runner in `main.ts` — combat intent not overridden by economy jobs. |
| Spawn priority | `patrolSpawnRequest` evaluated early in remote spawn planning (`remote/spawn.ts` ~240). |
| Multi-threat coordination | `assignPatrolThreatRooms`: min one patrol per armed-threat room, then fill by score; deterministic via sorted creep names. |
| Fail-safe coverage | `patrolCoverageForRemoteRoom` requires patrol **physically in threatened remote** — fixes home/renewing false coverage. |
| Danger hysteresis | While hostiles visible and `skipReason === 'danger'`, state extended instead of cleared (`planning.ts` 132–139). |
| Spawn sizing | Uses **hostile room count**, not total hostile creep count (`spawn.ts` 503–515). |
| Low RCL | Emergency home defense below RCL 6 with `useFullEnergyCapacity` + `minimumBodyCost`. |
| Docs | `architecture/DEFENSE.md` matches reviewed code paths. |

---

## Behavior deep-dive

### Patrol role (`src/role/patrol.ts`)

**Threat response**

- Visible threats = armed hostiles (`findHostiles`) or invader core in **visible** rooms only.
- Home armed threats: +10000 priority; cores: +100 when no armed creeps.
- Combat target priority: HEAL → RANGED → ATTACK, then closest among ties.
- Self-heal + ally heal (range 3).

**Rotation**

- 100-tick cadence via `getPatrolRotationTicks()`; per-creep `patrolRoom` / `patrolRouteIndex`; hash-based offset when current target invalid.
- Rotation **paused** while any visible threat exists (threat branch returns before `runPatrolRotation`).

**Renew**

- Normal renew: home only, TTL ≤ 650, blocked during home armed threat.
- Critical renew (TTL ≤ 300): blocks only **home** armed threats — see finding R8-1.

### Spawn sizing (`patrolSpawnRequest`)

At RCL ≥ 6:

```
baseline = ceil(enabledRemotes / 2)
hostileRooms = (home armed ? 1 : 0) + remotes with visible armed hostiles
target = min(baseline + hostileRooms, 2 + 2*enabledRemotes)
```

At RCL &lt; 6: up to 1 patrol when home has armed hostiles; full-capacity body; waits for planned minimum.

### Fail-safe (`planning.ts` + `remoteArmedFailsafeActive`)

**Set** when: visible armed hostiles **and** `patrolCoverageForRemoteRoom === 0`.

**Effects:**

- `assignRemoteCreep` sends non-combat remotes home (`controller.ts` ~160).
- `remoteSpawnRequest` skips that remote (`spawn.ts` ~305).

**Clear** when: room visible and no armed hostiles, **or** patrol enters remote (`patrolCoverage > 0` disables fail-safe even if hostiles still visible).

---

## Findings

### 🔴 R8-1 — Critical TTL renew during **remote-only** threats

**File:** `src/role/patrol.ts` (`shouldRenewPatrolNow`)

```typescript
if (ttl <= PATROL_RENEW_CRITICAL_TTL && !hasArmedHomeThreat) { return true; }
if (creep.room.name !== homeRoomName) { return false; }
```

A patrol fighting in a remote with TTL ≤ 300 will still go renew because only **home** armed threats block critical renew. It can walk home mid-fight while the remote is still hot.

**Fix:** Block critical renew when **any** visible armed threat exists (not only home), e.g. `threats.some(t => t.hostiles.length > 0)`, or only allow critical renew when `threats.length === 0`.

**Note:** Prior follow-up F1 (home threat) is fixed; this is the remote-only gap.

---

### 🟠 R8-2 — Fail-safe lifts when one patrol is in room, even if outgunned

**File:** `src/room/remote/planning.ts` (`remoteArmedFailsafeActive`)

```typescript
if (patrolCoverage > 0) { return false; }
```

Once a single patrol enters the remote, spawn blocking and retreat stop while hostiles may still be present. Workers/haulers can be re-dispatched into an active fight if patrol is losing.

May be intentional (“patrol owns the room”); still a real race.

**Fix (optional):** Keep fail-safe until `hostiles.length === 0` OR `patrolCoverage >= f(hostile strength)`.

---

### 🟠 R8-3 — Instant danger clear on loss of vision (visible room)

**File:** `src/room/remote/planning.ts` (132–136)

When `hasArmedHostiles === false` and `skipReason === 'danger'`, both `skipReason` and `dangerUntil` clear same tick. Workers can re-enter if hostiles briefly retreat or leave vision.

**Mitigation already partial:** invisible rooms keep fail-safe until `dangerUntil` expires.

**Fix (optional):** On clear, keep `dangerUntil` for a short hold; only clear `skipReason`, or require N ticks without hostiles before clear.

**Note:** Aligns with prior follow-up F6.

---

### 🟡 R8-4 — Melee-only patrol bodies vs kiting hostiles

**File:** `src/creep/capabilities.ts` (`PATROL_BODY_TEMPLATES`)

All templates are TOUGH/ATTACK/MOVE/HEAL — no `RANGED_ATTACK`. Expel mode vs ranged/heal squads may chase indefinitely or die on approach. Acceptable for v1 expel; worth telemetry before war modes.

---

### 🟡 R8-5 — Navigation to room center `(25, 25)`

**File:** `src/role/patrol.ts`

Threat response and rotation use center tiles for cross-room `moveTo`. Suboptimal on natural terrain vs storage/spawn anchors or cached route endpoints. Expect occasional slow/stuck paths.

---

### 🔵 R8-6 — CPU: per-patrol full reassignment scan

**File:** `src/role/patrol.ts` (`assignPatrolThreatRooms` → `activeHomePatrolNames`)

Each patrol scans all `Game.creeps` every tick → `O(patrols × creeps)`. Memoize assignments per home per tick.

**Note:** Aligns with prior finding #9 (home coverage loop); still applies to assignment path.

---

### 🔵 R8-7 — Dead export `patrolCoverageForHome`

**File:** `src/room/remote/planning.ts` (280–291)

Exported but unused. Remote-local `patrolCoverageForRemoteRoom` is the correct fail-safe gate. Remove or document as debug-only.

---

### 🔵 R8-8 — Legacy `populationControl` / `defender` still in tree

**File:** `src/creep/populationControl.ts`

`checkDefenders` spawns `role: 'defender'` but is **not called** from `main.ts`. Harmless at runtime; confusing alongside patrol migration. CODEMAP notes “retired from loop.”

---

## Intentionally deferred (documented — not bugs)

| Topic | Reference |
|-------|-----------|
| War-defense / war-offense modes | `.ai/plans/patrol-defense-modes.md` |
| Invader core / hostile controller fail-safe | `architecture/DEFENSE.md` — telemetry only; patrol clears cores when visible |
| Full squad orchestration | `.ai/memory/KNOWN_ISSUES.md` |

---

## Prior review reconciliation (`notes.md`)

| Prior finding | Status in review 8 |
|---------------|-------------------|
| #1 `dangerUntil` never gated dispatch/spawn | **Fixed** — `remoteArmedFailsafeActive` + `skipReason === 'danger'` |
| #2 `fleeFromHostiles` no home retreat | **By design** — fail-safe sets `travelRoom` via `assignRemoteCreep` |
| #3 Danger cleared while hostiles + patrol | **Fixed** — extend danger `continue` (137–139) |
| #4 Invader core not setting danger | **Intentional** — documented in DEFENSE.md |
| #5 `manualPauseUntil` vs danger | **Resolved** — separate gates |
| #6 RCL &lt; 6 no defense | **Fixed** — emergency patrol branch |
| #7 Spawn scales by creep count | **Fixed** — hostile **room** count |
| #8 No RANGED on patrol | **Open (low)** — R8-4 |
| #9 `patrolCoverageForHome` CPU | **Partial** — home fn unused; assignment scan remains (R8-6) |
| F1 Critical TTL vs home threat | **Fixed** |
| F2 Renewing patrol as coverage | **Fixed** — `renewing` excluded |
| F3 Fresh spawn as coverage | **Fixed** — remote-room-local coverage |
| F4 RCL3 no HEAL at 50% budget | **Fixed** for emergency — full capacity below RCL 6 |
| F5 `attackController` job clear | Out of patrol scope |
| F6 Instant clear on vision loss | **Open** — R8-3 |
| F7 Core without guards | **Intentional** |
| F8 Retreat without `travelRoom` | Out of patrol scope (main flee path) |
| F9 Migration flag crash | Out of patrol scope |

---

## Recommended follow-ups

1. **R8-1** — Block critical renew for any armed visible threat (not only home).
2. **R8-3** (optional) — Short danger hold after last hostile sighting in visible room.
3. **R8-2** (optional) — Stricter fail-safe lift while hostiles remain.
4. **R8-7 / R8-8** — Cleanup dead export and legacy defender module when convenient.
5. **Telemetry** — patrol assignments per home, time-in-threat-room, renew-abort count (war-mode entry criteria in plan doc).

---

## Files reviewed

| File | Role |
|------|------|
| `src/role/patrol.ts` | Behavior: threat response, rotation, renew, coordination |
| `src/room/remote/spawn.ts` | `patrolSpawnRequest`, sizing, RCL gates |
| `src/room/remote/planning.ts` | Danger marker, `patrolCoverageFor*`, `remoteArmedFailsafeActive` |
| `src/room/controller.ts` | Fail-safe retreat in `assignRemoteCreep` |
| `src/main.ts` | Patrol dispatch order, `fleeFromHostiles` |
| `src/creep/capabilities.ts` | `PATROL_BODY_TEMPLATES` |
| `src/hostileUtils.ts` | Armed hostile definition |
| `architecture/DEFENSE.md` | Spec alignment |
| `architecture/REMOTES.md` | Remote danger / patrol fields |

---

## Verdict

**Production-viable for expel mode.** Coordinated assignment, room-local fail-safe, and spawn formula are sound. Main residual risks: **renew-abandon under remote critical TTL (R8-1)**, **economy unblocking while combat still live (R8-2)**, and **instant clear on brief loss of hostile vision (R8-3)** — all fixable with small targeted changes without deferred war modes.
