# Memory Model Reference

All persistent state flows through Screeps Memory (`Memory` global). This document maps every custom
field the bot reads and writes.

## Layout

```
Memory
├── lastBuildCommit?: string         — Git hash of last deployed build (triggers audit)
├── creeps: {
│     [name: string]: {
│       role?: string                — Legacy role label (harvester/builder/upgrader/doctor/defender/manual)
│       archetype?: CreepArchetype   — Capability archetype (worker/miner/hauler/doctor/claimer/remote*)
│       homeRoom?: string            — Room this creep belongs to
│
│       // Job system (strategic path)
│       jobType?: CreepJobType       — Current assigned job
│       jobTargetId?: string         — Target game object ID
│       jobRoomName?: string         — Target room name
│       jobResourceType?: ResourceConstant — For resource-type jobs
│       jobAssignedAt?: number       — Tick when job was assigned
│       lastJobResult?: number       — Return code from last job execution
│
│       // Primary job (interruption recovery)
│       primaryJobType?: CreepJobType
│       primaryTargetId?: string
│       primaryRoomName?: string
│       primaryResourceType?: ResourceConstant
│       primaryAssignedAt?: number
│       interruptReason?: string     — Why primary was interrupted
│
│       // Source/mining assignment
│       sourceId?: string            — Assigned source ID
│       assignedSourceId?: string    — Source ID from spawn planner (authoritative)
│       assignedMineralId?: string   — For mineral miners
│       minerDuty?: 'active' | 'standby' — Local miner lifecycle
│       staticMining?: boolean       — Park on container/position
│       stationaryTargetId?: string  — ID of object to park on
│       stationX?: number            — Fallback grid position X
│       stationY?: number            — Fallback grid position Y
│
│       // Remote mining
│       remoteRoom?: string          — Remote room this creep is assigned to
│       remoteMode?: RemoteRoomMode  — harvest/reserve/claim
│       remoteRenewing?: boolean     — Currently traveling to/from spawn for renewal
│       remoteStandby?: boolean      — Remote standby miner flag
│       remoteHaulerRenewAfterTrip?: boolean — Remote hauler must renew before next outbound trip
│       remoteHaulerIdleUntil?: number — Tick until next remote-hauler recheck after no-job idle
│       remoteHaulerLastPickupWasDropped?: boolean — Last selected pickup target was dropped energy; next assignment prioritizes local top-up containers
│       remoteHaulerWanderX?: number — Home-idle wander target X for remote hauler
│       remoteHaulerWanderY?: number — Home-idle wander target Y for remote hauler
│       remoteHaulerWanderUntil?: number — Tick until remote-hauler wander target refresh
│
│       // Scout
│       scoutWanderRoom?: string     — Room for overflow scout to explore
│       scoutWanderUntil?: number    — Tick to stop wandering
│
│       // Travel (stuck detection)
│       travelLastX?: number
│       travelLastY?: number
│       travelLastRoom?: string
│       travelStuckTicks?: number
│       remoteStationStuckSourceId?: string — Source whose station progress is being watched
│       remoteStationLastRange?: number     — Last range to remote source while stalled
│       remoteStationStuckTicks?: number    — No-progress ticks before remote path invalidation
│
│       // Legacy role state flags
│       building?: boolean
│       repairing?: boolean
│       dumping?: boolean
│       upgrading?: boolean
│       attacking?: boolean
│       stationaryWorking?: boolean
│       rallySpawnId?: string         — Defender rally point
│       harvestTargetSourceIndex?: number
│       harvestTargetSourceId?: string
│     }
│   }
│
├── rooms: {
│     [roomName: string]: {
│       sources?: { [id: string]: [count, count, time] }  — Legacy source tracking
│
│       structures?: {
│         updatedAt: number
│         spawns, extensions, towers, containers: string[]  — IDs
│         storage, extractor, terminal, factory, observer, powerSpawn, nuker: string | undefined
│         links: { source, hub, controller, sink, other: string[] }
│         labs: string[]
│       }
│
│       load?: {
│         updatedAt, rcl, energyAvailable, energyCapacity, storedEnergy,
│         sourceCount, minerWork/WorkerWork/... + demand fields,
│         spawnEnergyDeficit, towerEnergyDeficit,
│         constructionSites, repairTargets,
│         mineralReady, salvageResources,
│         mineralMinerWork, mineralMinerWorkDemand
│       }
│
│       plan?: {
│         lastRcl?: number
│         sources?: { [sourceId: string]: SourcePlanMemory }
│         mineral?: MineralPlanMemory
│         remoteRooms?: { [roomName: string]: RemoteRoomPlan }
│         claimTargets?: string[]
│       }
│     }
│   }
│
├── spawns: {
│     [name: string]: {
│       full?: number  — Tick count for legacy spawn-full check
│     }
│   }
```

Remote source plans store source station metadata under
`Memory.rooms[home].plan.remoteRooms[remote].sources[sourceId]`: `stationX/stationY`,
built `containerId`, pending `containerSiteId`, cached path/distance fields, demand fields, and
`routeAccessible`.

## CreepMemory (types.d.ts)

Key interface `CreepMemory` extends Screeps default with all the fields above. Type union `CreepJobType`
enumerates all 19 job types. Type union `CreepArchetype` enumerates all 11 archetypes.

### Archetype assignment

`ensureArchetype(creep)` in `creep/capabilities.ts` infers from body parts:
- Has CLAIM → `claimer`
- Has HEAL → `doctor`
- Has WORK + CARRY + manual role → `remoteMaintainer`
- Has WORK + CARRY + harvester/builder/upgrader role → `worker`
- Has WORK + CARRY → `worker`
- Has CARRY only → `hauler`
- Has role `defender` with combat body → `defender`
- Fallback → `worker`

Miners, remote roles, and mineral miners must have `archetype` set explicitly at spawn time.

## RoomMemory (types.d.ts)

### RoomStructureMemory

Written by `room/structures.ts` when cache is stale (100 ticks) or structure counts change. Used
for persistence across server reboots — current code does NOT read from this cache at runtime (it
re-scans every tick).

### RoomLoadMemory

Written every tick by `rememberLoad()` in `room/controller.ts`. Snapshot of room state for debugging
and future optimization. Not currently read by any logic — purely diagnostic.

### RoomPlanMemory

Written every tick by `rememberPlans()` in `room/controller.ts`. Source and mineral plans persist
across server ticks for spawn planning continuity. `remoteRooms` is the user-facing configuration
interface for remote mining. `claimTargets` stores expansion targets.

## Memory Audit (memoryAudit.ts)

Runs on first tick after deploy (build commit hash changed). Auto-fixes:

| Issue | Fix |
|-------|-----|
| Orphaned room memory | Delete `Memory.rooms` entries not owned and not referenced |
| Stale remote plans | Clear expired `dangerUntil`, stale `skipReason`, old `lastSeenHostiles`, deleted source IDs |
| Duplicate source assignments | Keep miner with most WORK (then best TTL), unassign others |
| Orphaned source references | Clear `sourceId`/`assignedSourceId` pointing to non-existent sources |
| Stale travel memory | Reset stuck > 20 ticks |
| Invalid creep memory | Clear orphaned `remoteRoom`, `remoteStandby`, `scoutWanderRoom`, remote fields on non-remote creeps |

The audit is skipped when CPU bucket < 500. Can be manually invoked via `runMemoryAudit()` in console.
