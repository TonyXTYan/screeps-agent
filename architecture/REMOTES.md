# Remote Mining Architecture

## Opt-In Model

Remote operations are **never automatic**. The user must explicitly configure them via Memory or the
`remoteMining` console API:

```js
remoteMining.activate('W7N9', 'W8N9', {
  reserve: true,
  buildRoads: true,
  maintainRoads: true
})
```

This writes to `Memory.rooms.W7N9.plan.remoteRooms.W8N9`.

## RemoteRoomPlan Schema

```
enabled: boolean
roomName: string
mode: 'harvest' | 'reserve' | 'claim'
reserve?: boolean          (default true in harvest mode)
buildRoads?: boolean       (default true)
maintainRoads?: boolean    (default true)
debugPaths?: boolean       (default false)
debugCreeps?: boolean      (default false)
dangerUntil?: number       (set when hostiles detected)
lastScouted?: number
lastSeenHostiles?: number
skipReason?: string
sources?: {
  [sourceId: string]: {
    sourceId, stationX, stationY, containerId, containerSiteId,
    pathSerialized, pathDistance, pathUpdatedAt,
    workDemand, haulerCapacityDemand,
    assignedMinerWork, assignedHaulerCapacity, lastSeen,
    routeHealth, lastStallAt, stallCount,
    lastStallX, lastStallY, lastStallRoom,
    roadCursor, lastRoadPlanAt, lastHarvestedAt
  }
}
```

## Remote Creep Archetypes

| Archetype | Role |
|-----------|------|
| `remoteScout` | Explores unvisited remote rooms, discovers sources and paths |
| `remoteMiner` | Static miner assigned to a specific source |
| `remoteHauler` | Transports energy from remote containers back to home room |
| `remoteMaintainer` | Builds & repairs roads and containers in the remote room |
| `claimer` | Reserves or claims the remote controller |

## Remote Spawn Flow

`remoteSpawnRequest()` in `src/rooms/spawning/remote.ts` orchestrates per-remote mode flow, with
harvest-mode demand flow in `src/rooms/spawning/remoteHarvest.ts` and per-source/standby demand in
`src/rooms/spawning/remoteHarvestSourceDemand.ts`:

```
For each configured remote room:
  ├─ Home economy gate?      → skip non-critical remote spawns
  ├─ No source data?          → spawn remoteScout
  ├─ Mode: harvest, needs reserve? → spawn claimer (min 2 CLAIM)
  ├─ Active miner TTL <= 200? → spawn remoteMiner (remoteStandby=true, source-targeted)
  ├─ For each known source:
  │   ├─ Miner work deficit?  → spawn remoteMiner (respect per-source active slot cap)
  │   ├─ Hauler cap deficit?  → spawn remoteHauler (max 2/source)
  ├─ Needs maintenance?       → spawn remoteMaintainer
  └─ Mode: reserve/claim?     → spawn claimer
```

Remote spawning is conservative when the home room is under pressure:
- If stored energy is below 2k, or available spawn/extension energy is below 50%, only scouts, zero-coverage emergency remote miners without source-less standby debt, and degraded-route maintainers are allowed.
- If stored energy is below 5k, new income-consuming remote spawns are limited to the first enabled harvest remote.
- Remote haulers are also suppressed while existing haulers for that remote show route congestion.

Remote room discovery, danger marking, and remote planning orchestration live in
`src/rooms/remotes/planning.ts`. Source path planning, container-site placement, road-site
placement scheduling, and per-source hauler capacity demand updates live in
`src/rooms/remotes/remotePlanningSources.ts`.
Per-source remote workforce coverage, replacement horizons, and idle-hauler detection live in
`src/rooms/remotes/remoteCoverageProjections.ts`. Source station/static-mining policy and miner
slot-capping helpers live in `src/rooms/remotes/remoteSourceStations.ts`; `src/rooms/remotes/coverage.ts`
is kept as compatibility exports. Home-room fleet enumeration and role-count helpers live in
`src/rooms/remotes/fleet.ts`; standby-replacement helpers live in `src/rooms/remotes/fleetStandby.ts`.
Remote miner station stall tracking lives in `src/rooms/remotes/minerStation.ts`; route-health mutation
and station-failure handling live in `src/rooms/remotes/remoteRouteHealth.ts`.
Per-creep remote assignment orchestration (shared remote plan checks, remote travel gating, infrastructure
build assignment, and claimer assignment) lives in `src/rooms/remotes/assignment.ts`; role-specific
remote scout/miner/maintainer/fallback routing helpers live in `src/rooms/remotes/assignmentRoles.ts`;
overflow remote-scout wander routing lives in `src/rooms/remotes/scoutOverflow.ts`.

## Hauler Capacity Model

Hauler demand is computed per source:

```
haulerCapacityDemand = min(
  2500,
  ceil((source.energyCapacity / ENERGY_REGEN_TIME) * pathDistance * 2 * 1.2)
)
```

- The **2500 cap** bounds distance-weighted demand for far remotes
- **Max 2 haulers per source** regardless of distance
- Body uses CARRY+MOVE triads + WORK+MOVE (unless minimal [CARRY, MOVE] fallback); WORK enables opportunistic remote maintenance
- Scaled hauler bodies must still be useful: at least 600 energy, and up to 900 energy when needed to cover 40% of source demand.

Remote miners normally wait for a body that meets the source work demand. If a source has zero active miner coverage, an emergency minimum miner is allowed so the source can restart.

## Remote Miner Slot Caps

- Active remote miners are slot-capped per source to avoid static-mining deadlocks.
- Sources with a built container, pending container construction site, or fixed station tile allow **1 active miner**.
- Non-static sources allow up to **2 active miners** (terrain/access permitting).
- If all source slots are full, extra remote miners are pushed into standby flow instead of crowding source stations.
- A remote miner already parked on its container prioritizes `harvestSource` and does not take auxiliary remote build jobs from that position.

## Hauler Target Selection

Remote energy target orchestration (`findRemoteEnergySource`, target-path gating, stuck-target retarget
memory) lives in `src/rooms/remotes/energy.ts`; per-source container/drop target enumeration and
source-energy accounting live in `src/rooms/remotes/energySourceTargets.ts`; assigned-source container
preference and cross-source overflow selection live in `src/rooms/remotes/energyTargets.ts`; target
claim/access checks live in `src/rooms/remotes/energyClaims.ts`; shared target-picking helpers live in
`src/rooms/remotes/remoteEnergyTargetPicker.ts`; remote-hauler pickup/return/top-up orchestration lives in
`src/rooms/remotes/haulerCycle.ts`; home-side delivery helpers live in
`src/rooms/remotes/haulerHomeDelivery.ts`; renew-cycle helpers live in
`src/rooms/remotes/haulerHomeRenewal.ts`; home-idle/wander helpers live in
`src/rooms/remotes/haulerHomeIdle.ts` (with compatibility exports in
`src/rooms/remotes/haulerHome.ts`).

- Empty remote haulers prefer energy at their assigned source first: assigned container/station drops are selected before cross-source work.
- Cross-source pickup is reserved for overflow: the assigned source must be effectively dry and the alternate source must have a large available pile/container.
- After a dropped pickup, if still not full, remote haulers top up from assigned source containers first; overflow capture follows the same cross-source guard.
- Remote haulers no longer require a 50% mining-site pickup threshold; they keep topping up toward full load unless far-pickup return logic triggers.
- Candidate energy is reduced by in-flight remote-hauler claims before selection.
- Per-target assignment is decongested with an access-tile-aware soft cap (up to 2 empty haulers per target).
- If a hauler remains stuck on one tile for 4+ ticks while on `withdrawEnergy`/`pickupEnergy`, it temporarily avoids its current target and retargets.
- If the selected pickup target is path-length far (>100 steps) and the hauler is already at least 75% full, it returns home instead of detouring for more.
- Remote haulers still attempt pass-by maintenance while moving: if they have a WORK part and energy, `src/creeps/jobs/sideEffects.ts` opportunistically builds/repairs targets already within range 3 without detouring from haul jobs.
- Remote maintainers keep their current road/container construction target to avoid two-tick oscillation between equal-priority sites, and only choose a new target when the current one is no longer a valid construction site.

## Path Caching

Paths from home storage/spawn to each remote source station are cached to avoid re-pathing every tick:

```
1. PathFinder.search() → path + distance
2. Serialize to JSON: [[x,y,roomName], ...]
3. Store in sourcePlan.pathSerialized
4. Refresh every 5000 ticks (REMOTE_PATH_REFRESH_INTERVAL)
5. If PathFinder returns incomplete, fall back to linear distance × 50
6. Incomplete paths retry quickly (about 100 ticks vs 5000)
```

Remote station validation also checks for a complete local path from the home-to-remote entry edge to
the station. Long/winding but complete local paths remain valid; only incomplete local paths mark the
source inaccessible. If a miner repeatedly remains on the same tile with no fatigue while out of
harvest range, the source route is marked `degraded` and its cached path is preserved for road-site
placement instead of clearing the source assignment or making the miner source-less standby. The route
returns to `healthy` when a miner reaches harvest range or harvests successfully.

Remote path serialization and station selection live in `src/rooms/remotes/pathing.ts`; miner station
stall tracking and route-health mutation live in `src/rooms/remotes/minerStation.ts`.

## Infrastructure Placement

### Containers
Placed adjacent to remote source stations when a station tile exists and no container is present. Pending
container construction sites are tracked as `containerSiteId` and treated as static mining stations for
miner caps/body planning, but haulers only withdraw from built `containerId` containers.

### Roads
Placed along discovered paths at `REMOTE_ROAD_SITES_PER_TICK` (4) sites per tick. Healthy routes are
capped at `REMOTE_MAX_UNFINISHED_ROAD_SITES` (3) unfinished road sites; degraded routes can queue up
to `REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES` (8). Road placement prioritizes remote exit-adjacent
tiles, swamp tiles, the latest stall tile, then the remaining cached path via `roadCursor`. Tiles
`1` and `48` are valid corridor road positions; true room borders `0` and `49` are skipped. Roads are
**skipped in owned rooms** so manual base layouts are preserved.

Road/container construction-site targeting for remote creeps lives in `src/rooms/remotes/infrastructure.ts`;
bulk road-site placement mechanics live in `src/rooms/remotes/roads.ts`, scheduled by
`src/rooms/remotes/planning.ts`.

## Danger Handling

When a remote room is visible and contains armed hostiles, an invader core, or hostile controller control/reservation:

```
1. remote.lastSeenHostiles = Game.time
2. remote.dangerUntil = Game.time + 50 ticks
3. remote.skipReason = 'danger'
4. Remote creeps see dangerUntil and travel back to home room
5. Spawning for this remote is skipped while danger is active
6. After 50 ticks, if no hostiles remain, danger clears
```

## Remote Creep Lifecycle

### Renewal
Remote maintainers (not miners, not claimers) can renew at the home spawn:
- `renewStartTtl = max(220, oneWayDistance + 80)`
- `renewStopTtl = min(1500, renewStartTtl + 140)`
- Creep switches to `remoteRenewing = true` below start threshold
- Travels home, queues at spawn, returns to work when above stop threshold

Generic non-hauler remote renewal lives in `src/rooms/remotes/renewal.ts`; the remote-hauler-specific
post-trip renew cycle lives in `src/rooms/remotes/haulerHomeRenewal.ts` and is orchestrated by
`src/rooms/remotes/haulerCycle.ts`.

### Remote Hauler Cycle
- Default cycle: travel to remote room → gather energy/resources and top up toward full load → return to home room → deposit to storage (terminal/emergency sinks only when storage unavailable/full) → repeat.
- Post-trip renew is conditional: after a delivery trip, renew only if `TTL < 1000`, and renew until `TTL > 1400`.
- Home-room energy pressure can defer starting a new remote-hauler renew cycle, but once a renew cycle starts the hauler waits next to a spawn and continues renewing until `TTL > 1400`.
- If no remote pickup targets are found, the hauler returns home and idles there for a short recheck window instead of idling in the remote room.
- During this no-job idle window, the hauler wanders at least 6 tiles away from the home spawn and only enters renew mode when TTL drops below 500 (renews to >1400 once started).

### Miner Replacement (Standby Dispatch)
- Remote miners do not renew at the home spawn
- When an active remote miner for a source reaches TTL <= 200, a source-targeted `remoteStandby` replacement is spawned
- Source-targeted standby miners count as replacement coverage, so active deficit spawning does not bypass them
- Source-less standby miners block additional active deficit remote-miner spawns until they are reassigned or expire
- Standby routing is evaluated before generic outbound remote travel
- Source-less standby miners are reassigned to uncovered accessible sources before idling at home
- While incumbent is alive, standby pre-positions in the remote room near the mining site (range 4-10)
- Once the incumbent dies, standby is promoted and takes over that source

Standby replacement helper logic lives in `src/rooms/remotes/fleetStandby.ts`; standby miner source
handoff and pre-positioning live in `src/rooms/remotes/standbyMiner.ts`.

## Console API

Exposed on `globalThis.remoteMining` (installed by `main.ts`):

```
remoteMining.activate(homeRoom, remoteRoom, options?)   — enable remote
remoteMining.configure(homeRoom, remoteRoom, options?)  — update settings
remoteMining.pause(homeRoom, remoteRoom, ticks?)         — temporary pause
remoteMining.disable(homeRoom, remoteRoom)               — disable
remoteMining.status(homeRoom, remoteRoom?)               — show config/data
```

Debug helpers on `globalThis.debug`:

```
debug.trackRemote(homeRoom, remoteRoom, on?)             — periodic logging
debug.dumpRemote(homeRoom, remoteRoom)                   — one-shot status
debug.dumpHome(homeRoom)                                 — home room status
```

Remote miner debug output includes `stnR` (range to station) and `stnP` (same-room path length to the
station) while a miner is harvesting with `stationX/stationY`.
