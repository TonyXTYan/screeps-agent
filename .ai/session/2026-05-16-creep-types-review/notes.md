# Creep Types and Size Constraints

## Implementation: 50% body budget cap (2026-05-16)

Added `BODY_BUDGET_RATIO = 0.5` and `BODY_MIN_BUDGET = 300` to `creep.capabilities.ts`. All archetypes are now planned against `max(300, floor(energyCapacityAvailable × 0.5))` instead of the raw capacity. Demand calculations (`desiredHaulerCapacity`, `desiredWorkerWork`) were updated to use the same capped budget. Defenders in `creep.populationControl.ts` are also capped via `Math.min(energyAvailable, defenderBudget)`. At RCL 8 the 50-part body limit still binds so those bodies are unchanged.

---



This document reviews all creep archetypes that can spawn, their minimum sizes, and maximum sizes.

## Overview

There are **11 creep archetypes** defined in the system, each with distinct body planning strategies and size constraints. The body size is determined by:
- **Available energy** (capped at room energy capacity)
- **RCL** (room control level) for minimum body constraints
- **Fleet count** - minimum bodies only apply if creeps of that type already exist
- **Archetype-specific options** (static mining, has container, work ratio, claim parts)

**Hard limits:**
- Maximum body length: **50 parts** (Screeps game limit)
- Minimum body: varies by archetype, typically 2-3 parts

---

## Creep Archetypes

### 1. **Worker**
**Role:** General-purpose worker for building, repairing, upgrading
**Job types:** harvestSource → build, repair, upgrade

**Body planning:** Scales WORK:CARRY:MOVE ratio based on work demand
- Option: `workRatio` (default 1) - scales WORK parts per CARRY+MOVE unit
- Formula: `(workRatio WORK + CARRY + MOVE)` repeated until budget exhausted

**Min size:**
- **First creep:** No minimum (can spawn with just budget allows)
- **Fleet count ≥ 1 @ RCL < 4:** 1 WORK
- **Fleet count ≥ 1 @ RCL 4-6:** 2 WORK
- **Fleet count ≥ 1 @ RCL ≥ 7:** 3 WORK
- (Minimum check on WORK count, not total body size)

**Max size:**
- Single unit at budget: `[WORK×workRatio, CARRY, MOVE]` repeated until hitting 50 parts or budget exhausted
- Example @ RCL 8 with 300k energy and workRatio=3:
  - Pattern: `[WWW, C, M]` = 5 parts = 450 energy per cycle
  - Max cycles: 300,000 / 450 ≈ 666 cycles = 3,330 parts → capped at 50 parts
  - **Actual max: ~10 full cycles = 50 parts**

**Typical sizes:**
- Early game (50-150k energy): 3-8 parts
- Mid game (150-300k energy): 10-25 parts
- Late game (300k+ energy): 30-50 parts

---

### 2. **Miner**
**Role:** Stationary source harvester, positioned at source
**Job types:** harvestSource (stays at source, no move)

**Body planning:** Selects largest pre-defined body from candidates
- Special case: `staticMining=true` with no container → larger bodies possible
- Special case: `staticMining=true` with container → even larger bodies
- Without staticMining: standard sized bodies

**Candidate bodies (no container, static mining):**
```
[W, W, W, W, W, C, M, M, M]           → 9 parts, 650 energy
[W, W, W, W, C, M, M]                 → 7 parts, 500 energy
[W, W, W, C, M, M]                    → 6 parts, 400 energy
[W, W, C, M]                          → 4 parts, 250 energy
[W, C, M]                             → 3 parts, 150 energy
```

**Min size:**
- First creep: No hard minimum, but typically 3 parts minimum (W, C, M = 150 energy)
- Fleet count ≥ 1 @ RCL < 4: 1 WORK
- Fleet count ≥ 1 @ RCL 4-6: 3 WORK
- Fleet count ≥ 1 @ RCL ≥ 7: 4 WORK

**Max size:**
- `[W, W, W, W, W, C, M, M, M]` = 9 parts @ 650 energy (standard max)
- With container: `[W, W, W, W, W, W, W, W, C, M, M, M, M]` = 13 parts @ 1,050 energy

**Typical sizes:**
- Small: 3-4 parts (150-250 energy)
- Medium: 6-7 parts (400-500 energy)
- Large: 9 parts (650 energy)
- With container: up to 13 parts (1,050 energy)

---

### 3. **Hauler**
**Role:** Energy transport (containers/storage ↔ spawns/extensions/towers)
**Job types:** withdrawEnergy → depositEnergy, or pickupEnergy → refillSpawn/refillTower

**Body planning:** Adds `[CARRY, CARRY, MOVE]` triplets until budget exhausted
- Adds a WORK part at the end if budget allows (for emergency energy gathering)
- Minimum: at least `[CARRY, MOVE]` (150 energy)

**Min size:**
- First creep: No hard minimum
- Fleet count ≥ 1 @ RCL < 4: 2 CARRY
- Fleet count ≥ 1 @ RCL 4-6: 4 CARRY
- Fleet count ≥ 1 @ RCL ≥ 7: 6 CARRY

**Max size:**
- Repeats `[C, C, M]` until 50 parts
- Max cycles: (50 parts) / 3 = 16 full triplets + 1 remainder
- Max body: `[C, C, M]×16 + [C, W]` = 50 parts
- Cost: 16 × 150 + 150 = 2,550 energy (for 16 triplets alone, 50-part limit)
- **Practical max @ 300k energy: ~30-40 parts**

**Typical sizes:**
- Small: 3-5 parts (single to double CARRY)
- Medium: 10-15 parts (5-7 CARRY)
- Large: 25-35 parts (12-17 CARRY)
- Max: 50 parts (~25 CARRY + 1 WORK)

---

### 4. **Doctor**
**Role:** Emergency repair/healing (not currently actively used in job assignment)
**Job types:** repair, heal

**Body planning:** Selects largest from:
```
[W, W, C, C, M, M, H, M]              → 8 parts, 1,050 energy
[W, C, M, H, M]                       → 5 parts, 550 energy
```

**Min size:** No minimum enforced (returns true for all archetypes)

**Max size:**
- `[W, W, C, C, M, M, H, M]` = 8 parts @ 1,050 energy
- Fallback: `[W, C, M, H, M]` = 5 parts @ 550 energy

**Typical sizes:**
- Small: 5 parts (550 energy)
- Large: 8 parts (1,050 energy)

**Note:** Doctor archetype is inferred when a creep has HEAL parts. Job runner can assign repair/heal jobs, but spawn planner doesn't actively request doctors.

---

### 5. **Claimer**
**Role:** Claim/reserve controllers in remote rooms
**Job types:** claimController, reserveController, travelRoom

**Body planning:** Builds pairs of `[CLAIM, MOVE]`
- Options: `minClaimParts` (default 1), `maxClaimParts` (default 5)
- Builds minimum parts first, then fills to maximum while budget allows

**Min size:**
- `minClaimParts × [CLAIM, MOVE]` = minimum 2 parts
- For reserve requests: `minClaimParts=2` → min 4 parts

**Max size:**
- Maximum 25 CLAIM parts (creep body limit is 50, so max is 25 × [CLAIM, MOVE])
- `maxClaimParts` caps this (typically 5 for claim, 2 for reserve)
- Practical max: `[CLAIM, MOVE]×5` = 10 parts @ 3,500 energy
- For reserve (maxClaimParts=2): `[CLAIM, MOVE]×2` = 4 parts @ 1,400 energy

**Typical sizes:**
- Claim target: 10 parts (5 CLAIM pairs)
- Reserve target (>500 ticks): 10 parts (5 CLAIM pairs)
- Reserve target (<500 ticks, renewing): 4 parts (2 CLAIM pairs)

---

### 6. **Defender**
**Role:** Attack hostile creeps in room
**Job types:** attack (inline, no job assignment)

**Body planning:** Uses legacy role balancer for body composition
- Specification: `[1 MOVE, 0 WORK, 0 CARRY, 1 ATTACK, 1 RANGED_ATTACK, 0 HEAL, 0 CLAIM, 2 TOUGH]`
- Minimum fallback: `[TOUGH, MOVE, ATTACK]` = 3 parts @ 140 energy (if energy < 300)

**Min size:**
- Minimum: 3 parts `[TOUGH, MOVE, ATTACK]` @ 140 energy

**Max size:**
- Scales all body parts by energy/weight ratio
- Cost breakdown: `1×50 + 0×100 + 0×50 + 1×80 + 1×150 + 0×250 + 0×600 + 2×10 = 290` per unit
- Max energy capacity (300k) / 290 ≈ 1,034 units
- But body is capped at 50 parts, so practical max:
  - Typical: 15-20 ATTACK + RANGED_ATTACK + TOUGH + MOVE = 45-50 parts

**Typical sizes:**
- Emergency (limited energy): 3-5 parts
- Small: 10-15 parts
- Medium: 20-30 parts
- Large: 40-50 parts

**Spawn trigger:** When hostiles detected; spawns until `defenders ≥ ceil(hostiles × 1.5)`

---

### 7. **Remote Miner**
**Role:** Harvest sources in remote rooms (travels to remote room)
**Job types:** harvestSource, travelRoom

**Body planning:** Similar to Miner, but with static mining options
- Option: `staticMining=true` (position at source permanently, no moving)
- Option: `hasContainer=true` (has container at station)

**Candidate bodies (standard, no static mining):**
```
[W, W, W, W, W, C, M, M, M]           → 9 parts, 650 energy
[W, W, W, W, C, M, M]                 → 7 parts, 500 energy
[W, W, W, C, M, M]                    → 6 parts, 400 energy
[W, W, C, M]                          → 4 parts, 250 energy
[W, C, M]                             → 3 parts, 150 energy
```

**With staticMining & no container:**
```
[W, W, W, W, C, M, M, M]              → 8 parts, 600 energy
[W, W, W, C, M, M, M]                 → 7 parts, 500 energy
[W, W, W, C, M, M]                    → 6 parts, 400 energy
[W, W, C, M, M]                       → 5 parts, 300 energy
[W, C, M]                             → 3 parts, 150 energy
```

**With staticMining & container:**
```
[W, W, W, W, W, C, M, M, M]           → 9 parts, 650 energy
[W, W, W, W, C, M, M, M]              → 8 parts, 600 energy
[W, W, W, C, M, M]                    → 6 parts, 400 energy
[W, W, C, M, M]                       → 5 parts, 300 energy
[W, C, M]                             → 3 parts, 150 energy
```

**Min size:**
- First creep: No hard minimum
- Fleet count ≥ 1 @ RCL < 4: 1 WORK
- Fleet count ≥ 1 @ RCL 4-6: 3 WORK
- Fleet count ≥ 1 @ RCL ≥ 7: 4 WORK
- Emergency spawn (no existing miners): `[WORK, CARRY, MOVE]` = 3 parts

**Max size:**
- Standard: 9 parts @ 650 energy
- With container: 9-10 parts

**Renewal:** Renews at home room spawn when TTL drops below `RENEW_MIN_TTL` (220 ticks + distance)

---

### 8. **Remote Hauler**
**Role:** Transport energy from remote sources to home room
**Job types:** withdrawEnergy → travelRoom → depositEnergy

**Body planning:** Same as Hauler, adds `[CARRY, CARRY, MOVE]` triplets
- Minimum spawn: `[CARRY, MOVE]`
- Optional final WORK if budget allows

**Min size:**
- First creep: No hard minimum
- Fleet count ≥ 1 @ RCL < 4: 2 CARRY
- Fleet count ≥ 1 @ RCL 4-6: 4 CARRY
- Fleet count ≥ 1 @ RCL ≥ 7: 6 CARRY
- **Remote minimum:** Max of `REMOTE_HAULER_ABSOLUTE_MIN_COST` (600) and `REMOTE_HAULER_MIN_DEMAND_RATIO` (40% of demand)
  - Absolute min: 600 energy = `[CARRY, CARRY, MOVE]` = 3 parts
  - Useful min: 900 energy = `[CARRY, CARRY, CARRY, MOVE, MOVE]` = 5 parts

**Max size:**
- Same as Hauler: up to 50 parts (~25 CARRY)

**Demand scaling:** Body size scales to hauler capacity demand (can transport 40-100% of demand per source)

---

### 9. **Remote Maintainer**
**Role:** Repair road/container infrastructure in remote rooms
**Job types:** repair, build, travelRoom

**Body planning:** Selects largest from:
```
[W, W, W, W, C, C, M, M, M, M]        → 10 parts, 900 energy
[W, W, C, C, M, M, M]                 → 7 parts, 500 energy
[W, C, M]                             → 3 parts, 150 energy
```

**Min size:**
- No hard minimum enforced
- Remote minimum: `REMOTE_MAINTAINER_MIN_COST` = 450 energy
  - `[WORK, CARRY, MOVE]` = 3 parts (150 energy) won't spawn
  - Need `[WORK, WORK, CARRY, CARRY, MOVE]` minimum = 500 energy (5 parts)

**Max size:**
- `[W, W, W, W, C, C, M, M, M, M]` = 10 parts @ 900 energy

**Spawn condition:** Only spawns if route is degraded (needs maintenance)

---

### 10. **Remote Scout**
**Role:** Explore/scout remote rooms (minimal body)
**Job types:** travelRoom, idle

**Body planning:** Selects largest from:
```
[M, M]                                → 2 parts, 100 energy
[M]                                   → 1 part, 50 energy
```

**Min size:** 1 MOVE = 50 energy

**Max size:** 2 MOVE = 100 energy

**Spawn condition:** Scouts new remote rooms before setting up sources

---

### 11. **Mineral Miner**
**Role:** Harvest minerals (secondary resource)
**Job types:** mineMineral → depositMineral

**Body planning:** Selects largest from:
```
[W, W, W, W, W, C, M]                 → 7 parts, 600 energy
[W, W, W, W, C, M]                    → 6 parts, 500 energy
[W, W, W, C, M]                       → 5 parts, 400 energy
[W, W, C, M]                          → 4 parts, 300 energy
[W, C, M]                             → 3 parts, 150 energy
```

**Min size:** 3 parts `[WORK, CARRY, MOVE]` @ 150 energy

**Max size:** 7 parts @ 600 energy

**Spawn condition:** If mineral exists and RCL ≥ 6 (needs extractor)

---

## Size Summary Table

| Archetype | Min Parts | Min Energy | Max Parts | Max Energy | Typical |
|-----------|-----------|-----------|-----------|-----------|---------|
| Worker | 1 WORK | 100 | 50 | 3000+ | 10-25 |
| Miner | 1 WORK | 100 | 9 | 650 | 3-9 |
| Hauler | 1 CARRY | 50 | 50 | 2550+ | 10-25 |
| Doctor | - | 150 | 8 | 1050 | 5-8 |
| Claimer | 1 CLAIM | 600 | 10 | 3500 | 4-10 |
| Defender | 1 ATTACK | 80 | 50 | 2000+ | 10-30 |
| Remote Miner | 1 WORK | 100 | 9 | 650 | 3-9 |
| Remote Hauler | 1 CARRY | 50 | 50 | 2550+ | 5-25 |
| Remote Maintainer | 1 WORK | 150 | 10 | 900 | 3-10 |
| Remote Scout | 1 MOVE | 50 | 2 | 100 | 1-2 |
| Mineral Miner | 1 WORK | 100 | 7 | 600 | 3-7 |

---

## Key Constraints

### Energy Recovery
- **Remote spawn blocked** if home stored energy < 500 (REMOTE_HOME_RECOVERY_STORED_ENERGY)
- **Remote throttled** if stored energy < 1 (REMOTE_THROTTLE_STORED_ENERGY) and request uses remote income
- **Min energy ratio:** Must have ≥50% of capacity available before remote spawn (REMOTE_SPAWN_MIN_ENERGY_RATIO)

### Minimum Bodies (when fleet exists)
- **RCL < 4:** 1 WORK for workers/miners, 2 CARRY for haulers
- **RCL 4-6:** 2 WORK for workers, 3 WORK for miners, 4 CARRY for haulers
- **RCL ≥ 7:** 3 WORK for workers, 4 WORK for miners, 6 CARRY for haulers

### Maximum Bodies
- **Hard limit:** 50 parts per creep (Screeps game limit)
- **Practical limit:** Room energy capacity determines max size
- **Max RCL 8 energy:** 300,000 available

### Spawn Timing
- First creep of type bypasses minimum body check
- Subsequent creeps must meet minimum body size requirements
- Defenders spawn every 5 ticks if hostiles present

---

## Notes

1. **Body planning is energy-responsive:** Same archetype can vary widely (3 parts → 50 parts) based on energy available
2. **Minimum checks are RCL-scaled:** Early game is less restrictive than late game
3. **Remote creeps have additional recovery constraints:** Can't spawn aggressively if home room is low on energy
4. **Legacy role balancer:** Defender and some emergency spawns use legacy `balanceSpec()` for body composition
5. **Static mining optimization:** Remote miners with containers can spawn slightly larger bodies
6. **No max population controls:** Body size is energy-limited, not population-limited (except defenders scale with hostiles)
