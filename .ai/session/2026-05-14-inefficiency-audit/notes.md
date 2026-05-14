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
