# Spawn Optimization Plan

## Problem
Too many worker, hauler, and remoteMiner creeps. Root causes:

1. **Hauler body has wasteful WORK parts** — hybrid `[WORK, CARRY, MOVE]` at low energy gives 50 carry vs pure `[CARRY, CARRY, MOVE]` which gives 100. WORK costs 100 energy for 0 carry capacity.

2. **No cross-tick spawn tracking** — `pending` array is local per `runSpawnPlanner()` call. With multiple spawns, one spawn can queue archetype X while another is still building X (in `spawn.spawning` but not yet in `Game.creeps`). Causes duplicates.

3. **Body budget uses `energyAvailable` not `energyCapacityAvailable`** — creeps are sized to current energy in the room rather than max possible given extensions. Produces many small, inefficient creeps.

4. **Demand formula ignores per-creep max capacity** — `desiredHaulerCapacity = 1500` with no awareness that each hauler at max size provides ~800 carry. Should compute `ceil(demand / perCreepMax)` for target count.

5. **Salvage bonus triggers too easily** — `droppedResources.length > 3` is hit by normal dropped energy from over-mining.

## Research Findings

Three top Screeps bots were analyzed (Overmind, The International, bonzAI):

| Approach | Common Pattern |
|---|---|
| **Hauler body** | Pure CARRY+MOVE. No WORK. 2C:1M with roads, 1C:1M offroad. |
| **Spawn queue** | Priority-sorted queue per colony. Spawns consumed atomically. Cross-tick tracking via `spawn.spawning`. |
| **Body sizing** | Plan at `energyCapacityAvailable` (max). Defer if not affordable. |
| **Remote handoff** | Prespawn window + suicide old miner when replacement arrives. |
| **Population** | Throughput-based: `energyPerTick × distance × scaling` not flat capacity targets. |

## Changes (in priority order)

### Fix 1: Hauler body — pure CARRY+MOVE
File: `src/creep.capabilities.ts:154-171`
Remove hybrid WORK+CARRY path. Pure `[CARRY, CARRY, MOVE]*N` only.
- At 300 energy: 4 CARRY (200 carry) vs current 1 CARRY (50 carry)

### Fix 2: Body budget uses energyCapacityAvailable + minimum threshold
File: `src/room.controller.ts:1162-1186`
Two-step body planning:
1. Plan at `energyCapacityAvailable` (max possible)
2. If unaffordable with current energy, scale down
3. If scaled body is below RCL-scaled minimum, defer (wait for more energy)

| Archetype | RCL 1-3 min | RCL 4-6 min | RCL 7+ min |
|---|---|---|---|
| Hauler | 2 CARRY | 4 CARRY | 6 CARRY |
| Worker | 1 WORK | 2 WORK | 3 WORK |
| RemoteMiner | 3 WORK | 5 WORK | 5 WORK |

### Fix 3: Cross-tick spawn tracking
File: `src/room.controller.ts` ~runSpawnPlanner
Before spawn loop, scan `spawn.spawning` → `Memory.creeps[name].archetype`.
Track these archetypes in `chooseSpawnRequest` to prevent duplicates.

### Fix 4: Demand calculation uses max per-creep capacity
File: `src/room.controller.ts:1785-1800`
Compute target count from max body size at `energyCapacityAvailable`:
- `carryPerHauler = floor(energyCapacityAvailable / 150) * 100`
- `haulersNeeded = ceil(energyDemand / carryPerHauler)`

### Fix 5: Tune salvage bonus
File: `src/room.controller.ts:1788`
`droppedResources.length > 3` → `> 10`
