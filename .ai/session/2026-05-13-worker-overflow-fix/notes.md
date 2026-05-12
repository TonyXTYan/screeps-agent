# Session: Worker Overflow Fix (2026-05-13)

## Problem
Room W7N9 had 12 workers at RCL 6 — `dumpHome` confirmed `worker=12 hauler=7 miner=3 doctor=1 mineralMiner=1 total=24`.

## Root Cause
`chooseSpawnRequest()` in `room.controller.ts` had no hard worker count cap. Workers spawned until total WORK capacity met `desiredWorkerWork()` demand (up to 12+ at RCL 6 with many construction sites). Small W2C1M1 bodies (2 WORK each) meant up to 12 workers to fill a demand of ~24 WORK.

## Secondary Issue
Emergency-recovery guard (`if (context.creeps.length === 0)`) fired before checking `pending`, so with 2 free spawns and all creeps dead both spawns would both request a worker on the same tick.

## Tertiary Issue
`Defender-Spawn1-70878840` (ATTACK+MOVE body, role='defender') was falling through all body checks in `inferArchetype()` to the default `return 'worker'`, consuming one of the 4 allowed worker slots without contributing any WORK capacity.

## Fixes Applied

### 1. `src/room.controller.ts` — maxWorkerCount cap in `chooseSpawnRequest()`
```typescript
const rcl = context.room.controller?.level ?? 0;
const maxWorkerCount = [0, 2, 2, 2, 3, 4, 4, 4, 4][Math.min(rcl, 8)] || 4;
const workerCreeps = context.creeps.filter(c => ensureArchetype(c) === 'worker' && !c.spawning).length;
if (workerCreeps < maxWorkerCount) { return { archetype: 'worker', ... }; }
```
Caps: RCL 0→0, RCL 1–3→2, RCL 4→3, RCL 5+→4.

### 2. `src/room.controller.ts` — emergency recovery pending guard
```typescript
// Before:
if (context.creeps.length === 0) { return { archetype: 'worker', reason: 'emergency recovery' }; }
// After:
if (context.creeps.length === 0 && !pending.some(r => r.archetype === 'worker')) { ... }
```

### 3. `src/room.controller.ts` — exclude 'defender' from workerWork in `measureCapabilities()`
Added `|| archetype === 'defender'` to the condition that skips non-worker archetypes.

### 4. `src/types.d.ts` — added `'defender'` to `CreepArchetype` union

### 5. `src/creep.capabilities.ts` — defender role guard in `inferArchetype()`
```typescript
if (capabilities.carry > 0) { return 'hauler'; }
if (creep.memory.role === 'defender') { return 'defender'; }  // NEW
return 'worker';
```

## Build Status (Worker Fix)
`npx tsc --noEmit` clean, `npm run build` succeeded (hash `1b78c5bd`). Not yet deployed.

---

# Session Addendum: Hauler Count Cap (same session, later)

## Problem
`hauler=7` observed at RCL 6 in W7N9. `desiredHaulerCapacity()` returned a capacity target but never enforced a count maximum. Old small-body haulers from early game kept `haulerCapacity` below demand, causing repeated spawns.

## Root Cause
`desiredHaulerCapacity` computed `maxHaulerCreeps` internally but returned only the numeric demand. The spawn condition checked capacity only (`capacities.haulerCapacity < demand`), not count.

## Fix (`src/room.controller.ts`, 3 edits)
1. `desiredHaulerCapacity` return type changed to `{ demand: number; maxCount: number }` — `maxCount` is the existing `maxHaulerCreeps` now exposed.
2. Line ~858 (load measurement): `desiredHaulerCapacity(context)` → `desiredHaulerCapacity(context).demand`
3. Line ~1410 in `chooseSpawnRequest`: destructured `{ demand: haulerCapacityDemand, maxCount: maxHaulerCount }`; added `haulerCountWithPending < maxHaulerCount` guard before the capacity-deficit spawn return.

## RemoteHaulers: No Change Needed
Already protected by `MAX_REMOTE_HAULERS_PER_SOURCE=2`, per-room cap `2 * numSources`, and `hasIdleRemoteHauler` idle detection.

## Expected Post-Deploy Behavior
- Workers settle at ≤4 for RCL 5+ rooms; haulers settle at ≤2 for a 2-source RCL 6 room
- `[memoryAudit]` log appears on first tick after deploy (new commit hash)
- Spawn logs show `haul deficit X/Y Z/2` capped entries, stopping once count hits max
