# Screeps Algorithm Improvement Suggestions

**Generated:** 2026-05-17 | **Session:** 2026-05-17-screeps-monitoring
**Based on:** Live monitoring (ticks 70992712-70993022) + codebase analysis
**Source:** `src/room.controller.ts` (4715 lines), `src/creep.harvest.ts`

---

## PRIORITY 1: Critical Issues (Immediate Impact)

### 1.1 Hauler Empty Returns Wasting Ticks

**Evidence:** Multiple haulers observed traveling empty back to remote rooms:
- `remoteHauler-Spawn1-70989245-1`: W7N9 -> W8N9, en=0/1600
- `remoteHauler-Spawn2-70989287-1`: W7N9 -> W8N9, en=0/1600
- `remoteHauler-Spawn1-70991305`: W7N9 -> W6N9, en=0/1600

**Root Cause (line 745-758):**
```typescript
// In assignRemoteHaulerCycle:
if (creep.room.name === remoteRoom) {
    const source = findRemoteEnergySource(creep, remotePlan);
    if (source) {
        setJob(creep, source.jobType, source.target);
        return true;
    }
    creep.memory.remoteHaulerIdleUntil = Game.time + REMOTE_HAULER_IDLE_RECHECK_TICKS;
    setTravelJob(creep, homeRoom);
    return true;
}
```
When hauler arrives at remote room and container is empty, it immediately travels home instead of waiting. The `REMOTE_HAULER_IDLE_RECHECK_TICKS=75` is only set when NO energy source is found at all.

**Suggestion:**
Add a "wait for container" threshold before returning home:
```typescript
const container = findRemoteContainer(creep, remotePlan);
if (container && container.store.getUsedCapacity(RESOURCE_ENERGY) < creep.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
    // Wait up to 30 ticks for container to fill instead of returning immediately
    const waitUntil = creep.memory.haulerWaitUntil || (Game.time + 30);
    if (Game.time < waitUntil) {
        creep.memory.haulerWaitUntil = waitUntil;
        creep.moveTo(container, { range: 3 });
        return true;
    }
}
```
**Expected impact:** Reduce empty returns by ~40%, increase energy delivery rate.

### 1.2 Container Fluctuation Too Extreme (W6N9)

**Evidence:** Container 119f9ed3 at W6N9: 100 -> 1548 -> 248 -> 348 -> 120 -> 220 (wild swings)

**Root Cause:** Hauler withdrawal rate exceeds miner refill rate. The miner deposits ~5 energy/tick but haulers withdraw 1600 in bursts. With REMOTE_HAULER_IDLE_RECHECK_TICKS=75, haulers keep cycling even when container is nearly empty.

**Suggestion:**
Add minimum container threshold before allowing withdrawal:
```typescript
// In findRemoteEnergySource (or hauler assignment):
const MIN_CONTAINER_WITHDRAW_THRESHOLD = 500; // Don't withdraw if container below this
if (container.store.getUsedCapacity(RESOURCE_ENERGY) < MIN_CONTAINER_WITHDRAW_THRESHOLD) {
    // Skip this container, try another source or wait
    return null;
}
```
**Expected impact:** Smoother container levels, fewer hauler cycles through empty containers.

### 1.3 W8N9 Container 5712a230 Critically Low (20-800/2000)

**Evidence:** Container 5712a230 at [18,27] dropped to 20/2000 multiple times.

**Root Cause:** Two haulers assigned to source 4adbfc6b but container consistently depleted. The hauler `remoteHauler-Spawn2-70989287-1` repeatedly tries `job=withdrawEnergy tgt=5d43aa5a` (wrong container - targeting 5d43aa5a which is for source 4adbfc69, not 4adbfc6b).

**Suggestion:**
Fix hauler target assignment to ensure each hauler withdraws from the correct container:
```typescript
// Verify hauler's target container matches its assigned source
const sourceContainer = remotePlan.sources?.[creep.memory.sourceId]?.containerId;
if (sourceContainer && creep.memory.jobTargetId !== sourceContainer) {
    // Reassign to correct container
    const correctContainer = Game.getObjectById(sourceContainer);
    if (correctContainer) {
        setJob(creep, 'withdrawEnergy', correctContainer);
        return true;
    }
}
```
**Expected impact:** Prevent cross-container targeting, stabilize W8N9 energy flow.

---

## PRIORITY 2: Performance Optimizations

### 2.1 Maintainer Stuck Detection Too Aggressive

**Evidence:** Both maintainers show stuck=1-2 repeatedly while traveling between rooms.

**Root Cause (line 127):** `REMOTE_HAULER_RETARGET_STUCK_TICKS = 4` is used for maintainer stuck detection too. Maintainers traveling between rooms naturally take >4 ticks to cross room boundaries.

**Suggestion:**
Increase maintainer stuck threshold or separate it from hauler threshold:
```typescript
const REMOTE_MAINTAINER_RETARGET_STUCK_TICKS = 15; // Separate from hauler's 4
// In maintainer assignment (line 405):
const stuckOnSourceId = (creep.memory.travelStuckTicks ?? 0) >= REMOTE_MAINTAINER_RETARGET_STUCK_TICKS
    && creep.memory.jobType === 'harvestSource'
    ? creep.memory.jobTargetId : undefined;
```
**Expected impact:** Fewer false stuck detections for maintainers, smoother inter-room travel.

### 2.2 Home Energy Recovery Rate Suboptimal

**Evidence:** Home energy climbed from 1322 to 3580 in ~310 ticks = ~7.3 energy/tick net. With 2 home miners and 2 remote rooms contributing, this is below potential.

**Root Cause:**
- Home miners harvest at ~5 energy/tick each = 10 energy/tick
- Home energy consumption: ~2.7 energy/tick (9 creeps * ~0.3 avg)
- Net should be ~7.3 but remote haulers deliver in bursts, not steadily

**Suggestion:**
Add a home energy buffer target that triggers more aggressive remote hauler spawning:
```typescript
// In spawn planning:
const HOME_ENERGY_TARGET_RATIO = 0.7; // Target 70% of max energy
const currentEnergyRatio = homeRoom.energyAvailable / homeRoom.energyCapacity;
if (currentEnergyRatio < HOME_ENERGY_TARGET_RATIO) {
    // Spawn additional haulers to boost delivery rate
    const extraHaulersNeeded = Math.ceil((HOME_ENERGY_TARGET_RATIO - currentEnergyRatio) * 2);
    // Adjust hauler spawn limits temporarily
}
```
**Expected impact:** Faster recovery from low-energy states, fewer "recovery" gate blocks.

### 2.3 Terminal Resource Drain to Links

**Evidence:** Links show 180+649+690+693 (first link at 180, critically low). Terminal has 181906 resources.

**Root Cause:** Link transfer threshold `LINK_TRANSFER_THRESHOLD = 200` (line 89) is too low for link 0 which is at 180. Links drain energy each tick and need constant refilling.

**Suggestion:**
Increase LINK_TRANSFER_THRESHOLD or add per-link monitoring:
```typescript
const LINK_TRANSFER_THRESHOLD = 400; // Double the threshold
// Or add dynamic threshold based on link drain rate:
const linkDrainRate = (link.store.getCapacity(RESOURCE_ENERGY) - link.store.getUsedCapacity(RESOURCE_ENERGY)) / Game.time;
const dynamicThreshold = Math.max(200, linkDrainRate * 10);
```
**Expected impact:** Fewer link energy drops, more stable link network.

---

## PRIORITY 3: Structural Improvements

### 3.1 Dynamic Hauler Capacity Scaling

**Current:** Fixed `MAX_REMOTE_HAULERS_PER_SOURCE = 2` and `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500`.

**Issue:** When home storage is low (below 10K), more haulers should be spawned. When home storage is high (>15K), fewer haulers are needed.

**Suggestion:**
```typescript
function getDynamicHaulerLimit(homeRoom: Room): number {
    const storageRatio = homeRoom.storage?.store.getUsedCapacity(RESOURCE_ENERGY) / homeRoom.storage?.store.getCapacity(RESOURCE_ENERGY) || 0;
    if (storageRatio < 0.3) return 3; // Aggressive hauler spawning
    if (storageRatio < 0.6) return 2; // Normal
    return 1; // Conservative - storage nearly full
}
```

### 3.2 CPU Budget-Aware Pathfinding

**Evidence:** CPU bucket dropped from 8944 to 1100 then recovered to 10000. Heavy pathfinding during room crossings is likely the cause.

**Suggestion:**
Add CPU budget checking before expensive pathfinding:
```typescript
// In pathfinding-heavy operations:
if (Game.cpu.getBucket() < 5000) {
    // Use cached paths or simpler routing
    creep.moveTo(target, { reusePath: 100 }); // Reuse path longer
} else {
    creep.moveTo(target, { reusePath: 5 }); // Fresh paths when budget allows
}
```

### 3.3 Mineral Extraction Post-Depletion Handling

**Evidence:** Mineral amount=0, container L=0/2000, extractor still active.

**Issue:** The extractor continues running but there are no minerals to extract. The mineral miner should be redirected or retired.

**Suggestion:**
```typescript
// In mineral plan evaluation:
if (mineral.amount === 0 && extractor) {
    // Redirect mineral miner to help with home energy or remote ops
    // Or disable extractor to save structural maintenance
    Memory.rooms[homeRoom].plan.mineralMinerDisabled = true;
}
```

### 3.4 Claimer Progress Tracking

**Evidence:** Claimer at [5,37] in W6N9 for 392 ticks with no position change.

**Issue:** No progress tracking or timeout for claimers. If a claimer is stuck, it wastes its entire lifetime.

**Suggestion:**
```typescript
const CLAIMER_PROGRESS_TIMEOUT = 200; // Ticks without progress
const claimerPos = creep.memory.lastClaimPos;
if (claimerPos && creep.pos.isEqualTo(claimerPos) && Game.time - creep.memory.lastClaimTick > CLAIMER_PROGRESS_TIMEOUT) {
    // Claimer stuck - retreat and retry from different angle
    creep.memory.claimRetryAngle = (creep.memory.claimRetryAngle || 0) + 45;
    setTravelJob(creep, homeRoom); // Reset position
}
```

---

## PRIORITY 4: Long-Term Optimizations

### 4.1 Remote Room Energy Balance

**Current state:**
- W8N9: 2 sources, both mining well, but container 5712a230 consistently low
- W6N9: 1 source, container fluctuating wildly

**Suggestion:** Implement per-source energy accounting to rebalance hauler assignment:
```typescript
// Track per-source energy delivery efficiency
const sourceEfficiency = new Map<string, number>();
for (const source of remotePlan.sources) {
    const delivered = source.energyDeliveredLast100Ticks || 0;
    const spent = source.haulerCostLast100Ticks || 0;
    sourceEfficiency.set(source.id, delivered / Math.max(1, spent));
}
// Reassign haulers to most efficient sources
```

### 4.2 Pre-Computed Path Caching

**Issue:** Every room crossing triggers fresh pathfinding. With 3 remote rooms and multiple creeps, this is expensive.

**Suggestion:** Cache paths per room pair and reuse until invalidated:
```typescript
const PATH_CACHE_TTL = 1000; // Ticks before re-computing
function getCachedPath(fromRoom: string, toRoom: string): Path | null {
    const cacheKey = `${fromRoom}_${toRoom}`;
    const cached = Memory.paths?.[cacheKey];
    if (cached && Game.time - cached.timestamp < PATH_CACHE_TTL) {
        return cached.path;
    }
    // Compute and cache...
}
```

### 4.3 Spawn Energy Budget Allocation

**Current:** `REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5` (50% of spawn capacity needed).

**Issue:** With 5100 energy capacity, 2550 is needed per spawn. But remote creeps cost 600-1000 each, and the bot sometimes waits for full capacity instead of spawning incrementally.

**Suggestion:**
```typescript
// Spawn cheapest-needed creeps first when energy is between thresholds
if (spawnEnergy >= REMOTE_HAULER_ABSOLUTE_MIN_COST && spawnEnergy < REMOTE_SPAWN_MIN_ENERGY_RATIO * spawnCapacity) {
    // Still spawn maintainers (450 cost) or emergency haulers
    if (needsMaintainer && spawnEnergy >= REMOTE_MAINTAINER_MIN_COST) {
        spawnMaintainer();
    }
}
```

---

## CRITICAL FINDINGS (Updated Tick 70993930)

### 1. Dropped Energy Crisis (Worst Issue - INCREASING)
| Tick | W8N9 [43,6] | W8N9 [18,27] | W6N9 [37,37] | Total Dropped |
|------|-------------|--------------|--------------|---------------|
| 70993810 | 1976 | 511 | 836 | 3323 |
| 70993820 | 2046 | 501 | 826 | 3373 |
| 70993840 | 2116 | 471 | 706 | 3293 |
| 70993850 | 2191 | 461 | 696 | 3348 |
| 70993900 | 2286 | 421 | 646 | 3353 |
| 70993920 | 2406 | 391 | - | 2797+ |
| 70993930 | 2431 | 381 | - | 2812+ |

**~2800+ energy wasted RIGHT NOW and still increasing.** Root cause: containers full at 2000/2000, miners can't deposit, energy drops. Haulers not withdrawing fast enough.

### 2. Hauler Permanently Stuck (Critical Pathfinding Failure)
remoteHauler-Spawn1-70991305 at [30,31] in W7N9:
- stuck=10 at tick 70993900
- stuck=20 at tick 70993920
- stuck=30 at tick 70993920
- stuck=40 at tick 70993930

**This hauler is completely stuck.** It's trying to deposit energy at f5a89c43 but can't reach target. Position hasn't changed for 40+ ticks.

### 3. Link Network Still Collapsed
| Tick | Links | Status |
|------|-------|--------|
| 70993850 | 110+30+0 | 1 dead, 1 critical |
| 70993900 | 10+40+194 | 2 critical |
| 70993920 | 140+60+0 | 1 dead, 1 critical |
| 70993930 | 40+10+194 | 2 critical |

Links cycling between 0-194. No refill mechanism exists.

### 4. Claimer Still Stuck
claimer-Spawn1-70993406 at [38,24] in W8N9, stuck=4, ttl=85. Dying soon with zero progress.

### 5. W6N9 Container Not Visible
Container 119f9ed3 out of sight range. Was at 0/2000 earlier.

---

## Summary of Quick Wins

| Change | Effort | Impact | Location |
|--------|--------|--------|----------|
| Fix link refill urgency | 10 min | CRITICAL | runLinks function |
| Increase RETARGET_STUCK_TICKS for maintainers | 5 min | Medium | Line 127 |
| Add container wait threshold for haulers | 15 min | High | Line 745 |
| Fix cross-container targeting | 10 min | High | findRemoteEnergySource |
| Increase LINK_TRANSFER_THRESHOLD | 2 min | Low | Line 89 |
| Add mineral depletion detection | 10 min | Low | Mineral plan |

## Estimated Energy Gain

If all Priority 1 fixes are implemented:
- Hauler empty returns reduced by 40%: +3-5 energy/tick
- Container stabilization: +2-3 energy/tick (fewer hauler cycles wasted)
- Cross-container fix: +2-3 energy/tick (W8N9 source 2 becomes productive)

**Total estimated improvement: +7-11 energy/tick net** (from current ~7.3 to ~14-18 energy/tick)

---

*Generated by continuous monitoring session. Data collected from ticks 70992712-70993022 (~310 ticks, 5 minutes of game time).*
