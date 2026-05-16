# Remote Harvesting Monitor — 2026-05-16

## Architecture Summary

### Remote Mining Flow
1. Opt-in via `remoteMining.activate(homeRoom, remoteRoom, options)`
2. `remoteScout` explores → discovers sources/paths
3. `remoteMiner` (static at container) mines source → deposits to container
4. `remoteHauler` (CARRY+MOVE) transports energy from remote container → home storage
5. `remoteMaintainer` builds/repairs roads and containers in remote room

### Key Efficiency Parameters
- **Path refresh**: Every 5000 ticks (REMOTE_PATH_REFRESH_INTERVAL)
- **Miner replacement**: TTL <= 200 triggers standby spawn
- **Hauler capacity**: max 2 per source, demand capped at 2500
- **Hauler cycle**: remote pickup → home deposit → renew until TTL>1400 → repeat
- **Miner slot caps**: 1 active per source with container, 2 for non-static sources
- **Body budget**: 50% of room energy capacity (BODY_BUDGET_RATIO=0.5)
- **Hauler min energy**: 600, up to 900 for 40% source demand coverage
- **Container threshold**: 50% of hauler carry capacity before selection
- **Danger handling**: 50-tick cooldown when hostiles detected

### Current Remote Rooms
- W6N9 (1 source, route=ok, dist=63)
- W8N9 (2 sources, route=ok, dist=73-96)

---

## Monitoring Summary (3 rounds completed)

### Round 1 (Tick ~70974300-70974690, ~10 min)
- W6N9 throughput: ~150-170 energy/min to home room
- Hauler cycle time: ~150-200 ticks (bottleneck)
- W8N9 route degraded with stalls=1
- Container HP declining across all remotes
- Home storage: 0 (spawn-only bottleneck)

### Round 2 (Tick ~70977532-70977572, ~3 min)
- Home storage: 31246-32146 (has storage now!)
- W8N9 route recovered from degraded to ok
- W8N9 container HP: 6fb8398e=115200, b3921e91=110600-111100
- W6N9 container HP: 225100 (stable)
- Hauler utilization: ~40% (low)
- 4 remote haulers for W8N9, only 1 actively hauling

### Round 3 (Tick ~70977720-70977896, ~3 min)
- Home storage: 56256→71378 (+15122 in 90 ticks = +168 energy/tick)
- Terminal: 25934→9834 (drained, energy transferred to storage)
- W8N9 container 6fb8398e: STABILIZED at 125300
- W8N9 container b3921e91: DECLINING 120400→115400 (-5000 in 90 ticks)
- W6N9 container 119f9ed3: INCREASING 220300→225300 (+5000, maintainer repairing)
- W6N9 source: 1030→130/3000 (depleted, miner going idle)
- Maintainer: switched from traveling to actively repairing
- Hauler utilization: still ~40% (unchanged)
- New claimers spawned for W8N9 and W6N9

---

## Current State (Tick ~70977896)

### Home Room W7N9
| Metric | Value | Trend |
|--------|-------|-------|
| Spawn energy | 2300/2300 | Full |
| Storage | 71378 | STRONG UP (+39232 since R2) |
| Terminal | 9834 | DRAINING (-41300 since R2) |
| Containers | 256-546 | Stable |
| Links | 163-290 + 70-80 + 699 | Stable |
| Recovery mode | No | Good |
| Total creeps | 9 | Stable |

### W8N9 Remote Room (2 sources)
| Source | Energy | Container | Container HP | Miner TTL | Route |
|--------|--------|-----------|-------------|-----------|-------|
| 4adbfc69 | 0/3000 (empty) | 0/2000 | 125300 (STABLE) | 894 | ok |
| 4adbfc6b | 2300/3000 | 690/2000 | 115400 (DECLINING) | 1108 | ok |

**Allocation:** 2 sources, each with 1 miner (5W) + 2 haulers (1400C each)
- Source 4adbfc69: demand=3W/1152C, dist=96
- Source 4adbfc6b: demand=3W/876C, dist=73

### W6N9 Remote Room (1 source)
| Source | Energy | Container | Container HP | Miner TTL | Route |
|--------|--------|-----------|-------------|-----------|-------|
| 4adbff3a | 130/3000 (nearly depleted) | 510/2000 | 225300 (INCREASING) | 634 | ok |

**Allocation:** 1 source, 1 miner (5W) + 2 haulers (1400C)
- Demand: 3W/756C, dist=63

---

## Throughput Analysis

### Energy Flow
- Home storage gaining +168 energy/tick (excellent rate)
- Terminal drained significantly (energy likely transferred to storage)
- Net remote contribution: ~150-200 energy/tick to home storage

### Per-Source Efficiency
**W8N9 4adbfc69:**
- Source empty, container empty — 0% utilization
- Miner idle, waiting for regen (regen=14 ticks)
- Container HP stabilized at 125300

**W8N9 4adbfc6b:**
- Source regenerated to 2300/3000 — ready for mining
- Container at 690/2000 — moderate fill
- Container HP declining at -55 HP/tick

**W6N9 4adbff3a:**
- Source nearly depleted (130/3000) — miner going idle
- Container at 510/2000 — moderate fill
- Container HP increasing (+5000 in 90 ticks) due to maintainer repair

### Hauler Utilization
- Overall: ~40% (2 of 5 remote haulers actively hauling at any time)
- W8N9: 3 haulers, 1-2 hauling, rest traveling
- W6N9: 2 haulers, 0-1 hauling, rest traveling
- Home: 3 haulers, 1 permanently idle
- Body: W1C14M7 (700C) — consistent across all remotes

---

## Issues Identified

### Critical
1. **W8N9 container b3921e91 HP declining** — 120400→115400 (-5000 in 90 ticks), ~55 HP/tick loss rate. At this rate, container dies in ~2100 ticks
2. **Hauler utilization low** — 40% active hauling, 60% traveling/idle
3. **Miner idle during source regen** — ~100-150 ticks wasted per source per cycle

### Moderate
4. **W8N9 claimer stuck** — stuck=4 ticks, not making progress
5. **W6N9 claimer low TTL** — TTL=426, may die soon
6. **Terminal draining** — 51134→9834, energy transferred to storage (normal?)

### Minor
7. **Hauler body size** — 700C seems small for dist=63-96 routes
8. **Source capacity** — sources show 3000 capacity (not 1500 as in R1/R2) — RCL upgrade?

---

## Recommendations

### Immediate
1. **Repair W8N9 container b3921e91** — maintainer should prioritize this container
2. **Reduce hauler count** when utilization is low — 2 per source may be overkill
3. **Consider larger hauler bodies** for longer routes (dist=96)

### Medium-term
4. **Miner standby during source regen** — park miner, don't waste ticks at depleted source
5. **Cross-source hauler sharing** — haulers could pick from either W8N9 source container
6. **Claimer stuck handling** — investigate why W8N9 claimer is stuck

### Long-term
7. **Dynamic hauler scaling** — adjust hauler count based on container fill rates
8. **Source balancing** — distribute mining across sources to avoid simultaneous depletion
9. **Container repair priority** — maintainers should repair containers before roads

---
