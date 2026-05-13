# Online Verification + RCL/Remote Balance Audit (Detailed) — 2026-05-13

## Objective
Validate whether current economy, remote-mining, and defense-related calculations are mechanically correct across RCL bands, and identify unresolved behavioral gaps.

## Scope
Reviewed code:
- `src/room.controller.ts`
- `src/creep.capabilities.ts`
- `src/creep.populationControl.ts`
- `src/creep.roleBalance.ts`
- `src/tower.basics.ts`
- `src/role.doctor.ts`
- `src/main.ts`

Verified against official Screeps docs:
- https://docs.screeps.com/control.html
- https://docs.screeps.com/api/
- https://docs.screeps.com/creeps.html

## Constants And Mechanical Anchors

### Official constants used in this review
- `CARRY_CAPACITY = 50`
- `HARVEST_POWER = 2`
- `ENERGY_REGEN_TIME = 300`
- `SOURCE_ENERGY_NEUTRAL_CAPACITY = 1500`
- `SOURCE_ENERGY_CAPACITY = 3000`
- `SOURCE_ENERGY_KEEPER_CAPACITY = 4000`
- `CREEP_SPAWN_TIME = 3`
- Tower action constants (`TOWER_POWER_*`, `TOWER_ENERGY_COST`)

### Implementation constants and gates
- `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500` (`src/room.controller.ts:104`)
- `MAX_REMOTE_HAULERS_PER_SOURCE = 2` (`src/room.controller.ts:105`)
- `REMOTE_STANDBY_DISPATCH_TTL = 300` (`src/room.controller.ts:103`)
- `TOWER_RESERVE_RATIO = 0.7` (`src/room.controller.ts:77`)
- Tower heal/repair branch gate `energyRatio > 0.5` (`src/tower.basics.ts:48`)

## Cross-RCL Numeric Baseline

### RCL energy capacity and body outcomes
| RCL | Energy Cap | Remote Miner Body (static/container) | Miner WORK | Remote Hauler Body | Hauler Carry Capacity | Two-Hauler Total |
|---|---:|---|---:|---|---:|---:|
| 1 | 300 | 1W 1C 1M | 1 | 4C 2M 0W | 200 | 400 |
| 2 | 550 | 3W 1C 2M | 3 | 6C 3M 1W | 300 | 600 |
| 3 | 800 | 5W 1C 3M | 5 | 10C 5M 0W | 500 | 1000 |
| 4 | 1300 | 5W 1C 3M | 5 | 16C 8M 1W | 800 | 1600 |
| 5 | 1800 | 5W 1C 3M | 5 | 24C 12M 0W | 1200 | 2400 |
| 6 | 2300 | 5W 1C 3M | 5 | 30C 15M 0W | 1500 | 3000 |
| 7 | 5600 | 5W 1C 3M | 5 | 32C 16M 1W | 1600 | 3200 |
| 8 | 12900 | 5W 1C 3M | 5 | 32C 16M 1W | 1600 | 3200 |

Derived from current body planner behavior in:
- `src/creep.capabilities.ts:155-167` (hauler/remoteHauler)
- `src/creep.capabilities.ts:114-152` (remoteMiner candidates)

### Remote haul demand by source type
Using implemented formula (`src/room.controller.ts:556-557`):
`min(2500, ceil((source.energyCapacity / 300) * pathDistance * 2 * 1.2))`

| Source Type | Energy Capacity | Income (e/t) | Demand @dist=25 | @50 | @75 | @100 | @120 | @150 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Neutral | 1500 | 5.00 | 300 | 600 | 900 | 1200 | 1440 | 1800 |
| Reserved/Owned | 3000 | 10.00 | 600 | 1200 | 1800 | 2400 | 2500 | 2500 |
| Keeper | 4000 | 13.33 | 801 | 1601 | 2400 | 2500 | 2500 | 2500 |

## Formula And Logic Verification

### 1) Source work-demand formula
Code:
- `sourceWorkDemand = ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER)` (`src/room.controller.ts:2599-2600`)

Validation:
- Neutral (1500): `1500/300/2 = 2.5 -> 3`
- Reserved/Owned (3000): `3000/300/2 = 5`
- Keeper (4000): `4000/300/2 = 6.67 -> 7`

Verdict: mathematically correct.

### 2) Remote haul-demand formula
Code:
- `existing.haulerCapacityDemand = min(2500, ceil(income * distance * 2 * 1.2))` (`src/room.controller.ts:556-557`)

Interpretation:
- Income per tick times round-trip distance times safety buffer.
- Dimensionally coherent and directionally valid for route-length scaling.

Verdict: formula itself is correct.

### 3) Replacement horizon formula
Code:
- `horizon = oneWayDistance + spawnTime + 60` (`src/room.controller.ts:1914-1928`)

Why coherent:
- One-way travel to source, spawn lag (`parts * CREEP_SPAWN_TIME`), and additional buffer.

Verdict: reasonable conservative predictor for replacement timing.

### 4) Defense/economy ordering and gates
Code:
- Defender emergency spawn check before room economic spawn planning (`src/main.ts:96-99`, `src/creep.populationControl.ts:7-31`)
- Energy spending prioritizes refill before build/repair/upgrade (`src/room.controller.ts:1132-1153`)
- Tower refill reserve target: `<0.7` (`src/room.controller.ts:2136-2138`)
- Tower local repair/heal branch only when `>0.5` (`src/tower.basics.ts:48`)

Verdict: coherent prioritization model with conservative defense-energy reserve behavior.

## Unresolved Findings (Detailed)

### A) Doctor spawn threshold mismatch
Evidence:
- Spawn gate: `energyCapacityAvailable >= 450` (`src/room.controller.ts:1440-1442`)
- Doctor minimum body candidate cost is 500 (`src/creep.capabilities.ts:184-188`)

Effect:
- At 450 capacity, planner can request doctor but body planner returns `[]`, causing repeated waiting/pending churn.

Status: `Not Fixed`

### B) Local miner deficit is count-based, not work-based
Evidence:
- `sourceSpawnDeficit` checks `assignedMiners === 0`, not `assignedWork < demand` (`src/room.controller.ts:2603-2617`)

Effect:
- Rooms can remain under-mined in edge cases even when every source has “a miner”.

Status: `Not Fixed`

### C) Remote miner may stay under-demand
Evidence:
- Spawn condition for extra remote miner requires `(minerCount === 0 || minerProjectedWork === 0)` (`src/room.controller.ts:1530-1531`)

Effect:
- One underpowered active remote miner may persist without adding second active miner in many scenarios.

Status: `Not Fixed`

### D) Remote hauler hard cap bottleneck
Evidence:
- Cap at 2/source enforced (`src/room.controller.ts:1555-1557`)
- Demand cap can still reach 2500/source on long routes (`src/room.controller.ts:556-557`)

Quantitative effect:
- RCL4 two-hauler total is 1600 (below 2500 cap).
- RCL5 two-hauler total is 2400 (still below 2500 cap).

Status: `Not Fixed`

### E) Reserve claimer infeasible pre-RCL4
Evidence:
- Reserve mode enforces min 2 CLAIM parts (`src/room.controller.ts:1510-1518`)
- 2 CLAIM + 2 MOVE minimum cost is 1300, above RCL3 cap 800.

Effect:
- Reserve-mode remotes cannot be actually reserved until room capacity reaches at least 1300.

Status: `Not Fixed`

### F) Defender body scaling plateaus
Evidence:
- Defender body uses floored ratio scaling (`Math.floor`) in `balanceSpec` (`src/creep.roleBalance.ts:65-73`)

Effect:
- Multiple energy breakpoints produce identical bodies, leaving some budget unused.

Status: `Not Fixed`

### G) Remote hauler optional `+WORK` throughput penalty risk
Evidence:
- Planner appends `WORK` when budget allows (`src/creep.capabilities.ts:161-163`)

Mechanical implication:
- Loaded movement efficiency worsens versus pure transport body ratio on return legs.

Status: `Not Fixed`

### H) Per-source demand cap may understate extreme route needs
Evidence:
- Global cap of 2500/source (`src/room.controller.ts:104, 556-557`)

Effect:
- For very long or weak-infrastructure routes, model clips above-cap demand and can under-allocate transport.

Status: `Not Fixed`

## Recheck Status (2026-05-13)
- A Doctor 450 gate vs 500 minimum doctor body: `Not Fixed`
- B Local miner deficit count-based, not work-based: `Not Fixed`
- C Remote miner can stay under-demand: `Not Fixed`
- D Remote hauler cap bottleneck (2/source): `Not Fixed`
- E Reserve claimer infeasible pre-RCL4: `Not Fixed`
- F Defender scaling plateaus from floor rounding: `Not Fixed`
- G Remote hauler optional `+WORK` throughput risk: `Not Fixed`
- H Per-source demand cap 2500 underestimation risk on long routes: `Not Fixed`

## Summary
- Mathematical foundations are mostly correct.
- Cross-RCL viability is generally good, especially from RCL5 upward.
- The main remaining issues are threshold/cap-policy edge cases and early-RCL/long-route remote throughput constraints.
