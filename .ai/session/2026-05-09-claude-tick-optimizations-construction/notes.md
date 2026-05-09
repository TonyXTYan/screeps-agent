# Session: Tick Optimizations, Construction, and Hauler Fix

**Date:** 2026-05-09  
**Branch:** codex/2026-06-08-rc6

---

## Work Done

### 1. Parallel intent category optimizations (`src/creep.jobRunner.ts`)

Screeps allows one action per intent category per tick. `harvest` (Work) and `transfer` (Carry) are independent — both fire in the same tick. Fixes:

- **`harvestSource`**: Stationary miners were losing one harvest tick every time their store filled (branch only transferred, never harvested). Now calls `offloadEnergyNearby()` alongside `harvest()` whenever the miner is in position and has energy. Steady-state: store stays near-empty, container/link fills every tick.
- **`mineMineral`**: Same parallel offload pattern.
- **`heal`**: Added `rangedHeal(target)` before `moveTo` in the `ERR_NOT_IN_RANGE` branch — heals at range while closing distance. `rangedHeal` (range 3) and `heal` (range 1) are the same intent category so only one fires; `rangedHeal` is the fallback when too far for melee heal.

### 2. `rangedHeal` fix in legacy role (`src/role.doctor.ts`)

Same `rangedHeal` + `moveTo` pattern applied to the legacy doctor role's heal block.

### 3. Hauler source-link fix (`src/room.controller.ts` — `energyWithdrawalTarget`)

**Bug:** Haulers included `sourceLinks` in their withdrawal candidate pool. Once source links are built, haulers would steal from the miner-side of the link chain, bypassing automatic link→hub/controller transfer and reducing link chain efficiency.

**Fix:** Removed `sourceLinks` from hauler candidates. Haulers now only withdraw from:
- Hub/sink-side demand links (when spawn pressure exists)
- Source containers

Source links stay dedicated to the link chain.

### 4. Builder guarantee (`src/room.controller.ts`)

**Problem diagnosed via live room inspection (W7N9, RCL6, 99 sites):** Only 1 of 2 workers was building. `desiredUpgraderWork(RCL6) = 5` consumed the first worker processed. This applied from early RCL — with only 1 worker and sites, the worker would upgrade instead of build.

**Fix:** Before any worker is assigned an upgrade job, check `reservations.constructionProgress`. If empty (no builder reserved yet this tick) and sites exist, that worker gets build first. Change in two places:
1. **`assignEnergySpendingJob`**: Insert "guarantee one builder" block before the upgrade block.
2. **`resumePrimaryEnergyJob` (upgrade branch)**: Clear primary upgrade and redirect if no builder reserved yet.

**Result:** With N workers and sites:
- First processed gets build (guaranteed)
- Second fills upgrade quota
- Remaining get build
Applies from RCL1 upward.

---

## Room W7N9 State At Inspection

- RCL6, 2 workers (9 WORK each), 2 miners, 2 haulers, 1 doctor
- 99 construction sites: 84 roads (25,200 energy), 3 links (~9,218 energy remaining), 1 extractor (5,000 energy), 11 walls (11 energy)
- No storage, no links yet (link construction sites present)
- 2 containers at (27,30) near source (28,29) and (6,37) near source (5,37)

---

## What Was NOT Changed

- `desiredUpgraderWork` thresholds — values unchanged, ordering changed
- Construction priority order — unchanged
- Spawn planning logic — unchanged
- Multi-spawn loop — already applied in earlier session

---

## Strategy Doc Updates

- STRATEGY.md: Energy spending section updated to reflect builder guarantee
- KNOWN_ISSUES.md: Noted hauler source-link fix as resolved
