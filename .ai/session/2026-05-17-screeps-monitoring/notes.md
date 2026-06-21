# Screeps Monitoring Session - 2026-05-17

**Start Tick:** 70992712 | **Start Time:** 1:49 PM AEST
**Previous Session:** 2026-05-14 (tick 70931161) - gap of ~61,551 ticks

## Baseline State (Tick 70992712)

### Home Room (W7N9)
| Metric | Value | Previous | Change |
|--------|-------|----------|--------|
| Energy | 1322/5100 | 839/2300 | +483 energy, cap doubled (extensions added?) |
| Storage | 20195 | 0 | +20195 (massive improvement) |
| Recovery | YES | - | Active |
| Creeps | 9 total | 9 total | Same |
| Terminal | 103891 | - | New data |
| Links | 749+800+799+693 | - | 4 links operational |
| Containers | 2000+0+2000 | - | 2 full, 1 empty |

### Mineral Status
| Metric | Value | Previous | Change |
|--------|-------|----------|--------|
| Amount | 0 | 16287 | DEPLETED - all minerals extracted |
| Type | L (Large) | L | Same |
| Extractor | yes | active | Same |
| Container L | 0/2000 | 2/2000 | Still empty |

### Remote Room W8N9
| Metric | Value | Previous | Change |
|--------|-------|----------|--------|
| Source 4adbfc69 | energy=830/3000 | - | Low energy |
| Container 5d43aa5a | 1610/2000 | - | Good |
| Source 4adbfc6b | energy=2840/3000 | - | High energy |
| Container 5712a230 | 460/2000 | - | Low |
| Dropped energy | 190 at [43,6] | ~2000 | Reduced significantly |
| Haulers | 4 active | 4 | Same |
| Maintainer | 1 building | 1 renewing | Now building |

### Remote Room W6N9
| Metric | Value | Previous | Change |
|--------|-------|----------|--------|
| Source 4adbff3a | energy=2770/3000 | - | High energy |
| Container 119f9ed3 | 100/2000 | - | Very low |
| Miner | mining | mining | Same |
| Haulers | 2 active | 2 | Same |
| Maintainer | traveling to W6N9 | building | Now traveling |

## Issues Carried Forward

1. **Mineral container persistently empty** - L=0/2000 despite active extractor. Minerals now fully depleted (amount=0).
2. **Dropped energy W8N9** - Reduced from ~2000 to 190, but still present.
3. **W6N9 container very low** - Only 100/2000 energy.
4. **Claimer died in W8N9** - claimer-Spawn2-70992100-1 died at [38,25] with stuck=4.

## Observations

- **Storage filled to 20195** - Major improvement from 0. Energy management has stabilized.
- **Energy cap doubled** (2300->5100) - Extensions have been built since last session.
- **Terminal has 103891 resources** - Significant resource accumulation.
- **Minerals depleted** - amount=0 means the Large mineral deposit is fully extracted.
- **Remote ops stable** - All sources covered, haulers active, routes ok.

## Monitoring Log

| Tick | Time | Home Energy | Storage | Mineral L | W8N9 Container | W6N9 Container | Links | Notes |
|------|------|-------------|---------|-----------|----------------|----------------|-------|-------|
| 70992712 | 1:49 PM | 1322/5100 | 20195 | 0/2000 | 1610/460 | 100/2000 | - | Baseline |
| 70992861 | 1:50 PM | 2673/5100 | 20469 | 0/2000 | 1510/400 | 1548/2000 | - | Energy +1351 |
| 70992891 | 1:51 PM | 2841/5100 | 19967 | 0/2000 | 1910/800 | 348/2000 | - | Energy climbing |
| 70993021 | 1:57 PM | 3580/5200 | 19329 | 0/2000 | 1480/1380 | 120/2000 | 180+649+690+693 | Recovery active |
| 70993170 | 2:16 PM | 4552/4700 | 21032 | 0/2000 | 1380/1230 | 1220/2000 | 140+130+0+200 | Recovery OFF, link 2 DEAD |
| 70993180 | 2:17 PM | 4552/4700 | 20932 | 0/2000 | 1480/1330 | 1320/2000 | 20+243+194+200 | Link 0 CRITICAL |
| 70993240 | 2:20 PM | 4567/4700 | 22461 | 0/2000 | 2000/1930 | 1920/2000 | 180+77+0+200 | Containers full, links dead |
| 70993810 | 2:55 PM | - | - | 0/2000 | - | - | - | Dropped energy crisis starts |
| 70993930 | 2:02 PM | 5000/5000 | 32984 | 0/2000 | - | - | 40+10+194 | Links critical |
| 70994560 | 5:40 PM | 4796/5500 | 81001 | 0/2000 | 2000/2000 | 2000/2000 | 40+0+618 | Storage jumped +48K |
| 70994600 | 5:42 PM | 4321/5500 | 80451 | 0/2000 | 2000/2000 | 2000/2000 | 220+213+618 | Links recovering |
| 70994650 | 5:46 PM | 4060/5500 | 80451 | 0/2000 | 2000/2000 | 2000/2000 | 280+639+618 | Links stabilizing |
| 70994700 | 5:49 PM | 3562/5500 | 80451 | 0/2000 | 2000/2000 | 2000/2000 | 780+639+618 | Links recovered |

## Key Observations (Tick 70992712-70992891, ~180 ticks)

### Positive Trends
- **Home energy recovering fast**: 1322 -> 2841 (+1519 in ~180 ticks, ~8.4 energy/tick net)
- **Storage stable**: ~20K range, healthy buffer
- **Terminal resources**: 103891 -> 158906 (+55K, mineral transfer?)
- **W8N9 containers filling**: Both sources being mined effectively
- **Credits**: 632M -> 640M (+8M in ~180 ticks)

### Concerns
1. **Maintainers stuck**: remoteMaintainer-Spawn2-70989745-1 stuck=2 at [42,31] in W7N9, remoteMaintainer-Spawn1-70989584 stuck=2 at [12,26] traveling to W8N9
2. **W6N9 container fluctuating wildly**: 100 -> 1548 -> 248 -> 348 (hauler withdrawal cycles)
3. **Mineral container still empty**: L=0/2000 despite amount=0 (minerals depleted anyway)
4. **No code changes detected**: No BUILD_COMMIT notifications
5. **CPU bucket draining**: 8944 -> 1100 (low efficiency or heavy computation)

### Stuck Creeps Summary
| Creep | Position | Stuck | Status |
|-------|----------|-------|--------|
| remoteMaintainer-Spawn2-70989745-1 | [42,31] W7N9 | stuck=2 | renewing, traveling to W7N9 |
| remoteMaintainer-Spawn1-70989584 | [12,26] W7N9 | stuck=2 | traveling to W8N9 |
| remoteMiner-Spawn1-70992248 | [37,37] W6N9 | stuck=1 | mining (minor) |

## Follow-up (Post 5f626790)

- Added focused post-deploy recommendations file:
  - `build-5f626790-followup-suggestions.md`
