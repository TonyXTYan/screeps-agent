# Remote Miner Stuck on Winding Route — v4 Fix

**Date:** 2026-05-14 → 2026-05-15  
**Branch:** `codex/2026-06-08-rc6`

---

## Problem

Remote miner `remoteMiner-Spawn1-70929890` (W7N9 homeRoom) was permanently stuck oscillating between `[46,12]` and `[47,12]` in W8N9, assigned to source `4adbfc69` at `[42,7]` with station `[43,6]`. The source had 3000/3000 energy — never mined. TTL counted down ~820 ticks while stuck.

**Memory snapshot at time of investigation:**
- `archetype=remoteMiner`, `sourceId=...4adbfc69`, `stationX=43`, `stationY=6`
- `lastJobResult=-9` (ERR_NOT_IN_RANGE), `travelStuckTicks=2` (oscillates 1-3, never reaches escape threshold)

---

## Root Cause

W8N9 has swamp terrain with narrow passages at approximately `(27,2)`, `(26,24)`, and `(44,36)`. The terrain is **connected** but highly winding:

- Miners from W7N9 enter W8N9 at `x=49, y≈31` (east border, nearest to anchor)
- Station `[43,6]` is in the northern part of the room
- Reaching `[43,6]` from `[49,31]` requires threading through western passages — estimated 100-150+ tiles within W8N9
- A wall barrier at `y≈11-12` on the eastern side prevents direct northward movement
- The miner reaches `[46-47,12]`, hits the barrier, and oscillates due to `MOVE_STUCK_REPATH_TICKS=2` rapidly switching the target between station and source

**Why `travelStuckTicks` never escapes:** The miner alternates between `[46,12]` and `[47,12]` each tick. `updateTravelStuckMemory` resets the counter whenever position changes, so the counter stays at 1-3 and never reaches the escape threshold (12).

---

## Failed Previous Attempts

### v2 — `directRoute` check (`PathFinder` with `maxRooms=8`)
- PathFinder optimally enters W8N9 via `y≈6` exit from W7N9 (25-tile in-W7N9 travel + direct to `[43,6]`)
- `directRoute = true`, `routeAccessible = true` — **false positive** (miners use `y≈31` entry, not `y≈6`)

### v3 — `station → nearestExitFacingHomeRoom` check (`maxRooms=1`)
- Tested: can station `[43,6]` reach the nearest exit in direction of homeRoom?
- Station `[43,6]` can trivially reach `x=49` at `y=6` through the upper section
- `locallyReachable = true` — **false positive** (proves upper-section connectivity; miners enter lower section at `y=31`)

Both checks tested reachability from the wrong direction. They proved the upper section connects to the east border, but miners enter at the lower east border.

---

## v4 Fix — Deployed 2026-05-15

**File:** `src/room.controller.ts`, inside the `if (!route.incomplete)` block ~line 784

**Core idea:** Test reachability from where miners *actually* enter — the exit from `homeRoom` nearest to the anchor (spawn/storage), mirrored into the remote room.

```typescript
const exitDirFromHome = Game.map.findExit(homeRoom.name, remoteName);
let locallyReachable = false;
if (typeof exitDirFromHome === 'number' && exitDirFromHome > 0) {
    const homeExits = homeRoom.find(exitDirFromHome as ExitConstant) as RoomPosition[];
    if (homeExits.length > 0) {
        const nearestHomeExit = homeExits.reduce((a, b) =>
            anchor.pos.getRangeTo(a) < anchor.pos.getRangeTo(b) ? a : b);
        let ex = nearestHomeExit.x, ey = nearestHomeExit.y;
        if (ex === 0) { ex = 49; } else if (ex === 49) { ex = 0; }
        else if (ey === 0) { ey = 49; } else if (ey === 49) { ey = 0; }
        const entryInRemote = new RoomPosition(ex, ey, remoteName);
        const localRoute = PathFinder.search(entryInRemote, { pos: station, range: 0 }, { maxRooms: 1 });
        const directRange = entryInRemote.getRangeTo(station);
        const maxLocalDist = Math.max(200, 2 * directRange);  // 200 = four room edges
        locallyReachable = !localRoute.incomplete && localRoute.path.length <= maxLocalDist;
        if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
            console.log('room.controller: local path check ' + homeRoom.name + '->' + remoteName +
                ' src=' + source.id + ' len=' + localRoute.path.length +
                ' threshold=' + maxLocalDist + (localRoute.incomplete ? ' incomplete' : ''));
        }
    }
}
```

**Key design decisions:**
- Entry point = exit from W7N9 nearest to anchor, mirrored → correctly simulates `[49,31]` for this room pair
- `maxRooms=1` constrains search to the remote room only
- Budget = `max(200, 2 × Chebyshev)`: four room edges is generous enough that c69 (path ~150 tiles) passes; only truly disconnected/looping routes fail
- Budget 200 chosen because user wants to mine c69 — terrain is connected and mineable, budget just needed to be high enough
- Log line outputs actual `len=` so threshold can be tuned with real data

**Also deployed previously (kept as-is):**
- `routeAccessible?: boolean` on `RemoteSourcePlan` in `types.d.ts`
- Spawn gate: `if (sourcePlan.routeAccessible === false) { continue; }`
- `assignRemoteCreep` guard: `routeAccessible !== false`
- `pickRemoteMinerSource` guard: `routeAccessible === false`
- Station copy guard: `routeAccessible !== false`
- `memoryAudit.ts`: clears `pathUpdatedAt` for non-`false` sources on each deploy to force recheck

---

## What This Fixes vs. What It Doesn't

**Fixes:**
- Prevents future miners being assigned to truly disconnected/absurdly winding sources (`routeAccessible=false`)
- Logs actual path length for each remote source so winding paths are visible

**Does NOT fix:**
- The current stuck miner at `[46-47,12]` — it will oscillate until TTL expires
- The oscillation root cause: `MOVE_STUCK_REPATH_TICKS=2` switching between station and source targets too rapidly, resetting `travelStuckTicks` before escape threshold is reached
- If the miner's `moveTo` call from within W8N9 uses a path that heads directly north and hits the `y≈12` barrier, rather than going west first through the passages, it will still oscillate

---

## Open Questions / Follow-up

1. **Check the deployed log**: `room.controller: local path check W7N9->W8N9 src=...4adbfc69 len=? threshold=200` — verify actual path length
2. **Navigation bug**: even with `routeAccessible=true`, does a fresh miner spawned for c69 successfully navigate to `[43,6]`? The oscillation issue may require increasing `MOVE_STUCK_REPATH_TICKS` or having miners follow `pathSerialized` rather than recalculating with `moveTo`
3. **Multi-room path**: does `PathFinder(anchor → station, maxRooms=8)` use the `y≈6` exit (bypassing the in-W8N9 navigation problem), and if so, does `pathSerialized` store the correct route that miners should follow?
