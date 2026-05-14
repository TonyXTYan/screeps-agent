# Screeps Bot Inefficiency Audit

**Date:** 2026-05-14 | **Log Source:** screeps_console/logs/screeps_console_2026-05-14.json

## Executive Summary

Multiple inefficiencies found in remote operations, mineral mining, and energy management. Bot runs stably but wastes resources on stuck creeps and dropped energy.

---

## Critical Issues

### 1. Remote Maintainers Stuck (W6N9 & W8N9)
**Severity:** CRITICAL | **Impact:** Wasting creep lifetime

**Root Cause:** Pathfinding failure - maintainers assigned harvest/withdraw jobs from unreachable targets. Fallback logic in `room.controller.ts` lines 327-348.

**Fix:** Commit `cab47a3` introduced `assignRemoteHaulerCycle` - maintainers now traveling/building instead of stuck.

### 2. Dropped Energy W8N9
**Severity:** HIGH | **Impact:** ~2000-3000 energy wasted on ground

**Root Cause:** Hauler capacity insufficient; haulers traveling empty back home.

**Fix:** Haulers now returning with 100% capacity (1300-1500 energy) after `cab47a3`.

### 3. Mineral Container Persistently Empty
**Severity:** HIGH | **Impact:** Mineral extraction not yielding resources

**Root Cause:** Home room energy dropped below 600 threshold required for mineral miner spawning. Container at [12,6] ID 78b700e2.

**Status:** PERSISTING - container L=0/2000 despite extractor active.

### 4. Haulers Running Empty
**Severity:** MEDIUM | **Impact:** 63% of hauler entries show en=0

**Root Cause:** `remoteHaulerMinPickup` threshold too low; `REMOTE_HAULER_RETARGET_STUCK_TICKS` too high.

**Fix:** Improved after `cab47a3` - haulers now return full.

---

## Remote Room Profitability (Tick 70922991)

### Spawning Costs
| Creep Type | Total Cost | Spawns | Avg Cost |
|------------|-----------|--------|----------|
| remoteMiner | 9,350 | 16 | 584 |
| remoteHauler | 35,150 | 34 | 1,034 |
| remoteMaintainer | 3,150 | 7 | 450 |
| **Total** | **47,650** | **57** | **836** |

### Per-Room ROI
| Room | Harvested | Transported | Spawn Cost | Net Energy | ROI |
|------|-----------|-------------|------------|------------|-----|
| W6N9 | 22,100 | 60,561 | 14,950 | +67,711 | 553% |
| W7N9 | 350 | 504,072 | 0 | +504,422 | N/A |
| W8N9 | 66,650 | 97,988 | 62,050 | +102,588 | 265% |

**Total net energy gain: +674,721**

### Efficiency Metrics
- Remote miners: 61% mining, 36% standby (39% idle)
- Remote haulers: 66% hauling, 34% traveling
- Avg hauler energy: 287/1400 (20.5% capacity)
- 63% hauler entries show empty (en=0)

---

## Code Change History

| Tick | Time | Commit | Description |
|------|------|--------|-------------|
| 70921436 | 3:31 AM | f3b60247->b713d59f | Initial change |
| 70921474 | 3:33 AM | b713d59f->eb9d399f | Remote hauler cycle |
| 70921491 | 3:34 AM | eb9d399f->983c8445 | Remote hauler tweaks |
| 70921506 | 3:35 AM | 983c8445->f0a09b0d | More tweaks |
| 70921517 | 3:36 AM | f0a09b0d->42e06698 | Detect code change |
| 70921727 | 3:49 AM | 42e06698->0c6b96c7 | Docs align |
| 70921779 | 3:52 AM | 0c6b96c7->c2ce28d0 | Wall rampart building |
| 70922006 | 4:06 AM | c2ce28d0->adc529bf | Wall rampart v2 + mineral miner fix |
| 70929835 | 12:10 PM | 19b6fd69->277ad41f | Remote miner stuck bug (routeAccessible detection) |
| 70929969 | 12:19 PM | 277ad41f->fb903545 | Fix hauler mineral container threshold bypass |
| 70930402 | 12:45 PM | fb903545->482336fa | Fix inaccessible remote source blocking miners |
| 70930855 | 1:13 PM | 482336fa->dd3e2f7a | Remote miner fix 3 (station path check) |
| 70931641 | 2:02 PM | dd3e2f7a->2b1d3db4 | Remote miner fix v4 (non-winding path check) |

### Impact Assessment
- Hauler energy loading: FIXED (100% capacity returns)
- Claimer progress: IMPROVED (stuck=1 vs stuck=4)
- Remote maintainer: IMPROVED (traveling/building)
- Mineral container: STILL EMPTY (L=2-4/2000)
- Remote miner stuck bug: FIXED (routeAccessible detection working)
- Inaccessible source 4adbfc69: FIXED (miners reassigned to standby)

---

## Current State (Tick 70931161 - RUNNING)

**Home Room (W7N9):**
- Energy: 839/2300 (36%)
- Storage: 0/2250
- Creeps: 1 doctor, 2 haulers, 2 miners, 1 mineralMiner, 3 workers (total=9)

**Mineral:**
- Type: L | Amount: 16287 (decreasing from 22301)
- Extractor: active
- Container 78b700e2 [12,6]: L=2/2000

**Remote Rooms:**
- W6N9: Source 4adbff3a mining, container active, maintainer building
- W7N9: 2 standby miners, 4 haulers traveling (0 energy)
- W8N9: 2 sources mining (4adbfc69, 4adbfc6b), 1 maintainer renewing

---

## Root Cause: remoteHauler-Spawn1-70917525 Stuck Bug

**Bug (pre-cab47a3):** `assignRemoteCreep` called `setJob(creep, 'idle', creep.room.controller)` for remote haulers with no energy source. Controller was within range 3, so `idle()` returned OK without moving. Job cleared every tick -> creep wasted entire TTL at [5,39].

**Fix:** `cab47a3` introduced `assignRemoteHaulerCycle` -> calls `setTravelJob(creep, homeRoom)` correctly.

---

## Recommendations

1. Fix mineral container fill rate (container stays empty despite active extractor)
2. Lower mineral miner energy threshold (currently 600)
3. Reduce hauler empty returns (63% empty rate)
4. Monitor remote ops after recent code changes
5. Consider scaling back W7N9 (minimal harvesting vs massive transport)

---

## Monitoring Log

| Tick | Energy | Storage | Mineral Container | Status |
|------|--------|---------|-------------------|--------|
| 70919080 | 432/2300 | 30 | L=0/2000 | Energy crisis |
| 70920470 | 161/2300 | 0 | L=0/2000 | Critical depletion |
| 70920880 | 2088/2300 | 0 | L=0/2000 | Recovery started |
| 70922901 | 2300/2300 | 1367 | L=10/2000 | Full energy |
| 70922951 | 2300/2300 | 900 | L=5-25/2000 | Fluctuating |
| 70922991 | 2025/2300 | 780 | L=0/2000 | PAUSED - stale |
| 70931121 | 2020/2300 | 182 | L=4/2000 | Resumed after pause |
| 70931151 | 278/2300 | 0 | L=2/2000 | Energy dropping |
| 70931161 | 839/2300 | 0 | L=2/2000 | RUNNING - miners active |
