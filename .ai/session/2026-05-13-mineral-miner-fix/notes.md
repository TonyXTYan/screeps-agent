# Mineral Miner Behavior Fix

## Problem

Mineral miners were not staying stationary on the mineral container. Instead, they traveled back and forth to storage:
1. Mine mineral → fill container
2. Container becomes full (haulers not keeping up)
3. Miner loses job assignment
4. Gets reassigned to deposit minerals in storage (traveling away)
5. Deposits, returns, cycle repeats

## Root Cause

In `creep.jobRunner.ts`, the `mineMineral()` function returned `ERR_FULL` when the creep's store was full and couldn't transfer to a nearby container.

The `shouldClearJob()` function treated `ERR_FULL` as a terminal condition and cleared the job:
```typescript
if (jobType === 'mineMineral') {
    return result === ERR_INVALID_TARGET ||
        result === ERR_FULL ||  // <-- BUG: clears on full store
        (result === ERR_NOT_ENOUGH_RESOURCES && mineralDepleted(creep));
}
```

When the `mineMineral` job cleared, `room.controller.ts` would then call `assignJob()`, which detects the creep has minerals in its store (`hasMinerals = true`) and assigns `depositResource` to storage/terminal — causing the unwanted travel.

## Solution

Removed `result === ERR_FULL` from the `shouldClearJob()` condition for `mineMineral`. Now:
- When container is full and creep can't transfer → `mineMineral()` returns `ERR_FULL`
- Job is NOT cleared (stays assigned)
- Creep idles at the container station, waiting for hauler to empty it
- No drops (minerals would decay on floor)
- No travel to storage (that's the hauler's job)

This aligns with the intended behavior: **miner stays on container, hauler empties it**.

## Changes Made

**File: `src/creep.jobRunner.ts`**

Line 468-471, function `shouldClearJob()`:
```typescript
// Before:
if (jobType === 'mineMineral') {
    return result === ERR_INVALID_TARGET ||
        result === ERR_FULL ||
        (result === ERR_NOT_ENOUGH_RESOURCES && mineralDepleted(creep));
}

// After:
if (jobType === 'mineMineral') {
    return result === ERR_INVALID_TARGET ||
        (result === ERR_NOT_ENOUGH_RESOURCES && mineralDepleted(creep));
}
```

## Verification

To test, spawn a mineral miner in a room with a mineral and mineral container. Fill the container manually or observe during normal play. The miner should now:
- Sit on the container when full, waiting patiently
- Not travel to storage
- Not drop minerals (no decay risk)
