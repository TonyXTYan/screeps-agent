# Remote Energy Mining Plan (W7N9 -> W8N9)

## Goal

Enable remote energy mining with one console activation call, then run the rest automatically:

```js
remoteMining.activate('W7N9', 'W8N9')
```

After activation, the bot should scout, plan paths, build remote infrastructure, spawn the right creeps, haul energy home, reserve when configured, and pause safely on danger.

## Console API Surface

Expose a small helper object from `src/main.ts`:

```js
remoteMining.activate(homeRoom, remoteRoom, options?)
remoteMining.pause(homeRoom, remoteRoom, ticks?)
remoteMining.disable(homeRoom, remoteRoom)
remoteMining.status(homeRoom, remoteRoom?)
```

Default `activate` options:

```js
{
  reserve: true,
  buildRoads: true,
  maintainRoads: true
}
```

Activation writes:

```js
Memory.rooms.W7N9.plan.remoteRooms.W8N9 = {
  enabled: true,
  roomName: 'W8N9',
  mode: 'harvest',
  reserve: true,
  buildRoads: true,
  maintainRoads: true
}
```

## Strategy Decisions

1. Use dedicated `remoteMiner + remoteHauler` as steady state.
2. Allow a short bootstrap phase when no container exists yet.
3. Build container + roads in neutral rooms (allowed by Screeps rules for room level 0 structures).
4. Compute source saturation and hauling demand from constants and path distance.
5. Keep remotes opt-in and always below local survival priorities.

## Saturation And Throughput Model

Per remote source:

- `sourceIncome = source.energyCapacity / ENERGY_REGEN_TIME`
- `workDemand = ceil(sourceIncome / HARVEST_POWER)`

Expected normal-source cases:

- Reserved/owned room: `3000 / 300 = 10 e/tick`, so `5 WORK`.
- Unreserved neutral room: `1500 / 300 = 5 e/tick`, so `3 WORK`.

Hauler demand per source:

- `roundTripTicks = pathDistance * 2`
- `haulerCapacityDemand = ceil(sourceIncome * roundTripTicks * 1.2)`

Spawn enough remote hauler carry capacity per source to avoid persistent container overflow.

Replacement timing:

- Spawn replacements before TTL runs out:
- `ticksToLive < spawnTime + oneWayTravelTicks + safetyBuffer`

## Remote Memory Design

Extend `RemoteRoomPlan` and room plan memory to include:

- Room-level:
  - `enabled`, `roomName`, `mode`
  - `reserve?: boolean`
  - `buildRoads?: boolean`
  - `maintainRoads?: boolean`
  - `dangerUntil?: number`
  - `lastScouted?: number`
  - `lastSeenHostiles?: number`
  - `skipReason?: string`
- Per-source plans:
  - `sourceId`
  - `stationX`, `stationY`
  - `containerId?`
  - `pathSerialized?`
  - `pathDistance?`
  - `workDemand`
  - `haulerCapacityDemand`
  - `assignedMinerWork`
  - `assignedHaulerCapacity`
  - `lastSeen`

## Behavior Flow

### 1) Discovery And Validation

- If remote is enabled and visible:
  - detect sources and controller state
  - reject/skip Source Keeper rooms for v1
  - detect invader core, hostile ownership/reservation, and hostiles
  - set `dangerUntil` when unsafe
- If path/source data is stale or missing, recompute.

### 2) Path Discovery

- Build path from home anchor (`storage`, fallback `spawn`) to each remote source station using `PathFinder`.
- Cache serialized path and distance in remote source memory.
- Refresh periodically or when route becomes invalid.

### 3) Infrastructure Planning

- Place one container construction site at each source station.
- If `buildRoads` is true, place road sites along cached path:
  - obey global construction-site cap
  - cap placements per tick
  - skip walls and blocked tiles
  - avoid noisy edge placement except valid exits

### 4) Spawn Planning

Per enabled remote source:

- `remoteMiner` demand from `workDemand`.
- `remoteHauler` demand from `haulerCapacityDemand`.
- `remoteMaintainer` when container/roads need build/repair.
- `claimer` only if reserve is enabled and reservation is low/missing.

All remote requests are per-room/per-source, not global pooled remote capacity.

### 5) Runtime Assignment

- `remoteMiner`:
  - travel to remote station
  - harvest assigned source
  - transfer/drop into source container
  - optionally repair/build adjacent container when practical
- `remoteHauler`:
  - collect from assigned source container or dropped energy
  - shuttle to home storage (fallback spawn/extensions if needed)
- `remoteMaintainer`:
  - build road/container sites first
  - repair remote roads/containers second
- `claimer`:
  - travel to remote controller
  - reserve controller

### 6) Danger Handling

- On hostile detection:
  - set `dangerUntil = Game.time + 1500`
  - stop spawning remote workers for that room
  - redirect active remote creeps to home room
- Ensure flee/retreat checks run before normal job execution for non-defenders.

## Local Priority Guardrails

Remote spawning must never outrank:

1. emergency recovery (no creeps)
2. local source miner coverage
3. spawn/extension refill and tower reserve protection
4. minimum local hauler capacity
5. minimum local worker throughput

## Code Changes By Module

- `src/types.d.ts`
  - extend remote memory interfaces for room-level settings and per-source data
- `src/main.ts`
  - expose `globalThis.remoteMining` console helpers
  - ensure flee/retreat ordering supports remote safety
- `src/creep.capabilities.ts`
  - add body planning for `remoteMaintainer` and `remoteScout` if used
- `src/room.controller.ts`
  - implement remote discovery, path caching, infrastructure planning
  - convert remote spawn demand to per-source accounting
  - remote role assignment logic and retreat handling
- `src/creep.jobRunner.ts`
  - only if new explicit job types are needed; otherwise reuse existing jobs
- `.ai/memory/STRATEGY.md`
  - update remote section with path+roads+per-source saturation policy
- `.ai/memory/CURRENT_ARCHITECTURE.md`, `.ai/memory/CODEMAP.md`, `.ai/memory/KNOWN_ISSUES.md`
  - align docs after implementation

## Test Plan

1. Static checks:
   - `npx tsc --noEmit`
   - `npm run build`
2. Functional:
   - activate one remote: `remoteMining.activate('W7N9', 'W8N9')`
   - verify memory config, source plans, path distance, road/container sites
   - verify miner/hauler/maintainer spawn and energy reaching W7N9 storage
3. Throughput:
   - verify reserved source targets `5 WORK`
   - verify unreserved source targets `3 WORK`
   - verify hauler capacity adjusts with path distance
4. Safety:
   - simulate hostiles and confirm pause + retreat + `dangerUntil`
5. Multi-remote:
   - enable two remotes and confirm per-source independent demand accounting

## Sources Used

- Screeps API reference (constants, pathfinder, construction, creep actions): `https://docs.screeps.com/api/`
- Screeps control guide (reservation behavior and RCL structure constraints): `https://docs.screeps.com/control.html`
- Screeps resources guide (remote energy context): `https://docs.screeps.com/resources.html`
- Screeps forum path and road ideas:
  - `https://screeps.com/forum/topic/2543/path-generating-with-existing-paths`
  - `https://screeps.com/forum/topic/2248/road-building-and-findpathto`
  - `https://screeps.com/forum/topic/2556/workflow-tips-and-prioritization-for-new-players`
