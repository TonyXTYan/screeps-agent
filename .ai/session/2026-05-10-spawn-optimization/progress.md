# Spawn Optimization — Progress

## Status: Complete

### Fix 1: Hauler body — pure CARRY+MOVE
Status: Done
File: `src/creep.capabilities.ts:154-161`
Removed hybrid WORK+CARRY path. Haulers now use pure `[CARRY, CARRY, MOVE]*N` scaling.
- At 300 energy: 4 CARRY (200 carry) vs old 1 CARRY (50 carry) = 4x more carry

### Fix 2: Body budget uses energyCapacityAvailable + minimum threshold
Status: Done  
File: `src/room.controller.ts` — `runSpawnPlanner` + helpers
Body planning:
1. Plan at `energyCapacityAvailable` (max possible given extensions)
2. If unaffordable with current energy, scale down via `remainingEnergy`
3. If scaled body is below RCL-scaled minimum, defer (wait for more energy)

Minimums:

| Archetype | RCL 1-3 | RCL 4-6 | RCL 7+ |
|---|---|---|---|
| Hauler (carry parts) | 2 | 4 | 6 |
| Worker (work parts) | 1 | 2 | 3 |
| Miner/RemoteMiner (work parts) | 1 | 3 | 4 |

Starvation override: if fleet count is 0, skip minimum check to prevent death spirals.

### Fix 3: Cross-tick spawn tracking
Status: Done
File: `src/room.controller.ts` — `runSpawnPlanner:1191-1203`
Before spawn loop, scan all `spawn.spawning` → `Memory.creeps[name].archetype`.
Adds to `pending` array so `chooseSpawnRequest` sees them and prevents duplicate queuing on other free spawns.

### Fix 4: Hauler demand cap
Status: Done
File: `src/room.controller.ts:1894-1906`
Capped `desiredHaulerCapacity` to `maxCarryPerHauler * maxHaulerCreeps` where:
- `maxCarryPerHauler = 2 * floor(energyCapacityAvailable / 150) * CARRY_CAPACITY`
- `maxHaulerCreeps = max(2, ceil(rawDemand / maxCarryPerHauler) + 1)`
Prevents demand formula from requesting more carry than is sensible given per-hauler max size.

### Fix 5: Salvage bonus threshold
Status: Done
File: `src/room.controller.ts:1897`
`droppedResources.length > 10` (was `> 3`). Reduces false triggers from normal dropped energy.

### Fix 6: Remote miner standby-aware replacement
Status: Done
File: `src/room.controller.ts:1439-1455` — `remoteSpawnRequest()`

**Root cause**: Execution order bug. `runSpawnPlanner` (step 5b in main.ts) runs BEFORE
`assignRemoteCreep` (step 6). When a remote miner is dying:
1. `projectedRemoteMinerWork` excludes the dying miner (TTL ≤ horizon)
2. Standby exists in home room but has no sourceId → projection can't find it → deficit
3. Spawning system spawns a DUPLICATE active miner
4. Later in same tick: standby is dispatched → arrives at source
5. Now 3 active miners for 1 source + standby check spawns new standby = 4+ total

**Fix**: Before spawning a replacement active miner, check if a standby exists that will
be dispatched later in the tick:
- `countRemoteStandbyMiners(homeFleet, roomName) > 0` — alive standby
- `pending.some(remoteStandby)` — cross-tick standby being spawned
- Only skips spawn when `minerCount >= 1` — uncovered sources (count=0) always spawn

### Verification
- Build passes with zero errors
- All existing archetypes and body planners preserved
- No type errors
