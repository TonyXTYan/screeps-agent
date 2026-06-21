# Claiming and Colony Setup: How It Works

## Overview

**There is no autonomous room selection.** The user always initiates targeting manually. Once configured, the bot handles spawning claimers, reserving/claiming the controller, and deploying remote workers.

The full process has four phases: **Configure → Scout → Claim → Harvest**.

---

## Phase 1: User Configures the Target Room

All expansion is user-driven via the console API (`src/main.ts:149-163`):

```js
remoteMining.activate('E1N1', 'E1N2')      // harvest mode (most common)
// or manually set in Memory:
Memory.rooms['E1N1'].plan.claimTargets = ['E1N2']   // explicit claim
```

`remoteMining.activate()` writes to `Memory.rooms[homeRoom].plan.remoteRooms[remoteRoom]` with `mode: 'harvest'`, `reserve: true`, `buildRoads: true`. There is no scanning of adjacent rooms or automatic target selection.

For explicit claiming (taking ownership), the user either:
- Adds the room name to `Memory.rooms[home].plan.claimTargets`
- Or sets `mode: 'claim'` on a `remoteRooms` entry

---

## Phase 2: Scouting (harvest mode only)

If the remote room's sources haven't been mapped yet, `remoteSpawnRequest()` (`src/room.controller.ts:2444`) spawns a `remoteScout`. The scout travels to the room and idles; once the room is visible, `updateRemoteRoomPlans()` (`src/room.controller.ts:1001`) fills in source positions, container sites, path data, and distance estimates.

For `reserve` / `claim` mode entries, no scout is spawned — the user is expected to already know the room.

---

## Phase 3: Claimer Spawn and Travel

`chooseSpawnRequest()` in `src/room.controller.ts` triggers claimer spawning via three paths:

| Trigger | Location | Body size | Mode |
|---|---|---|---|
| `claimTargets` list non-empty | line 2422 | up to 5 CLAIM parts | `'claim'` |
| `remoteRooms` entry with `mode: 'claim'/'reserve'` | line 2576 | 2–5 CLAIM parts | matches mode |
| Harvest remote reservation < 4000 ticks | line 2459 | 2 CLAIM parts (5 if < 500 ticks) | `'reserve'` |

**Body planning** (`src/creep.capabilities.ts:212-231`): `buildClaimerBody()` adds `[CLAIM, MOVE]` pairs (1300 energy each) up to the configured `maxClaimParts`. Reserve-mode claimers can use the full `energyCapacityAvailable` budget (`src/room.controller.ts:2122`).

The claimer first gets a `travelRoom` job. Once it arrives, `assignRemoteCreep()` (`src/room.controller.ts:255-258`) assigns the action job:

```ts
const jobType = creep.memory.remoteMode === 'reserve' ? 'reserveController' : 'claimController';
setJob(creep, jobType, creep.room.controller);
```

---

## Phase 4a: Reserving (harvest-mode remotes)

`reserveController` job (`src/creep.jobRunner.ts:292-301`) calls `creep.reserveController(controller)`. The claimer renews reservation indefinitely. This keeps the room neutral (unowned) so remote miners can work without controller decay.

---

## Phase 4b: Claiming (explicit ownership)

`claimController` job (`src/creep.jobRunner.ts:303-312`) calls `creep.claimController(controller)`. On success, Screeps sets the controller owner and RCL to 1. **This uses one GCL.**

**After claiming, the bot has no automated bootstrapping.** The newly claimed room only enters the full `roomController.run()` loop once it has a spawn. `ownedRooms()` returns rooms containing at least one `Game.spawns` entry — so the user must manually place a spawn construction site in the new room.

---

## Phase 5: Remote Workers Move In

Once the home room's `remoteRooms` entry is in `mode: 'harvest'`, `remoteSpawnRequest()` begins spawning:

- **`remoteMiner`** — one per source; travels to the room, static-mines at a container station
- **`remoteHauler`** — capacity-matched to income × round-trip distance; ferries energy back to home storage
- **`remoteMaintainer`** — spawned as needed for road/container upkeep

There is no dedicated "colonist" archetype. The same `remoteMiner` / `remoteHauler` archetypes used for reserved remotes are used for claimed rooms.

---

## Critical File Map

| Component | File | Key lines |
|---|---|---|
| Console API (`remoteMining.activate`) | `src/main.ts` | 149–163 |
| RemoteRoomPlan / claimTargets types | `src/types.d.ts` | 151–169 |
| updateRemoteRoomPlans (scout + path calc) | `src/room.controller.ts` | 1001–1130 |
| assignRemoteCreep (claimer job assignment) | `src/room.controller.ts` | 158–259 |
| claimTargets spawn trigger | `src/room.controller.ts` | 2422–2425 |
| Harvest-reserve spawn trigger | `src/room.controller.ts` | 2459–2476 |
| remoteRooms reserve/claim spawn trigger | `src/room.controller.ts` | 2576–2594 |
| buildClaimerBody | `src/creep.capabilities.ts` | 212–231 |
| reserveController job | `src/creep.jobRunner.ts` | 292–301 |
| claimController job | `src/creep.jobRunner.ts` | 303–312 |

---

## Gaps / Limitations

- **No autonomous room selection** — user must always specify target rooms
- **No post-claim bootstrapping** — after `claimController` succeeds, the user must manually place a spawn in the new room before the bot manages it
- **No colonist workers** — no archetype spawns into a newly claimed room to build the spawn
- **`updateRemoteRoomPlans` skips non-harvest modes** (`line 1011`) — `reserve`/`claim` mode entries get no source/path data computed automatically
