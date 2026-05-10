# Memory Audit Console Guide

The memory audit is exposed on `globalThis` from `src/main.ts`.

## Function

### `runMemoryAudit()`

Runs the full memory consistency audit immediately, regardless of build version.

```js
runMemoryAudit()
```

It is also called automatically on deploy (when the build commit hash changes) via `memoryAudit.runIfBuildChanged()` in the main loop, but is skipped when `Game.cpu.bucket < 500`. The console command bypasses this bucket check.

## What It Cleans Up

| Issue | Description |
|---|---|
| Orphaned room memory | `Memory.rooms[roomName]` for rooms no longer owned and not referenced as a remote or claim target |
| Stale remote plans | Expired `dangerUntil`, cleared `skipReason` when hostiles are gone, stale `lastSeenHostiles`, removed source IDs that no longer exist in the remote room |
| Duplicate source assignments | When multiple miners have the same source assigned, keeps the one with the most WORK parts (or highest TTL as tiebreaker) and clears the others |
| Orphaned source references | `assignedSourceId` / `sourceId` pointing to sources that no longer exist in owned or remote rooms |
| Stale travel stuck memory | Clears `travelStuckTicks` / `travelLastX` / `travelLastY` / `travelLastRoom` when ticks exceed 20 |
| Invalid creep memory | Clears orphaned `remoteRoom`, `homeRoom`, `remoteStandby`, `scoutWanderRoom`, and stale `remoteMode` / `sourceId` / `assignedSourceId` on non-remote creeps |

## Output

Fixes are logged as `[memoryAudit]` lines in the console:

```
[memoryAudit] Duplicate source 59cba123: kept Miner1 (15W), unassigned Miner2, Miner3
[memoryAudit] Removed orphaned room: W0N0
[memoryAudit] Done: 3 issue(s) fixed
```
