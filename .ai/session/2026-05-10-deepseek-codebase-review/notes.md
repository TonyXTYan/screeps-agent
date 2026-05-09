# Codebase Review (2026-05-10)

## Context

Full review of the entire screeps-agent codebase (17 TypeScript files, ~5,300 lines). The bot is in a hybrid state: a strategic capability-based path coexists with legacy role scripts. Reviewed after implementing several fixes for remote mining issues (hauler over-spawning, home-room priority, standby miner system, hauler body optimization).

## Review Findings

### Fixes Applied During This Session

1. **Home room priority (Fix A)** — added `if (pending.some(r => !r.remoteRoom)) { return null; }` in `remoteSpawnRequest()` at `src/room.controller.ts:1280`. Blocks all remote spawns when any home-room spawn request is pending energy.

2. **Remote standby miner system (Fix B)** — added `remoteStandby` to creep memory, `countRemoteStandbyMiners()`, `findDyingRemoteMiner()`, dispatch logic in `assignRemoteCreep()`, and renewal logic in `tryRenewStandbyMiner()`. Each remote room gets `sources + 1` miners total, with one as idle standby at home that dispatches to replace dying miners.

3. **Remote hauler over-spawning fix** — capped `haulerCapacityDemand` with `Math.min(MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE, ...)` = 500 at line 524. Added hard per-source hauler limit: `countRemoteHaulersForSource < MAX_REMOTE_HAULERS_PER_SOURCE (2)` at line 1354. Combined, this limits a 2-source remote room to at most 4 haulers instead of potentially 8-20+.

4. **Pure CARRY remote hauler body** — changed `remoteHauler` body from hybrid `[WORK,CARRY,MOVE,...]` to pure `[CARRY,CARRY,MOVE,...]` at `creep.capabilities.ts:155`. At 800 energy: goes from 1W+9C=450 CARRY to 10C=500 CARRY (11% more). Fewer, bigger haulers.

### Critical Bugs Found

#### B1: `isArmedHostile` duplicated 5 times (line identical)

| File | Line |
|------|------|
| `role.defender.ts` | 43 |
| `tower.basics.ts` | 103 |
| `creep.populationControl.ts` | 42 |
| `room.controller.ts` | 2802 |
| `main.ts` | 260 |

- All identical: `return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;`
- Fix: extract to a shared utility module, import everywhere.

#### B2: Legacy roles delete creep memory — will destroy remote creeps

`role.harvester.ts:82` and `role.builder.ts:41`:
```typescript
delete Memory.creeps[creep.name];
```
- Executes when a legacy-role creep is idle (no construction sites, no repair targets, everything full, only a few of its role exist). If a remote creep (miner/hauler/maintainer) falls through to the legacy fallback and happens to be idle, **all its memory is destroyed** — losing `remoteRoom`, `sourceId`, `archetype`, `homeRoom`, etc. The creep is effectively dead to the strategic path.
- Fix: remove the `delete Memory.creeps` lines, or add a guard `if (creep.memory.remoteRoom || creep.memory.archetype) { return; }`.

#### B3: Opportunistic remoteHauler repair is dead code

`room.controller.ts:169-176` checks `capabilities.repair > 0`. Since the remoteHauler body no longer includes WORK (Fix #4 above), `repair` is always 0. The entire opportunistic repair branch is unreachable.
- Harmless but misleading. The fallthrough at line 178 (`creep.room.name !== homeRoom`) still correctly sends haulers home with energy.
- Fix: remove the dead branch, or keep it commented as documentation.

### Medium Issues

#### M1: Two parallel body planning systems

| System | File | Used by |
|--------|------|---------|
| Archetype-based | `creep.capabilities.ts:planBodyForArchetype()` | Strategic path (spawn planner, room controller) |
| Role-based | `creep.roleBalance.ts:balanceSpec()` | Legacy population control, defender spawning |

Currently don't conflict because they spawn different creep types, but unification would reduce confusion.

#### M2: God module — `room.controller.ts` (2,868 lines)

Single file handles: room plan init, remote room management, spawn planning, job assignment, energy spending, link management, capability measurement, demand calculation, construction/repair targeting, structure caching, path serialization, mineral plans, and all remote creep AI. At minimum, these could be split:
- Remote room logic (~400 lines) → `room.remote.ts`
- Spawn planning (~250 lines) → `room.spawnPlanner.ts`
- Job assignment (~300 lines) → `room.jobAssignment.ts`

#### M3: Remote room memory never garbage-collected

When a remote room is disabled (`remote.enabled = false`), its plans (serialized paths, container IDs, demand data) remain in Memory forever. No cleanup mechanism exists.

#### M4: Hostile detection gap — only scouts write `dangerUntil`

`room.controller.ts:470` — only the scout detection path sets `dangerUntil`. If a **miner or hauler** detects hostiles at the remote room, it flees locally but does **not** communicate back. The home room keeps spawning replacement miners/haulers walking into danger. The `assignRemoteCreep` already reads `dangerUntil` (line 136) — just need non-scout creeps to also write it.

#### M5: `installMoveDebugHook` always active

`main.ts:144-162` monkey-patches `Creep.prototype.moveTo` every tick unconditionally. When no remote room has debug paths enabled, it's a no-op per-creep overhead. Should be guarded by checking whether any remote room has `debugPaths: true` before installing.

### Minor Issues

#### m1: `firstStoredResource` duplicated
Defined in `creep.jobRunner.ts:537` and `room.controller.ts`. Already flagged in KNOWN_ISSUES.md.

#### m2: Structure cache write-through only
`room.structures.ts:rememberRoomStructures()` writes to memory but `getRoomStructures()` always calls `FIND_STRUCTURES` fresh. The memory cache is only used for structure-count change detection (throttling writes), not for actual structure lookup reuse.

#### m3: Unused `interruptReason`
Written by `keepCurrentJob` for observability but never read. Already flagged in KNOWN_ISSUES.md.

#### m4: Redundant `FIND_STRUCTURES` calls from legacy roles
`role.harvester.ts:energyTargets()` and `role.builder.ts` each call `FIND_STRUCTURES`/`FIND_CONSTRUCTION_SITES` per creep. The strategic job path avoids these, but legacy fallback still incurs them.

#### m5: Scout hostile detection writes `dangerUntil` but fleeFromHostiles doesn't
`main.ts:fleeFromHostiles()` runs before `assignRemoteCreep` for all creeps. A remote creep that flees hostiles won't have `dangerUntil` set until the next scout visit — gap of up to scout revisit period.

## Fix Recommendations (Priority Order)

### Quick Wins (low risk, immediate)

1. **Remove `delete Memory.creeps` from legacy roles** (2 lines)
   - `role.harvester.ts:82`: remove `delete Memory.creeps[creep.name];`
   - `role.builder.ts:41`: remove `delete Memory.creeps[creep.name];`
   - Add guard: `if (creep.memory.remoteRoom || creep.memory.archetype) { return; }` before the delete.

2. **Extract `isArmedHostile` to shared module** (1 new file, 5 deletions)
   - Create `src/utils.ts` with `export function isArmedHostile(creep: Creep): boolean`
   - Import from `utils.ts` in all 5 files, remove local definitions.

3. **Non-scout hostile detection writes `dangerUntil`** (~3 lines)
   - In `assignRemoteCreep()` or `fleeFromHostiles()`, when a non-scout remote creep detects hostiles: `Memory.rooms[homeRoom].plan.remoteRooms[remoteRoom].dangerUntil = Game.time + REMOTE_DANGER_TICKS`.

4. **Guard `installMoveDebugHook`** (~3 lines)
   - Check if any remote room has `debugPaths: true` before monkey-patching `moveTo`.

### Structural (medium effort, high payoff)

5. **Split `room.controller.ts` into modules**
   - `room.remote.ts` — remote room logic
   - `room.spawnPlanner.ts` — spawn request generation
   - `room.jobAssignment.ts` — job assignment and reservations

6. **Remove legacy body planner** (`creep.roleBalance.ts:balanceSpec`)
   - Once all creeps spawn through the strategic path, `balanceSpec` is dead code.

### Maintenance (low priority)

7. **Consolidate `firstStoredResource`** into shared utilities.
8. **Remove unused `interruptReason`** or start consuming it for debugging.
9. **Add remote room memory cleanup** when rooms are disabled.
10. **Read from structure cache** instead of always calling `FIND_STRUCTURES`.

## Files Changed This Session

- `src/room.controller.ts` — home room priority gate, remote standby miner system, hauler capacity cap, per-source hauler limit, `countRemoteHaulersForSource()`
- `src/creep.capabilities.ts` — remoteHauler body changed from hybrid WORK+CARRY to pure CARRY+MOVE
- `src/main.ts` — `tryRenewStandbyMiner()` extended to handle remote standby miners

## Verification

- `npx tsc --noEmit`: clean
- `npm run build`: clean
- `npm run deploy`: not run (requires Screeps credentials)
