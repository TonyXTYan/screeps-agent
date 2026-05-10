# Spawn Overcrowding Fixes (2026-05-11)

## Context

Reviewed the spawning pipeline for creep overcrowding. Found and fixed 4 bugs where certain creep types could over-accumulate or be inappropriately spawned. The spawning pipeline is demand-driven (capability deficits vs computed demand) with per-tick pending dedup — but several gaps in the guard logic allowed excess creeps.

## Fixes Applied

### Fix 1: Standby miner blind spot → N+2 miners (BUG-1)

**Files**: `src/room.controller.ts:1369`, `src/room.controller.ts:2471-2487`

**Root cause**: When a standby local miner is spawning (in-flight), it has no `sourceId` in its memory so it's not in `pendingSourceIds`. `sourceSpawnDeficit` only checks `assignedSourceMinerCount === 0` per source. If the active miner for a source dies during the standby's spawn window (~50 ticks), the deficit fires and spawns a redundant active miner. After both the standby and the new active emerge: N+2 miners for N sources.

**Fix**: Added `pendingStandbyMiners` parameter to `sourceSpawnDeficit`. When a standby is pending and the source is uncovered, check if total covered sources + pending standby >= source count. If so, the standby is expected to cover the gap — skip the deficit.

### Fix 2: Doctor WORK inflating workerWork (BUG-2)

**Files**: `src/room.controller.ts:1952`

**Root cause**: `measureCapabilities` uses an `else` branch to catch non-miner/non-hauler/non-specialist archetypes. Doctors (archetype `'doctor'`) have 2 WORK parts in their body plan (`[WORK, WORK, CARRY, CARRY, MOVE, MOVE, HEAL, MOVE]`), which were added to `workerWork`. Since doctors prioritize `heal` over work, their measured work was fictitious — the system thought it had more building/repairing/upgrading capacity than it actually had, undersupplying workers.

**Fix**: Added explicit `else if (archetype === 'doctor' || archetype === 'claimer')` branch, same as `remoteMaintainer`/`remoteScout`. Their work is no longer counted in `workerWork`.

### Fix 3: `hasIdleRemoteHauler` always returns false when remote room invisible (BUG-3)

**Files**: `src/room.controller.ts:1883-1897`

**Root cause**: `hasIdleRemoteHauler` returned `false` immediately when `!room` (remote room not visible). This meant the idle gate never blocked spawning for unviewed rooms. The `totalRoomHaulers < 2 * numSources` cap was the sole backstop, and the system would fill up to it before stabilizing.

**Fix**: Removed the early `return false`. When room is visible, container check proceeds as before. When room is NOT visible, the function now checks for an empty-store hauler sitting in the home room (`!creep.spawning && creep.room.name === creep.memory.homeRoom`). If one exists, it's treated as idle — already spawned but not yet departed, so don't spawn another.

### Fix 4: Worker workRatio activates too late (BUG-4)

**Files**: `src/room.controller.ts:1348,1352`

**Root cause**: `workerWorkRatio` returned 1 for RCL < 4, producing workers with only 1 WORK part each. With `desiredWorkerWork` = 4-12, this meant 4-12 worker creeps accumulated. At 1500-tick lifetimes, this created congestion.

**Fix**: Lowered activation thresholds:
- Ratio 1: RCL < 3 (was < 4) — RCL 1 only
- Ratio 2: remainingWork > 10000 (unchanged, now accessible at RCL 3+)
- Ratio 3: RCL 4+ with >30000 remainingWork (was RCL 6+)

This means RCL 3 rooms with construction get [WORK, WORK, CARRY, MOVE] workers (2 WORK each), and RCL 4+ rooms with heavy construction get [WORK, WORK, WORK, CARRY, MOVE] workers (3 WORK each), reducing total worker count proportionally.

## Files Changed

- `src/room.controller.ts` — all 4 fixes
- `.ai/memory/KNOWN_ISSUES.md` — added fixed entries

## Verification

- `npx tsc --noEmit`: clean
- `npm run build`: clean (no warnings)

## Remaining Known Issues

All previously documented issues in KNOWN_ISSUES.md remain open:
- `isArmedHostile` duplicated 5 times
- Legacy role scripts delete creep memory
- Remote danger detection gap (only scouts write `dangerUntil`)
- Two parallel body planning systems
- `room.controller.ts` god module
- Remote room memory never garbage-collected
- etc.
