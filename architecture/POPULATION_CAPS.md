# Creep Population Caps

Quick reference for hard and soft limits on creep counts by archetype and RCL.

## Local Creeps

| Archetype | Cap | Formula / Notes | Code Location |
|-----------|-----|-----------------|---|
| **Miner (active)** | `sourceCount` | 1 per source; measured by `activeMinerCount()` | `room.controller.ts:1462` |
| **Miner (standby)** | `MINER_STANDBY_COUNT = 1` | 1 renewable substitute per home room | `room.controller.ts:95, 1402–1408` |
| **Doctor** | 1 (soft) | Spawns only if `heal === 0` and energy ≥ 450 | `room.controller.ts:1410–1413` |
| **Hauler** | Dynamic | `max(2, ceil(demand / maxCarryPerHauler) + 1)` — see formula below | `room.controller.ts:1277–1282, 1415–1425` |
| **Worker** | RCL-dependent | `[0, 2, 2, 2, 3, 4, 4, 4, 4]` for RCL 0–8 | `room.controller.ts:1430` |
| **Mineral Miner** | 1 (soft) | Spawns if mineral ready, extractor exists, storage ≥ 3000, and `mineralMinerWork === 0` | `room.controller.ts:1437–1447` |

### Hauler Max Count Formula

```typescript
const base = structures.storage ? 600 : 300;
const rclBonus = (rcl >= 7) ? 300 : 0;
const salvageBonus = (tombstones + ruins + drops > 10) ? 300 : 0;
const rawDemand = sources.length * base + rclBonus + salvageBonus;

const maxCarryPerHauler = 2 * floor(energyCapacityAvailable / 150) * CARRY_CAPACITY;
const maxCount = max(2, ceil(rawDemand / maxCarryPerHauler) + 1);
```

**Notes:**
- Minimum 2 haulers at RCL4+ with storage (line 1417)
- Hauler spawn gates on count AND capacity deficit (line 1422–1425)
- Old small-body haulers caused overflow at RCL6 (see KNOWN_ISSUES.md); fixed by this formula

---

## Remote Creeps

| Archetype | Cap | Notes | Code Location |
|-----------|-----|-------|---|
| **Remote Scout** | `REMOTE_SCOUT_KEEP_COUNT = 2` | Per remote room; extras overflow to `remoteWander` | `room.controller.ts:89, 472–476` |
| **Remote Miner (active)** | 2 per source, `sourceCount` total | Spawned for coverage deficit; replaced by standby at TTL < 300 | `room.controller.ts:1500–1518` |
| **Remote Miner (standby)** | `REMOTE_STANDBY_COUNT = 1` | Per remote room, idle at home spawn | `room.controller.ts:1549–1561` |
| **Remote Hauler** | `MAX_REMOTE_HAULERS_PER_SOURCE = 2` | Per source; capped at 2 × sourceCount per room | `room.controller.ts:28, 1525–1526` |
| **Remote Hauler (capacity)** | `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500` | Demand per source; distance-weighted but capped | `room.controller.ts:28, STRATEGY.md:54` |
| **Remote Maintainer** | 1 per room | Spawned if roads/containers need repair | `room.controller.ts:1540–1543` |
| **Claimer** | 1 per target | Configured in `Memory.rooms[home].plan.claimTargets` | `room.controller.ts:1450–1451` |

### Remote Hauler Capacity Demand Formula

```typescript
haulerCapacityDemand = min(
  MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE,  // 2500
  ceil((source.energyCapacity / ENERGY_REGEN_TIME) * pathDistance * 2 * 1.2)
)
```

**Notes:**
- 2500 cap prevents far remotes from demanding unlimited hauler capacity
- Actual haulers spawned only if projected capacity < demand AND under max count
- Idle detection prevents duplicate spawns (line 1527)

---

## Emergency Overrides

| Type | Limit | Notes |
|------|-------|-------|
| **Emergency Worker** | 1 | Spawned when `creeps.length === 0` (recovery) | `room.controller.ts:1382–1384` |
| **Defender** | `ceil(hostiles * 1.5)` | Emergency population control; takes spawn slot before economic creeps | `creep.populationControl.ts:16, 26–30` |

---

## Cross-References

- **Strategy overview:** `.ai/memory/STRATEGY.md` (spawning priorities, population model)
- **Known issues & fixes:** `.ai/memory/KNOWN_ISSUES.md` (hauler/worker overflow fixes)
- **Spawn planning logic:** `src/room.controller.ts:1377–1576` (`chooseSpawnRequest()` and `remoteSpawnRequest()`)
- **Population control:** `src/creep.populationControl.ts` (emergency defenders)
- **Economic architecture:** `architecture/ECONOMY.md` (spawn planning priority list)
- **Remote architecture:** `architecture/REMOTES.md` (remote creep flow)

---

## Gate Logic

**Home priority over remotes:** If any local spawn request is pending (not enough energy), all remote requests are deferred (line 1463 in `room.controller.ts`). This prevents remote expansion from starving the home economy.

**Standby miner race prevention:** When a local active miner dies mid-spawn of its standby replacement, `sourceSpawnDeficit()` now accepts `pendingStandbyMiners` count and suppresses the redundant active spawn (KNOWN_ISSUES.md line 23).
