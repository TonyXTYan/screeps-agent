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

### Home Economy Gates (block remote spawns)
- Stored < 2k: only scouts + emergency miners + degraded-route maintainers
- Stored < 5k: limited to first enabled harvest remote
- Local spawn pending: remote spawns skipped entirely

### Current Remote Rooms
- W6N9 (active mining, route=ok)
- W8N9 (active mining, route=degraded, stalls=1)

---

## Monitoring Round 1 (Tick ~70974300-70974690, ~10 min)

### W6N9 Remote Room — Creep Status
| Creep | Role | TTL | Status | Position |
|-------|------|-----|--------|----------|
| remoteMiner-Spawn1-70973881-2 | Miner (W5) | 705-1105 | mining | [37,37] |
| remoteHauler-Spawn1-70961032 | Hauler (1100C) | 1144 | hauling | W6N9 |
| remoteHauler-Spawn1-70961214 | Hauler (800C) | 1108-1398 | traveling/renewing | W7N9/W6N9 |
| remoteMaintainer-Spawn1-70961299 | Maintainer | 196-406 | maintaining/repairing | W6N9 |

**Allocation:** 1 miner / 2 haulers (1900C capacity) — route=ok, distance=63

### W6N9 Container Energy Levels (tracked over time)
| Time | Container Energy | Source Energy | Regen Timer |
|------|-----------------|---------------|-------------|
| T+0s | 550/2000 | 1190/1500 | 29 |
| T+30s | 300/2000 | 1090/1500 | 140 |
| T+60s | 400/2000 | 990/1500 | 129 |
| T+90s | 500/2000 | 890/1500 | 119 |
| T+120s | 700/2000 | 690/1500 | 109 |
| T+150s | 800/2000 | 590/1500 | 99 |
| T+180s | 900/2000 | 490/1500 | 89 |
| T+210s | 1000/2000 | 390/1500 | 79 |
| T+240s | 1100/2000 | 290/1500 | 69 |
| T+270s | 1200/2000 | 190/1500 | 59 |
| T+300s | 300/2000 | 0/1500 | 49 |
| T+330s | 200/2000 | 0/1500 | 39 |
| T+360s | 100/2000 | 0/1500 | 29 |
| T+390s | 0/2000 | 0/1500 | 19 |
| T+420s | 0/2000 | 0/1500 | 9 |
| T+450s | 0/2000 | 1490/1500 | 299 (regenerated) |
| T+480s | 100/2000 | 1390/1500 | 289 |
| T+510s | 200/2000 | 1290/1500 | 279 |
| T+540s | 300/2000 | 1190/1500 | 269 |
| T+570s | 500/2000 | 990/1500 | 249 |
| T+600s | 600/2000 | 890/1500 | 239 |
| T+630s | 700/2000 | 790/1500 | 229 |

### Home Room W7N9 Energy Storage
- **Spawn energy:** 2220-2280/2300 (consistently near full)
- **Storage:** 0 (no dedicated energy storage structure)
- **Terminal:** 340 energy
- **Containers:** 0+0+17 (one container with 17 energy)
- **Recovery mode:** No (home not in recovery)

### Key Metrics Derived
**Harvest Rate:**
- ~2 energy/tick (100 energy per 30s snapshot) from W5 miner
- Source depletion: ~100 energy per 30s when active
- Source regen time: ~150 ticks (from 0 to 1490)

**Container Fill Rate:**
- Fill rate: ~100 energy/30s when source available
- Time to fill 0→1200: ~4.5 minutes (270 ticks)
- Time to empty 1200→0: ~2 minutes (120 ticks) via hauler pickup

**Hauler Cycle Time (estimated):**
- W6N9 container → W7N9 deposit → return: ~150-200 ticks
- Hauler carries 800-1100 energy per trip
- Two haulers provide ~1900C total capacity

**Energy Throughput (W6N9):**
- Net deposit to home per cycle: ~1200 energy (when container fills to ~1200)
- Cycle time (fill + empty + regen): ~7-8 minutes
- Estimated throughput: ~150-170 energy/minute to home room

### Issues and Bottlenecks Observed
**CRITICAL — Hauler Stuck:**
- remoteHauler-Spawn1-70967397-1 showed `stuck=143` ticks at W7N9 while traveling to deposit energy

**ROUTE DEGRADATION — W8N9:**
- Route status: `ok/degraded` with `stalls=1`
- Error: `force-clearing station for re-route (failure #1) source=4adbfc69 blocked at W8N9:40,5`
- This affected W8N9 harvesting, not W6N9 directly

**W6N9 Route:**
- Remained `route=ok` throughout monitoring — no degradation

**MINER INEFFICIENCY:**
- Miner sits idle at container when source depleted (0→1490 regen takes ~150 ticks)
- During source depletion, miner wastes ~150 ticks waiting

**CONTAINER HP:**
- W6N9 container HP: 212700/250000 → dropped to 220300 during monitoring
- W8N9 containers: 121600/250000 and 120800/250000 (significantly damaged)
- Container repair active but slow

**W8N9 Over-allocation:**
- Source 4adbfc69: `miners=2/1!` (2 miners assigned, only 1 needed)

### Summary
W6N9 remote harvesting is functioning but with notable inefficiency:
- **Effective throughput:** ~150-170 energy/minute to home room
- **Bottleneck:** Hauler cycle time is the limiting factor, not mining speed
- **Idle time:** Miner wastes ~150 ticks per cycle waiting for source regen
- **Route health:** W6N9 route stable, W8N9 showing degradation
- **Home storage:** No dedicated storage, relying on spawn energy (near capacity at 2280/2300)

---
