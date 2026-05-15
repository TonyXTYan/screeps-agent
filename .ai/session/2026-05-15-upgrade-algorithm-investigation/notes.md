# Upgrade Algorithm & Workflow Investigation

**Date:** 2026-05-15  
**Focus:** Room controller upgrade work demand, spawning, assignment, and execution workflow

## Summary

The upgrade system is integrated into the general **worker** archetype (which also handles building and repairing). Upgrades are not a separate spawn type but rather one of several jobs that workers can be assigned.

## Key Functions

### 1. Upgrade Desire: `desiredUpgraderWork(rcl)` @ line 4116

Returns target WORK parts (not creeps) needed per RCL:
- **RCL 8:** 1 work (barely maintain, almost no upgrades)
- **RCL 7:** 10 work (active upgrade push)
- **RCL 5-6:** 5 work (moderate upgrade pace)
- **RCL 1-4:** 2 work (baseline upgrade)

**Critical insight:** This is **purely RCL-dependent** and doesn't scale with room size, storage, or other factors.

### 2. Worker Work Demand (Includes Upgrade): `desiredWorkerWork(context)` @ line 3127

Calculates total WORK capacity needed for build/repair/upgrade combined:

**When construction sites exist (RCL >= 4):**
```
workPerWorker = (ratio + 2 work parts) * segments per budget
upgradeDemand = desiredUpgraderWork(rcl)
minWorkers = max(2, 1 + ceil(upgradeDemand / workPerWorker))
return max(base, minWorkers * workPerWorker)
```

**Key:** Upgrade demand **forces minimum worker count**. If you need 10 work for upgrade at RCL 7, you must spawn enough workers to deliver that capacity, even if no construction exists.

**When no construction:**
- RCL 8: 8 work
- RCL 7: 6 work
- RCL 1-6: 4 work

### 3. Worker Count Hard Cap @ line 2097

```
RCL 1-3: 2 workers max
RCL 4: 3 workers max
RCL 5-8: 4 workers max
```

Workers are **heavily oversubscribed**. Even if `desiredWorkerWork()` calculates you need 50 work, you can only have 4 workers total at RCL 8.

### 4. Upgrade Assignment: `assignEnergySpendingJob()` @ lines 1689–1735

Workers are assigned in this order:

1. **Guaranteed builder** (first time): If construction sites exist
2. **Primary upgrader** (first assigned): If upgrader work < desired
3. **Secondary upgraders** (rest): If upgrader work < desired
4. **Builder** (if no upgrade): If construction sites exist
5. **Repairer**: If repair targets exist
6. **Fallback upgrader**: If upgrader work < desired (catches anything left)
7. **Idle (deposit energy)**: Default

**Critical:** Build > Repair > Upgrade in priority. Fixed in known issues to ensure one builder is reserved before upgrade when construction sites exist.

### 5. Upgrade Gating: `shouldReserveUpgrade()` @ line 4123

Blocks upgrade assignment if:
- No controller exists
- Already reserved enough work (`reservations.upgraderWork >= desired`)
- **Both** `room.energyAvailable === 0` **AND** `storedEnergy === 0`

**Key:** No energy in any form = no upgrade work assigned. This prevents workers from idling on controller waiting for energy.

### 6. Worker Work Ratio: `workerWorkRatio()` @ line 2044

Scales WORK part ratio based on construction urgency:

```
RCL < 3: always 1
RCL >= 4:
  remainingWork > 30k: ratio 3 (heavy WORK)
  remainingWork > 10k: ratio 2 (balanced)
  else: ratio 1 (light WORK)
```

Higher ratio = more WORK parts, fewer MOVE parts. Used in body planning.

## Complete Workflow

### Spawning Upgraders

1. `chooseSpawnRequest()` checks if `workerWork < desiredWorkerWork()`
2. If true and worker count < cap, returns `{ archetype: 'worker' }`
3. `planBodyForArchetype('worker', budget)` uses `workerWorkRatio()` to plan body
4. Creep spawns and enters `assignEnergySpendingJob()` loop

**Note:** No explicit "spawn upgrader now" request. Upgraders emerge from worker archetype.

### Executing Upgrade Jobs

Once assigned `jobType: 'upgrade'`:

1. Gather energy if empty (from storage → link → container → direct harvest)
2. Move to controller
3. Call `creep.upgradeController()` repeatedly

## Key Behaviors & Gotchas

### 1. Upgrade is Non-Negotiable
Upgrade demand forces minimum worker count. You cannot avoid spawning workers for upgrade.

### 2. Energy is Hard Gate
No energy anywhere (available + stored) = no upgrade work assigned.

### 3. Worker Shortage
At RCL 8, you can only have 4 workers. But 3 sources + build + repair + upgrade all compete for those 4 slots. Workers are **heavily constrained**.

### 4. Build Priority Over Upgrade
If construction sites exist, builders are prioritized. Upgrade can be starved.

### 5. Static Upgrade Demand
RCL 7 always wants 10 work. Doesn't scale with room maturity, storage, or other factors.

### 6. Sticky Fallback Harvest
If a worker is assigned `harvestSource` as fallback, it can remain there indefinitely (mitigated by `currentJobStillValid()` invalidating non-miner harvest when storage has energy).

## Known Issues Related to Upgrades

From `KNOWN_ISSUES.md`:

- **Worker energy-spending priority regression (Fixed):** Used to assign guaranteed upgrader before guaranteed builder, starving construction. Now one builder is reserved before upgrade.
- **Worker fallback harvesting sticky (Fixed):** Once assigned `harvestSource`, workers would stay there indefinitely. Now invalidated when storage has energy.
- **Doctor WORK parts inflation (Fixed):** Doctor WORK parts were counted in `workerWork` capacity, reducing worker demand. Now excluded.
- **Worker overflow (Fixed):** No hard count cap used to exist. Now capped per-RCL.

## Architecture Integration

- **Job assignment:** `room.controller.ts` assigns jobs with reservation tracking
- **Job execution:** `creep.jobRunner.ts` executes assigned jobs
- **Body planning:** `creep.capabilities.ts` plans worker bodies with WORK-heavy ratios when needed
- **Legacy fallback:** `role.upgrader.ts` (deprecated, should avoid)

## **RCL 8 Upgrade Cap — POTENTIAL BUG FOUND**

### The Issue

According to Screeps API docs, **RCL 8 cannot be upgraded further** — the upgrade cost table shows "—" for RCL 8's next level cost. The only reason to continue upgrading at RCL 8 is to maintain the downgrade timer (200,000 ticks).

### Current Code Behavior

At RCL 8:
- `desiredUpgraderWork(8)` returns `1` (seems intentional, for downgrade maintenance)
- `shouldReserveUpgrade()` still returns `true` if need < 1 work
- Workers continue to be assigned upgrade jobs
- **They waste energy attempting to upgrade a controller that cannot advance levels**

### Missing Check

Neither `shouldReserveUpgrade()` nor `currentJobStillValid()` checks:
- `controller.level === 8` (explicit max-level check)
- `controller.progressTotal` (would be infinity/max at RCL 8, indicating no next level)

### Location of Code

- **Assignment gating:** `room.controller.ts:4123` (`shouldReserveUpgrade()`)
- **Job validity:** `room.controller.ts:3427–3431` (`currentJobStillValid()` for upgrade job)
- **Desired work:** `room.controller.ts:4116–4121` (`desiredUpgraderWork()`)

### Design Options

1. **Keep current behavior (implicit):** Continue assigning 1 work at RCL 8 for downgrade timer maintenance (energy cost acceptable)
2. **Explicit check in `shouldReserveUpgrade()`:** Add check to block upgrade when `controller.level >= 8`
3. **Modify `desiredUpgraderWork()`:** Return `0` at RCL 8 to save energy
4. **Check `progressTotal`:** If it indicates no next level, adjust behavior accordingly

The current code seems to intend downgrade maintenance, but it's not explicit.

## Related Code Sections

- `room.controller.ts:1689–1735` — upgrade assignment logic
- `room.controller.ts:3127–3152` — worker work demand
- `room.controller.ts:2044–2052` — worker work ratio scaling
- `room.controller.ts:4116–4128` — upgrade desire and gating (**RCL 8 cap issue**)
- `room.controller.ts:2097–2102` — worker count caps and spawn requests
- `room.controller.ts:3427–3431` — upgrade job validity (**missing RCL 8 check**)
- `creep.jobRunner.ts` — upgrade job execution
- `role.upgrader.ts` — legacy fallback role

