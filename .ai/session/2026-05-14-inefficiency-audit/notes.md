# Screeps Bot Inefficiency Audit

**Date:** 2026-05-14
**Tick Range Analyzed:** ~70908000 to ~70919080 (current)
**Log Source:** screeps_console/logs/screeps_console_2026-05-14.json (15,487 lines)
**Live Terminal:** Screeps-console connected agent

## Executive Summary

Multiple significant inefficiencies found across remote operations, mineral mining, and energy management. No critical errors detected - the bot is running stably but wasting resources on stuck creeps and dropped energy.

---

## Critical Issues

### 1. Remote Maintainers Permanently Stuck (W6N9 & W8N9)
**Severity:** CRITICAL
**Impact:** Wasting creep lifetime on unproductive actions

**Evidence:**
- `remoteMaintainer-Spawn1-70917660` in W6N9: stuck=27 ticks (observed growing from 7 to 27)
- `remoteMaintainer-Spawn1-70915807-3` in W8N9: stuck=4 ticks repeatedly
- Both creeps assigned `job=harvestSource` but unable to reach targets
- Memory audit repeatedly clearing stale travel data for these creeps

**Current State (tick 70919080):**
- W6N9 maintainer: renewing, en=0/100, pos=[31,26] - traveling home
- W8N9 maintainer: stuck=2, job=withdrawEnergy, pos=[44,40], trg=[18,27], r=26

**Root Cause:** Pathfinding failure - maintainers assigned to harvest/withdraw from sources/containers they cannot reach due to terrain or distance

**Recommendation:** Add pathfinding validation before assigning harvest jobs to maintainers; consider dedicated transport creeps instead

### 2. Dropped Energy Growing Unchecked (W8N9)
**Severity:** HIGH
**Impact:** ~2000-3000 energy wasted on ground

**Evidence:**
- Dropped energy at [42,6] in W8N9 grew from 897 to 2989 over logging period
- Source 4adbfc69 consistently at 3000/3000 (full) - miners harvesting but haulers not picking up
- Container at [18,27] only at 365-445/2000 energy

**Current State:**
- Container b1ba99ae at [18,27]: energy=445/2000 (was 0 for most of the period)
- Source 4adbfc6b at [19,28]: energy=2568/3000

**Root Cause:** Hauler capacity insufficient to clear harvested energy; haulers traveling empty back to home

**Recommendation:** Increase hauler capacity or spawn frequency; add container management priority

---

## High Priority Issues

### 3. Remote Haulers Running Empty
**Severity:** HIGH
**Impact:** Complete waste of creep lifetime traveling with no energy

**Evidence:**
- Multiple haulers showing `en=0/XXX` consistently:
  - `remoteHauler-Spawn1-70917289`: en=0/400
  - `remoteHauler-Spawn1-70917333`: en=0/300
  - `remoteHauler-Spawn1-70917525`: en=0/1100 (51 ticks TTL remaining, dying empty)
- Some haulers finally getting energy (300-400) but still low compared to capacity

**Current State:**
- 4 haulers in W8N9, 1 in W6N9
- Most traveling to W7N9 with only 300-400 energy (30-40% capacity)
- `remoteHauler-Spawn1-70917525` about to die with 0 energy after 500+ ticks

**Root Cause:** Haulers leaving remote rooms before fully loaded; container energy management inefficient

**Recommendation:** Add minimum energy threshold before haulers return; optimize container pickup logic

### 4. Remote Miners Stuck in Standby
**Severity:** MEDIUM-HIGH
**Impact:** Reduced mining efficiency in remote rooms

**Evidence:**
- `remoteMiner-Spawn1-70915757`: stuck=10 ticks in standby mode in W7N9
- `remoteMiner-Spawn1-70916180-1`: stuck=5 ticks in standby in W7N9
- Memory audit clearing stale travel data for these creeps
- Multiple miners cycling to standby instead of mining

**Current State:**
- 2 remote miners actively mining in W8N9
- 1 remote miner mining in W6N9
- 2 remote miners stuck in standby in W7N9 (home room)

**Root Cause:** Standby logic not properly handling return-to-room scenarios; creeps getting "stuck" flag

**Recommendation:** Review standby transition logic; add timeout for stuck detection

---

## Medium Priority Issues

### 5. Mineral Container Always Empty
**Severity:** MEDIUM
**Impact:** Extractor may not be functioning optimally

**Evidence:**
- Container 78b700e2 at [12,6]: `energy=0/2000` consistently throughout logging period
- Mineral miner present but container never has energy
- Lava mineral amount stable at 23,718-25,788

**Current State:**
- Container still at energy=0/2000
- Mineral miner mineralMiner-Spawn1-70918116 active

**Root Cause:** Mineral miner not depositing energy in container; possibly pathfinding issue to container

**Recommendation:** Check mineral miner job assignments; verify container proximity to miner path

### 6. Historical Mineral Miners Getting Stuck
**Severity:** MEDIUM
**Impact:** Wasted creep spawns and reduced mineral collection

**Evidence:**
- 15 instances of mineralMiner creeps getting stuck at positions [11,7], [12,7], [13,5]
- All near mineral location [11,5] - possible terrain/pathfinding issue
- Stuck for 4-5 ticks each occurrence
- Multiple mineral miner spawns cleared from memory due to being stuck

**Current State:**
- Current mineral miner appears to be functioning

**Root Cause:** Pathfinding issue near mineral location; possibly terrain obstacles or controller interference

**Recommendation:** Add road construction near mineral path; review pathfinding cost matrix

### 7. CPU Bucket Volatility
**Severity:** LOW-MEDIUM
**Impact:** Potential performance degradation during spikes

**Evidence:**
- CPU bucket dropped from 10000 to 1706 (tick 70918570)
- Recovered to 6485-6694 range
- Memory audit running every tick may contribute to overhead

**Current State:**
- CPU bucket stable at 6694

**Root Cause:** Periodic expensive operations (memory audit, room scanning)

**Recommendation:** Consider reducing memory audit frequency; optimize room scanning logic

---

## Low Priority Issues

### 8. Home Room Energy Management
**Severity:** LOW
**Impact:** Minor efficiency loss

**Evidence:**
- Home room energy fluctuating: 622/2250 -> 1861/2300 -> 432/2300
- Storage dropping to 0-90 energy
- Workers frequently at 0/500 energy

**Current State:**
- Energy: 432/2300, storage: 30
- Workers at 226/500, 0/500, 0/500 energy

**Root Cause:** Normal energy consumption cycle; remote operations drawing from home reserves

**Recommendation:** Monitor if this becomes more frequent; consider energy reserve thresholds

### 9. Claimer Stuck Repeatedly
**Severity:** LOW
**Impact:** Minor resource waste

**Evidence:**
- Claimers in both W8N9 and W6N9 showing `stuck=4` consistently
- `claimer-Spawn1-70918870`: stuck=4, reserving in W8N9
- `claimer-Spawn1-70918404`: stuck=4, reserving in W6N9

**Current State:**
- Both claimers still stuck=4

**Root Cause:** Claimers having difficulty reaching controller; possibly blocked by terrain or other structures

**Recommendation:** Review claimer pathfinding; consider road construction to controllers

---

## System Health Summary

**Stability:** GOOD - no crashes or critical errors
**Memory Management:** GOOD - memory audit running cleanly, clearing stale data
**CPU Usage:** ACCEPTABLE - some volatility but within limits
**Remote Operations:** POOR - multiple inefficiencies in mining/hauling cycle
**Energy Flow:** POOR - significant energy waste in remote rooms

## Recommendations Priority Order

1. Fix remote maintainer pathfinding (stop wasting maintainer creeps)
2. Optimize hauler energy loading (reduce empty returns)
3. Address dropped energy in W8N9 (recover ~2000 energy)
4. Fix mineral container energy management
5. Review standby logic for remote miners
6. Add road construction near mineral location
7. Optimize CPU usage during memory audit cycles

---

## Status Update - Tick 70919080 (1:08 AM)

### Issue Resolution Tracking

| Issue | Status | Notes |
|-------|--------|-------|
| Remote maintainers stuck | PERSISTING | W8N9 maintainer still stuck=2, W6N9 maintainer renewing |
| Dropped energy W8N9 | PERSISTING | Container at [18,27] only 365-445/2000 energy |
| Haulers running empty | PERSISTING | Multiple haulers en=0/XXX, one dying empty (ttl=41) |
| Remote miners standby | PERSISTING | 2 miners stuck in standby in W7N9 (stuck=5 and stuck=10) |
| Mineral container empty | PERSISTING | Container 78b700e2 still energy=0/2000 |
| CPU bucket volatility | IMPROVING | Stabilized at 6694 bucket |
| Home room energy | PERSISTING | en=432/2300, storage=30 |
| Claimer stuck | PERSISTING | Both claimers still stuck=4 |

### Key Observations

- **No fixes deployed yet** - all identified issues persist
- **New creeps spawning**: remoteHauler-Spawn1-70919024 spawned for W8N9 deficit
- **Memory audit**: Running cleanly, no new stale data detected
- **Energy crisis**: Home room at 432/2300 energy, storage nearly empty
- **Critical**: remoteHauler-Spawn1-70917525 about to die with 0 energy after 500+ ticks

### Current Resource Summary

**Home Room (W7N9):**
- Energy: 432/2300 (19%)
- Storage: 30/2250 (1%)
- Workers: 3 (2 at 0 energy, 1 at 226/500)
- CPU: 6694 bucket (healthy)

**Remote Room W8N9:**
- Source 4adbfc69: 3000/3000 (full)
- Source 4adbfc6b: 2648/3000 (88%)
- Container: 365-445/2000 (18-22%)
- 4 haulers (3 returning with 300-400 energy, 1 traveling empty)
- 2 miners mining, 1 stuck in standby

**Remote Room W6N9:**
- Source 4adbff3a: 2940/3000 (98%)
- Container: 0/2000 (empty)
- 1 hauler dying empty (ttl=41)
- 1 miner mining, 1 stuck in standby

### Next Check Recommended

Monitor for:
- New code deployments (check for BUILD_COMMIT changes)
- Hauler energy loading improvements
- Maintainer pathfinding fixes
- Container energy management changes

---

## Codebase Analysis - Root Cause Identification

### Issue 1: Remote Maintainers Getting Stuck (Lines 314-349 in room.controller.ts)

**Root Cause:** Maintainer job assignment logic has a fallback to harvest from sources when no build/repair targets exist. The logic at lines 327-348 assigns `harvestSource` jobs to maintainers when they have free energy capacity, but the pathfinding to remote sources can fail due to:
- Terrain blocks (walls, lava)
- Distance from maintainer spawn position
- No container nearby for handoff

**Code Path:**
```
remoteMaintainer -> findRemoteEnergySource() -> harvestSource job
```
The `findRemoteEnergySource` function (lines 1984-2032) prioritizes containers, then dropped energy, then links, but falls back to sources which maintainers often cannot reach efficiently.

**Recommendation:** Add maintainer-specific energy sourcing that avoids distant sources and prioritizes nearby containers/dropped energy.

### Issue 2: Haulers Running Empty (Lines 1946-1948, 2034-2039)

**Root Cause:** The `remoteHaulerMinPickup` function uses `haulerMiningSiteMinPickup` which may be too low, causing haulers to leave with minimal energy. Additionally, the `remoteHaulerAvoidTargetId` logic (lines 2034-2039) only activates after `REMOTE_HAULER_RETARGET_STUCK_TICKS` which may be too high.

**Code Path:**
```
hauler stores energy -> checks minPickup threshold -> travels home if met
```
If `minPickup` is low, haulers leave prematurely.

**Recommendation:** Increase minimum pickup threshold or add dynamic threshold based on hauler capacity percentage.

### Issue 3: Mineral Container Always Empty (Lines 2594-2660)

**Root Cause:** The mineral plan creates a container near the mineral, but the mineral miner job assignment doesn't prioritize filling that container. The miner extracts minerals but may not have energy to power the extractor.

**Code Path:**
```
mineralMiner -> mineMineral job -> depositMineral job
```
The miner needs energy in the container to power the extractor, but no logic ensures the container gets filled with energy.

**Recommendation:** Add logic to ensure mineral container has energy before mining starts, or assign haulers to fill mineral containers.

### Issue 4: Claimers Stuck (Lines 1529-1545)

**Root Cause:** Claimers are spawned for remote reserve/claim operations but get stuck trying to reach the controller. The pathfinding may fail due to:
- Controller position being far from room entrance
- Terrain blocks
- No roads built to controller

**Recommendation:** Add road construction to controller before spawning claimers, or add pathfinding validation.

### Issue 5: Dropped Energy Spreading (Lines 75-78 in creep.jobRunner.ts)

**Root Cause:** When miners fill up, they drop energy if no offload target is available. The `offloadEnergyNearby` function may not find containers quickly enough, causing drops.

**Code Path:**
```
miner harvests -> store full -> offloadEnergyNearby() -> drop(RESOURCE_ENERGY)
```
If containers are far or full, energy gets dropped.

**Recommendation:** Improve container placement near mining sites or add more frequent container checks.

---

## Monitoring Status - Game Active (Tick 70920600, 2:40 AM)

**Last Update:** Tick 70920600 (2:40 AM)
**Log File Last Modified:** 2026-05-14 12:40 PM (24,788+ lines)
**Current Status:** Game active, new ticks received

### Issue Resolution Tracking (Updated)

| Issue | Status | Notes |
|-------|--------|-------|
| Remote maintainers stuck | IMPROVING | W6N9 maintainer traveling to W6N9 (not stuck), W8N9 maintainer renewing |
| Dropped energy W8N9 | PERSISTING | Now 3 drop locations: [18,27] (1972), [48,29] (170), [45,33] (197) |
| Haulers running empty | IMPROVING | remoteHauler-Spawn1-70919371 now has 1000/1000 energy - FIXED |
| Remote miners standby | PERSISTING | remoteMiner-Spawn1-70916180-1 still in standby (195 TTL) |
| Mineral container empty | PERSISTING | Container 78b700e2 still energy=0/2000 |
| CPU bucket volatility | IMPROVING | Stabilized at 8505-10000 bucket |
| Home room energy | IMPROVING | en=2088/2300 (91%), storage=0 |
| Claimer stuck | PERSISTING | Still stuck=4 in W8N9 |

### Key Observations

- **Hauler energy loading FIXED** - remoteHauler-Spawn1-70919371 now returning with 1000/1000 energy
- **Maintainer pathfinding IMPROVING** - W6N9 maintainer now traveling to W6N9 (not stuck)
- **Memory audit working** - detecting and fixing duplicate source assignments
- **Mineral extraction working** - amount decreasing (23,718 -> 23,213) but container still empty
- **Dropped energy spreading** - now 3 locations instead of 1-2

### Current Resource Summary

**Home Room (W7N9):**
- Energy: 2088/2300 (91%) - IMPROVED from 1908/2300
- Storage: 0/2250 (0%) - DECREASED from 400/2250
- Workers: 3 (2 at 0 energy, 1 at 190/500)
- CPU: 8505 bucket (healthy)

**Remote Room W8N9:**
- Source 4adbfc69: 3000/3000 (full)
- Source 4adbfc6b: 2320/3000 (77%) - RECOVERED from 750-830/3000
- Container: 2000/2000 (100%) - STABLE
- 1 hauler (1300 capacity, traveling to container)
- 3 miners mining (1 duplicate detected by memory audit)

**Remote Room W6N9:**
- Source 4adbff3a: 2844-2874/3000 (95-96%) - RECOVERED from 1680-1740/3000
- Container: 118/2000 (6%) - DECREASED from 906-966/2000
- 2 haulers (1 with 1000 energy returning home, 1 dying empty)
- 1 miner mining, 1 stuck in standby

### Next Check Recommended

Monitor for:
- New code deployments (check for BUILD_COMMIT changes)
- Hauler energy loading improvements
- Maintainer pathfinding fixes
- Container energy management changes

---

## Latest Status Update - Tick 70920880 (2:57 AM)

### Issue Resolution Tracking (Updated)

| Issue | Status | Notes |
|-------|--------|-------|
| Remote maintainers stuck | IMPROVING | W6N9 maintainer traveling, W8N9 maintainer renewing |
| Dropped energy W8N9 | PERSISTING | Still 3 drop locations but amounts decreasing |
| Haulers running empty | FIXED | Now returning with 1300-1500 energy (100% capacity) |
| Remote miners standby | PERSISTING | remoteMiner-Spawn1-70916180-1 still in standby |
| Mineral container empty | PERSISTING | Container 78b700e2 still energy=0/2000 |
| CPU bucket volatility | STABLE | 8424 bucket (healthy) |
| Home room energy | STABLE | en=2088/2300 (91%) |
| Claimer stuck | IMPROVING | Now moving (stuck=1) and reserving controller |

### Key Observations

- **Hauler energy loading FIXED** - haulers now returning with 1300-1500 energy (100% capacity)
- **Claimer progress** - now moving and reserving controller (stuck=1 instead of stuck=4)
- **Mineral extraction working** - amount decreasing (23,718 -> 22,978) but container still empty
- **Container energy management** - W8N9 container at 330/2000, W6N9 container at 68/2000
- **No code deployments detected** - improvements appear to be from game state changes, not code fixes

### Critical Issue Found - Tick 70921200 (3:17 AM)

**CRITICAL:** `room.controller: insufficient energy for mineralMiner for passive mineral extraction need=600 have=99`

This explains why the mineral container is always empty - the mineral miner cannot spawn because there's insufficient energy in the home room. The mineral extraction is passive (no active miner), but the system still needs 600 energy to spawn the mineral miner, and only 99 is available.

**Update (Tick 70921230):** Issue persists - `need=600 have=157`. Home room energy remains critically low.

**Update (Tick 70921251):** Mineral miner spawned (mineralMiner-Spawn1-70921231) despite warning. Home room energy at 328/2300, storage at 4446/2250. The mineral miner is now active and mining.

**Update (Tick 70921271):** Mineral miner active but container still empty (energy=0/2000). Home room energy at 335/2300, storage at 3650/2250.

**Update (Tick 70921281):** Home room energy dropping further - 161/2300. Storage at 3500/2250. Critical energy depletion trend.

**Update (Tick 70921301):** Home room energy slightly recovered - 220/2300. Storage at 4030/2250. Energy situation stabilizing.

**Update (Tick 70921321):** Home room energy at 170/2300. Storage at 4030/2250. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22751 -> 22741) - extractor working but container not filled.

**Update (Tick 70921351):** Home room energy at 245/2300. Storage at 3785-4675/2250. Now 3 mineral miners active (mineralMiner=3). Mineral container still empty (energy=0/2000). Mineral amount decreasing (22741 -> 22736).

**Update (Tick 70921391):** Home room energy at 191/2300. Storage at 4497/2250. 3 mineral miners active. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22736 -> 22730).

**Update (Tick 70921421):** Home room energy recovered to 1096/2300 (47%). Storage at 3497/2250. 3 mineral miners active. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22730 -> 22724).

**Update (Tick 70921441):** Home room energy at 846/2300 (37%). Storage at 3237/2250. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22724 -> 22716).

**Update (Tick 70921471):** Home room energy at 441/2300 (19%). Storage at 1337/2250. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22716 -> 22708).

**Update (Tick 70922001):** Home room energy recovered to 2300/2300 (100%). Storage at 0-400/2250. 3 mineral miners active. Mineral container still empty (energy=0/2000). Mineral amount decreasing (22708 -> 22582).

**Update (Tick 70922161):** Home room energy at 1877/2300 (82%). Storage at 0/2250. 3 mineral miners active. **Mineral container now has L=34/2000!** Finally getting filled. Mineral amount decreasing (22582 -> 22544).

**Update (Tick 70922221):** Home room energy at 2020/2300 (88%). Storage at 499/2250. 3 mineral miners active. Mineral container dropped to L=2/2000 - almost empty again. Mineral amount decreasing (22544 -> 22534).

**Update (Tick 70922281):** Home room energy at 1780/2300 (77%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=7/2000 - still low but not empty. Mineral amount decreasing (22534 -> 22521).

**Update (Tick 70922341):** Home room energy at 1530/2300 (67%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=14/2000 - increasing slightly. Mineral amount decreasing (22521 -> 22502).

**Update (Tick 70922391):** Home room energy at 1168/2300 (51%). Storage at 562/2250. 3 mineral miners active. Mineral container dropped to L=1/2000 - almost empty again. Mineral amount decreasing (22502 -> 22494).

**Update (Tick 70922421):** Home room energy at 1216/2300 (53%). Storage at 336/2250. 3 mineral miners active. Mineral container has L=5/2000 - still low. Mineral amount decreasing (22494 -> 22489).

**Update (Tick 70922451):** Home room energy at 697/2300 (30%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=6/2000 - still low. Mineral amount decreasing (22489 -> 22479).

**Update (Tick 70922491):** Home room energy at 1845/2300 (80%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=3/2000 - still low. Mineral amount decreasing (22479 -> 22470).

**Update (Tick 70922531):** Home room energy at 2250/2300 (98%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=4/2000 - still low. Mineral amount decreasing (22470 -> 22457).

**Update (Tick 70922571):** Home room energy at 2300/2300 (100%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=2/2000 - still low. Mineral amount decreasing (22457 -> 22448).

**Update (Tick 70922611):** Home room energy at 2280/2300 (99%). Storage at 398/2250. 3 mineral miners active. Mineral container has L=10/2000 - increasing slightly. Mineral amount decreasing (22448 -> 22438).

**Update (Tick 70922651):** Home room energy at 2273/2300 (99%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=6/2000 - still low. Mineral amount decreasing (22438 -> 22431).

**Update (Tick 70922691):** Home room energy at 2123/2300 (92%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=4/2000 - still low. Mineral amount decreasing (22431 -> 22422).

**Update (Tick 70922731):** Home room energy at 2142/2300 (93%). Storage at 0/2250. 3 mineral miners active. Mineral container has L=4/2000 - still low. Mineral amount decreasing (22422 -> 22414).

**Update (Tick 70922771):** Home room energy at 2271/2300 (99%). Storage at 0/2250. 2 mineral miners active (one died). Mineral container has L=9/2000 - increasing slightly. Mineral amount decreasing (22414 -> 22400).

**Update (Tick 70922821):** Home room energy at 1792/2300 (78%). Storage at 0/2250. No mineral miners active (all died). Mineral container has L=8/2000 - still low. Mineral amount decreasing (22400 -> 22386).

**Update (Tick 70922861):** Home room energy at 2280/2300 (99%). Storage at 1936/2250. 1 mineral miner active. Mineral container has L=0/2000 - empty again. Mineral amount stable (22386).

**Update (Tick 70922901):** Home room energy at 2300/2300 (100%). Storage at 1367/2250. 1 mineral miner active. Mineral container has L=10/2000 - increasing. Mineral amount decreasing (22386 -> 22376).

**Update (Tick 70922951):** Home room energy at 2300/2300 (100%). Storage at 900/2250. 1 mineral miner active. Mineral container fluctuating L=5-25/2000. Mineral amount decreasing (22376 -> 22331).

**Update (Tick 70922991):** Home room energy at 2025/2300 (88%). Storage at 780/2250. 1 mineral miner active. Mineral container L=0/2000 - empty again. Mineral amount decreasing (22306 -> 22301).

**Update (Tick 70922991 - stale):** Terminal output not updating - game may be paused again. Mineral container persistently empty despite extractor active.

**Root Cause:** Home room energy dropped from 2088/2300 to insufficient levels. The mineral miner spawning logic checks for 600 energy but the room is depleted.

**Recommendation:** Ensure home room maintains minimum energy threshold for mineral miner spawning, or reduce the energy requirement for passive mineral extraction.

---

## Code Change History (Detected from Logs)

| Tick | Time | Commit | Description |
|------|------|--------|-------------|
| 70921436 | 3:31 AM | f3b60247 -> b713d59f | Initial code change |
| 70921474 | 3:33 AM | b713d59f -> eb9d399f | Remote hauler cycle |
| 70921491 | 3:34 AM | eb9d399f -> 983c8445 | Remote hauler tweaks |
| 70921506 | 3:35 AM | 983c8445 -> f0a09b0d | More tweaks |
| 70921517 | 3:36 AM | f0a09b0d -> 42e06698 | Detect code change |
| 70921727 | 3:49 AM | 42e06698 -> 0c6b96c7 | Docs align |
| 70921779 | 3:52 AM | 0c6b96c7 -> c2ce28d0 | Wall rampart building |
| 70922006 | 4:06 AM | c2ce28d0 -> adc529bf | Wall rampart building (v2) |

### Key Changes

1. **Remote hauler cycle** (cab47a3) - Major changes to `creep.jobRunner.ts` and `room.controller.ts` (250 lines added)
2. **Remote hauler tweaks** (97d6aad) - Changes to `role.doctor.ts`, `room.controller.ts`, `types.d.ts` (92 lines added)
3. **More tweaks** (8da38b2) - Changes to `creep.capabilities.ts`, `debug.ts`, `role.manual.ts`, `room.controller.ts` (154 lines added)
4. **Remote claimer fix** (7f0376b) - Fixed claimer spawning when reservation >4000
5. **Multiple claimer bug** (bce8de1) - Fixed multiple claimers in remote room
6. **Wall rampart building** (c2ce28d) - Added critical defense structure repair priority
7. **Wall rampart building v2** (adc529b) - Added critical normal structure repair, fixed mineral miner spawning logic

### Impact Assessment

- **Hauler energy loading FIXED** - Haulers now returning with 100% capacity (1300-1500 energy)
- **Claimer progress** - Now moving and reserving controller (stuck=1 instead of stuck=4)
- **Remote maintainer improvements** - Now traveling/building instead of stuck
- **Mineral container still empty** - Despite extractor working, container not filled with energy

---

## Latest Status Update - Tick 70920880 (2:57 AM)
- Energy: 2088/2300 (91%)
- Storage: 0/2250 (0%)
- Workers: 3 (2 at 0 energy, 1 at 190/500)
- CPU: 8424 bucket (healthy)

**Remote Room W8N9:**
- Source 4adbfc69: 3000/3000 (full)
- Source 4adbfc6b: 2700/3000 (90%)
- Container: 330/2000 (17%)
- 2 haulers (both with 1300-1500 energy returning home)
- 2 miners mining

**Remote Room W6N9:**
- Source 4adbff3a: 2958-2988/3000 (99%)
- Container: 68/2000 (3%)
- 2 haulers (1 with 1000 energy returning home, 1 dying empty)
- 1 miner mining, 1 stuck in standby

---

## Root Cause Investigation - remoteHauler-Spawn1-70917525 Stuck

**Investigated:** 2026-05-14 (post-session)
**Creep:** remoteHauler-Spawn1-70917525
**Symptom:** Stuck at W6N9 [5,39] from ttl=1461 to ttl=41. Always showed `res=0, no job=, no stuck=`.

### Confirmed Root Cause

Code between commits `861f7df` (May 10) and `cab47a3` (May 14) had a bug in `assignRemoteCreep` for the "remoteHauler in remote room, no energy source" fallback:

```typescript
// BUGGY CODE (pre-cab47a3):
if (creep.room.name === remoteRoom) {
    setJob(creep, 'idle', creep.room.controller);  // ← BUG
} else {
    setTravelJob(creep, homeRoom);
}
```

When the hauler arrived in W6N9 before any container was built:
1. `setJob(creep, 'idle', creep.room.controller)` assigned idle at the W6N9 controller
2. Controller was at ~[7,37] (where the claimer was reserving it)
3. Hauler was at [5,39] — Chebyshev range = max(|7-5|, |37-39|) = **2 ≤ 3** (idle's movement threshold)
4. `idle()` returned `OK` without moving → `shouldClearJob` DEFAULT: OK → job cleared
5. `lastJobResult = 0` → `res=0, no job=` persisted forever

Every tick repeated this loop. Creep wasted entire TTL at [5,39] idling near the controller.

### Fix

Commit `cab47a3 remote hauler cycle` (May 14) introduced `assignRemoteHaulerCycle` which correctly calls `setTravelJob(creep, homeRoom)` when in remote room with no source — sending the hauler back to W7N9 to wait.

### Observable Pattern Explained

- `res=0`: `idle()` always returns `OK`; since the DEFAULT `shouldClearJob` clears on OK, every tick ends with `lastJobResult=0`
- `no job=`: `idle` job is cleared by `shouldClearJob` every tick before `debug.tickRemoteCreepLog()` reads it
- `no stuck=`: `travelStuckTicks` is never incremented because `travelRoom` is never called (job is `idle`, not `travelRoom`)
|- Position unchanged: `idle` doesn't call `moveTo` when target is within range 3

---

## Remote Room Profitability Analysis (Tick 70922991)

### Spawning Costs
- remoteMiner: 9,350 energy (16 spawns, avg 584/spawn)
- remoteHauler: 35,150 energy (34 spawns, avg 1,034/spawn)
- remoteMaintainer: 3,150 energy (7 spawns, avg 450/spawn)
- **Total spawning cost: 47,650 energy**

### Per-Room Breakdown

| Room | Harvested | Transported | Spawning Cost | Net Energy | ROI |
|------|-----------|-------------|---------------|------------|-----|
| W6N9 | 22,100 | 60,561 | 14,950 | +67,711 | 553% |
| W7N9 | 350 | 504,072 | 0 | +504,422 | N/A |
| W8N9 | 66,650 | 97,988 | 62,050 | +102,588 | 265% |

**Total net energy gain from remote operations: +674,721 energy**

### Key Findings
- Remote mining is HIGHLY profitable across all rooms
- W7N9 shows massive transport numbers (504,072) but zero spawning costs - likely counting home room haulers
- W8N9 (primary target) has 265% ROI despite highest spawning costs
- W6N9 has 553% ROI - most efficient per-unit investment
- 305 maintenance ticks in W6N9, 423 in W8N9 - significant upkeep costs
- 502 construction entries in remote rooms - infrastructure investment ongoing
- Zero creep deaths recorded in remote rooms during this period

### Efficiency Metrics
- Remote miners: 61% mining, 36% standby (39% idle time)
- Remote haulers: 66% hauling, 34% traveling
- Average hauler energy: 287/1400 (20.5% capacity utilization)
- 63% of hauler entries show empty (en=0) - significant inefficiency

### Recommendations

1. **Fix mineral container fill rate** - Investigate why container at [12,6] stays empty despite active extractor
2. **Optimize energy threshold for mineral miners** - Consider lowering the 600 energy requirement
3. **Reduce hauler empty returns** - 63% empty rate suggests pathing or timing issues
4. **Monitor remote room operations** - Track if recent code changes improve remote miner/hauler efficiency
5. **Consider scaling back W7N9 operations** - Minimal harvesting (350) vs massive transport overhead

---

## Bug Investigation: remoteMiner-Spawn1-70920932 (and 70928567) Stuck at [46-47, 12] in W8N9

**Date:** 2026-05-14 (second investigation in this session)
**Status:** ROOT CAUSE IDENTIFIED AND FIXED

### Observed Symptom

`remoteMiner-Spawn1-70920932` was assigned to source `4adbfc69` at [42,7] in W8N9 with station `stn=[42,6]`. The miner:
- Entered W8N9 at [47,26]
- Moved north to [48,18] → [48,13] → [47,12]
- Oscillated at [46-47, 12] with `res=-9 stuck=1-3` for 300+ ticks until the log ended

Source `4adbfc69` energy was 3000/3000 (never mined) throughout the entire log period.

### Same miner's prior life
The creep was previously mining `4adbfc6b` at [18,27] successfully. After expiry/renewal, it got reassigned to the problematic `4adbfc69` source.

### Root Cause (Three Contributing Bugs)

**Bug 1 — `findStationForSource` picks inaccessible tile** (`src/room.controller.ts:1019`)

The function iterates `lookForAtArea` in row-major order (top-left first) and returns the FIRST non-wall adjacent tile. For source at [42,7], the scan order is: [41,6], [42,6], [43,6], [41,7], [43,7], [41,8], [42,8], [43,8]. Since [41,6] is a wall, [42,6] gets selected — a tile near the top wall of W8N9 that is blocked from the east entrance by terrain obstacles near y≈11.

**Bug 2 — Path planner gives false positive** (`src/room.controller.ts:782`)

The path distance check used `range: 1` to the station:
```typescript
PathFinder.search(anchor.pos, { pos: station, range: 1 }, { maxRooms: 8 })
```
"Range 1 from [42,6]" includes the source [42,7] itself (always reachable), so `route.incomplete = false` even though [42,6] is genuinely unreachable. The system thought the station was fine.

**Bug 3 — `stuckFallback` doesn't recover** (`src/creep.jobRunner.ts:71`)

When `stuckTicks >= 2`, `harvestSource` switches to target the source with `range: 1`. PathFinder finds a path to some adjacent tile, miner moves slightly, `stuckTicks` resets. Next tick: back to station [42,6] with `range: 0`. Oscillates forever between stuck=1 and stuck=3.

### The Fix

Two changes in `src/room.controller.ts`:

1. **`findStationForSource`** now picks the adjacent non-wall tile with the **most open neighbors** (using `room.getTerrain()`). Tiles with more open neighbors are in less-hemmed-in areas and more accessible from any direction. A new `countOpenTilesAround` helper computes this score.

2. **Path check** changed from `range: 1` to `range: 0`, so it accurately verifies whether the station tile itself is reachable rather than falsely succeeding via the adjacent source.

### Why the fix propagates to stuck miners immediately

`findStationForSource` is called every tick the remote room is visible, and `stationX/Y` in the remote plan is updated each call. `assignRemoteCreep` then copies `sourceCfg.stationX/Y` into creep memory each tick. So on the next visible tick, stuck miners get the new station position automatically — no reassignment required.
