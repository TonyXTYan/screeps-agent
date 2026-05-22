# Creep Population Caps

Quick reference for hard and soft limits on creep counts by archetype and RCL.

## Local Creeps

| Archetype | Cap | Formula / Notes | Code Location |
|-----------|-----|-----------------|---|
| **Miner** | `sourceCount` | 1 per source; self-renews at TTL < 500 via home renew flow — no standby needed. At RCL <= 3 (body < 1000e), miners die and are replaced on death. | `rooms/spawning/planner.ts`, `creeps/renewal.ts` |
| **Doctor** | 1 (soft) | Spawns only if `heal === 0` and energy >= 450 | `rooms/spawning/planner.ts`, `rooms/spawning/accounting.ts` |
| **Hauler** | Dynamic | `max(2, ceil(demand / maxCarryPerHauler) + 1)` — see formula below | `rooms/spawning/planner.ts`, `rooms/spawning/accounting.ts` |
| **Worker** | RCL-dependent | `[0, 2, 2, 2, 3, 4, 4, 4, 4]` for RCL 0-8 | `rooms/spawning/planner.ts` |
| **Mineral Miner** | 1 (soft) | Spawns if mineral ready (extractor exists, mineral.mineralAmount > 0, container exists), `mineralMinerWork < requiredWork`, and not pending | `rooms/spawning/planner.ts`, `rooms/spawning/accounting.ts` |

### Hauler Max Count Formula

```typescript
const base = structures.storage ? 600 : 300;
const rclBonus = (rcl >= 7) ? 300 : 0;
const salvageBonus = (tombstones + ruins + drops > 10) ? 300 : 0;
const rawDemand = sources.length * base + rclBonus + salvageBonus;

// budget capped at 50% of capacity (BODY_BUDGET_RATIO=0.5, BODY_MIN_BUDGET=300)
const haulerBudget = max(BODY_MIN_BUDGET, floor(energyCapacityAvailable * BODY_BUDGET_RATIO));
const maxCarryPerHauler = min(MAX_CARRY_CAPACITY, 2 * floor(haulerBudget / 150) * CARRY_CAPACITY);  // hard cap: 1000
const maxCount = max(2, ceil(rawDemand / maxCarryPerHauler) + 1);
```

**Notes:**
- Minimum 2 haulers at RCL4+ with storage.
- Hauler spawn gates on count AND capacity deficit.
- Old small-body haulers caused overflow at RCL6 (see KNOWN_ISSUES.md); fixed by this formula
- `haulerBudget` matches the spawn planner's `maxBudget` so demand and actual body size stay in sync
- `MAX_CARRY_CAPACITY = 1000` hard-caps hauler (and worker) body builders regardless of energy budget

---

## Remote Creeps

| Archetype | Cap | Notes | Code Location |
|-----------|-----|-------|---|
| **Remote Scout** | `REMOTE_SCOUT_KEEP_COUNT = 2` | Per remote room; extras overflow to `remoteWander` | `rooms/spawning/remote.ts`, `rooms/remotes/scouts.ts`, `rooms/remotes/scoutOverflow.ts` |
| **Remote Miner (active)** | Per-source slot cap (`1` on container/station sources, `2` max otherwise) | Spawned for coverage deficit; reassigned by slot availability; overflow falls back to standby/return-home behavior | `rooms/spawning/remote.ts`, `rooms/remotes/coverage.ts`, `rooms/remotes/minerStation.ts` |
| **Remote Miner (standby)** | Demand-driven handoff | Source-targeted replacement for dying miners; source-less standby miners are reassigned to uncovered accessible sources | `rooms/remotes/standbyMiner.ts`, `rooms/remotes/fleet.ts`, `rooms/remotes/coverage.ts` |
| **Remote Hauler** | `MAX_REMOTE_HAULERS_PER_SOURCE = 2` | Per source; capped at 2 x sourceCount per room | `rooms/spawning/remote.ts`, `rooms/remotes/coverage.ts` |
| **Remote Hauler (capacity)** | `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500` | Demand per source; distance-weighted but capped | `rooms/remotes/planning.ts`, `rooms/remotes/coverage.ts` |
| **Remote Maintainer** | 1 per room | Spawned if roads/containers need repair | `rooms/spawning/remote.ts`, `rooms/remotes/maintenance.ts`, `rooms/remotes/infrastructure.ts` |
| **Claimer** | 1 per target | Configured in `Memory.rooms[home].plan.claimTargets` | `rooms/spawning/planner.ts`, `rooms/spawning/remote.ts` |

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
- Idle detection prevents duplicate spawns.

---

## Emergency Overrides

| Type | Limit | Notes |
|------|-------|-------|
| **Emergency Worker** | 1 | Spawned when `creeps.length === 0` (recovery) | `rooms/spawning/planner.ts` |
| **Defender** | `ceil(hostiles * 1.5)` | Emergency population control; takes spawn slot before economic creeps | `creep.populationControl.ts` |

---

## Cross-References

- **Behavior and policy overview:** `architecture/OVERVIEW.md` and `architecture/ECONOMY.md` (spawning priorities, population model)
- **Known issues & fixes:** `.ai/memory/KNOWN_ISSUES.md` (hauler/worker overflow fixes)
- **Spawn planning logic:** `src/rooms/spawning/planner.ts` (`runSpawnPlanner()`, `chooseSpawnRequest()`), `src/rooms/spawning/remote.ts` (`remoteSpawnRequest()`), and `src/rooms/spawning/remotePolicy.ts` (remote gates and minimum body checks), with pending accounting in `src/rooms/spawning/accounting.ts`
- **Population control:** `src/creep.populationControl.ts` (emergency defenders)
- **Economic architecture:** `architecture/ECONOMY.md` (spawn planning priority list)
- **Remote architecture:** `architecture/REMOTES.md` (remote creep flow)

---

## Gate Logic

**Home priority over remotes:** If any local spawn request is pending (not enough energy), all remote requests are deferred by `rooms/spawning/remotePolicy.ts`. This prevents remote expansion from starving the home economy.

**Standby miner race prevention:** When a local active miner dies mid-spawn of its standby replacement, `sourceSpawnDeficit()` accepts `pendingStandbyMiners` count and suppresses the redundant active spawn. See `.ai/memory/KNOWN_ISSUES.md` for context.
