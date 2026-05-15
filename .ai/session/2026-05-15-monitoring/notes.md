# Screeps Monitoring - Fresh Start (Tick 70932941)

**Date:** 2026-05-15 | **Current Tick:** 70932941 | **Last Commit:** c080a728 (remote miner fix v6)

---

## Current State Summary (Tick 70948431)

### Home Room (W7N9)
- Energy: 2256/2300 (98%)
- Storage: 0/2250 (EMPTY - triggers home recovery gate)
- Links: 400+96+0
- Creeps: 12 total (2 defender, 1 doctor, 2 hauler, 2 miner, 1 mineralMiner, 4 worker)

### Remote Rooms
- **W8N9 4adbfc69**: miners=1/1 (TTL=51 dying), haulers=0/1140 (BLOCKED), container=2000/2000, source=0/1500
- **W8N9 4adbfc6b**: miners=1/1 (TTL=616), haulers=2/876, container=2000/2000, source=500/1500
- **W6N9 4adbff3a**: miners=1/1 (TTL=866), haulers=2/756, container=12/2000, source=0/1500

### Critical Issues
1. **Home recovery gate blocking ALL remote spawns**: storage=0 triggers `stored<2000` gate
   - Blocks: remoteMiner, remoteHauler, remoteMaintainer, claimer for W8N9 and W6N9
   - Despite energy=2256/2300, storage is empty → vicious cycle
2. **W8N9 4adbfc69 hauler deficit**: projected=0/1140 - no haulers delivering
3. **W6N9 maintainer mining instead of maintaining**: job=harvestSource (bug?)
4. **W6N9 hauler stuck**: renewing with stuck=1
5. **Dropped resources**: 1826 energy at [19,27], 401 at [42,6] (W8N9)
6. **W6N9 container nearly empty**: 12/2000 energy

### Remote Room W8N9
- Not visible in current output (may be out of sight range)

### Remote Room W6N9
- Source 4adbff3a: miners=0/1 (no active miner!), route=ok, not visible
- 2 haulers traveling empty back home (en=0/400, en=0/300)
- Container 6817bea0: not visible

---

## Critical Finding: Home Recovery Gate Vicious Cycle

The home recovery gate (v9) checks `stored<2000` to block remote spawns. However:
- Home storage=0 (empty) → gate always active
- Gate blocks ALL remote spawns: remoteMiner, remoteHauler, remoteMaintainer, claimer
- No remote haulers = no energy delivery to storage
- Storage stays empty = gate stays active
- **Vicious cycle**: Storage can never recover because haulers are blocked

### Root Cause
The gate checks storage capacity, not spawn energy. Home has 2256/2300 energy but storage=0.
The gate should check spawn/extension energy levels, not storage contents.

### Impact
- W8N9 4adbfc69: haulers=0/1140 (BLOCKED) - no energy delivery
- W8N9 4adbfc6b: haulers=2/876 (working but can't renew)
- W6N9 4adbff3a: haulers=2/756 (working but can't renew)
- All remote maintainers blocked for W8N9
- All remote miners blocked for standby replacement

### Secondary Issues
1. W6N9 maintainer mining instead of maintaining (job=harvestSource bug?)
2. W6N9 hauler stuck renewing (stuck=1)
3. Dropped resources: 1826 energy at [19,27], 401 at [42,6] in W8N9
4. W6N9 container nearly empty (12/2000)
4. **CPU healthy** - Bucket 4949-6447, ~500 per tick

### Concerns
1. **W6N9 miner missing** - Shows miners=0/1, no active miner despite route=ok
2. **W8N9 not visible** - May be out of sight range or no activity
3. **Mineral container persistently empty** - L=0/2000 despite active mineral miner and extractor
4. **Haulers returning empty** - Multiple haulers en=0 traveling back home
5. **Mineral amount decreasing** - 12549 (down ~44% from session start)

### Issues Resolved
- Remote miner stuck bug: FIXED (routeAccessible detection working)
- Hauler energy loading: FIXED (100% capacity returns earlier)
- Standby miner handoff: FIXED (replacements spawning correctly)

### Code Changes Deployed (Session)
| Tick | Commit | Description |
|------|--------|-------------|
| 70929835 | 277ad41f | Remote miner stuck bug (routeAccessible) |
| 70929969 | fb903545 | Fix hauler mineral container threshold |
| 70930402 | 482336fa | Fix inaccessible remote source blocking |
| 70930855 | dd3e2f7a | Remote miner fix 3 (station path) |
| 70931641 | 2b1d3db4 | Remote miner fix v4 (non-winding path) |
| 70932095 | 1138e419 | Remote miner fix v5 (standby, stuck recovery) |
| 70932626 | c080a728 | Remote miner fix v6 (station validation) |
| 70936868 | 12f67739 | Remote miner fix v7 (force repath for station moves) |
| 70937086 | 4a9944f9 | Terminal Energy Reserve Policy (RCL6=5k, RCL7=10k, RCL8=50k) |
| 70939216 | 2e96d813 | Remote mining fix v9 (home economy gates, spawn throttling, min body rules) |
| 70948431 | - | CRITICAL: Home recovery gate blocking ALL remote spawns (storage=0) |
| 70948431 | - | GAME PAUSED: Tick stuck at 70948430, console showing cached data |

---

## Monitoring Log

| Tick | Energy | Storage | Mineral L | Mineral Amt | Notes |
|------|--------|---------|-----------|-------------|-------|
| 70932941 | 1758 | 0 | 25 | 15414 | Fresh check, doctor dying |
| 70943571 | 2300 | 0 | 5 | 7154 | Big tick jump, 7210 minerals extracted! |
| 70943761 | 1399 | 0 | 5 | 6994 | Steady extraction continuing |
| 70933521 | 1626 | 0 | 0 | Mineral miner spawned |
| 70933791 | 18 | 0 | 20 | Energy crisis |
| 70934161 | 326 | 150 | 35 | Energy recovering |
| 70936481 | 2300 | 0 | 40 | Energy full, mineral L rising |
| 70936531 | 1911 | 0 | 80 | Mineral L peak |
| 70936621 | 2300 | 0 | 0 | W6N9 miners=0/1, container empty |
| 70936871 | 2300 | 0 | 30 | v7 deployed (force repath), W6N9 still miners=0/1 |
| 70937091 | 50 | 0 | 25 | v8 deployed (terminal reserve), W8N9 both miners=1/1 |
| 70937511 | 927 | 0 | 15 | All remote sources miners=1/1, W6N9 haulers=2 (1200C) |
| 70948431 | 2256 | 0 | 30 | GAME PAUSED - home recovery gate blocking ALL remote spawns |
