# Remote Mining Console Guide

This bot exposes `remoteMining` helpers on `globalThis` from `src/main.ts`.

Use these in the Screeps console to configure and control remote mining.

## Functions

### `remoteMining.activate(homeRoom, remoteRoom, options?)`

Enable remote harvesting from `remoteRoom` for `homeRoom`.

```js
remoteMining.activate('W7N9', 'W8N9')
```

Optional `options`:

- `reserve` (default `true`): allow spawning reservers for the remote controller.
- `buildRoads` (default `true`): place road construction sites on discovered paths.
- `maintainRoads` (default `true`): allow remote maintainers and maintenance flow.
- `debugPaths` (default `false`): render `moveTo` paths in role/archetype colors for creeps assigned to that remote and creeps currently inside that remote room.
- `debugCreeps` (default `false`): print per-creep status for this remote every 10 ticks (see `debug.trackRemote()` in `DEBUG_CONSOLE.md`).

Example:

```js
remoteMining.activate('W7N9', 'W8N9', {
  reserve: true,
  buildRoads: true,
  maintainRoads: true,
  debugPaths: true
})
```

### `remoteMining.configure(homeRoom, remoteRoom, options?)`

Update existing remote settings without recreating the entry.

```js
remoteMining.configure('W7N9', 'W8N9', {
  debugPaths: true
})
```

Debug helpers for remote and home creep status are on the `debug` API (see `console/DEBUG_CONSOLE.md`):

- `debug.trackRemote(homeRoom, remoteRoom, on?)` — toggle periodic status logging (equivalent to setting `debugCreeps: true` in the remote plan)
- `debug.dumpRemote(homeRoom, remoteRoom)` — one-shot remote creep snapshot
- `debug.dumpHome(homeRoom)` — one-shot home room creep snapshot

### `remoteMining.pause(homeRoom, remoteRoom, ticks?)`

Temporarily pauses a remote by setting `dangerUntil`.

```js
remoteMining.pause('W7N9', 'W8N9')       // default 1500 ticks
remoteMining.pause('W7N9', 'W8N9', 400)  // custom duration
```

### `remoteMining.disable(homeRoom, remoteRoom)`

Disables the remote plan (`enabled = false`).

```js
remoteMining.disable('W7N9', 'W8N9')
```

### `remoteMining.status(homeRoom, remoteRoom?)`

Read current remote config and learned remote-source data.

```js
remoteMining.status('W7N9')          // all remotes for home room
remoteMining.status('W7N9', 'W8N9')  // one remote room
```

`status(...)` returns a JSON string (pretty-printed), so the console displays readable text rather than `[object Object]`.

## What Becomes Automatic After Activation

1. Scout bootstrap when source metadata is unknown.
2. Per-source demand calculation:
   - miner work demand from source capacity/regen
   - hauler capacity demand from path distance
3. Container site placement near remote sources.
4. Gradual road construction along discovered paths in non-owned rooms only.
5. Spawning and assignment for:
   - `remoteMiner`
   - `remoteHauler` (`CARRY`+`MOVE` triads + `WORK`+`MOVE`, unless minimal `[CARRY, MOVE]` fallback)
   - `remoteScout` (overflow scouts wander to avoid blocking spawn exits)
   - `remoteMaintainer`
   - `claimer` for reserve mode (targeting at least 2 `CLAIM` parts)
6. Danger pause/retreat behavior when `dangerUntil` is active.
7. Optional path visualization (`debugPaths: true`) with role-coded colors for creeps involved in/inside that remote.

## Memory Shape (Reference)

`activate` writes under:

```js
Memory.rooms[homeRoom].plan.remoteRooms[remoteRoom]
```

Initial shape:

```js
{
  enabled: true,
  roomName: 'W8N9',
  mode: 'harvest',
  reserve: true,
  buildRoads: true,
  maintainRoads: true,
  debugPaths: false,
  debugCreeps: false
}
```

Runtime fields are then filled automatically (for example `lastScouted`, `dangerUntil`, `sources[sourceId]`, path distance, container id, demand counters).

## Quick Start For `W7N9 -> W8N9`

```js
remoteMining.activate('W7N9', 'W8N9')
remoteMining.status('W7N9', 'W8N9')
```

If you need to halt temporarily:

```js
remoteMining.pause('W7N9', 'W8N9', 1000)
```

If you want to turn it off:

```js
remoteMining.disable('W7N9', 'W8N9')
```

## Danger / Invader Events

Two sources can trigger danger events, each with different clearing behaviour:

**Direct danger** — hostiles detected inside the remote room itself (planning scan).
The lockout window is `ceil(longestHostileTTL × 1.1)`, capped at 1500 ticks.
For InvaderCores the TTL comes from `ticksToCollapse`; for hostile creeps from `ticksToLive`; for
hostile controller ownership a fixed 1500 is used. The window is set once at first detection and
can only extend (never shorten) on subsequent ticks:
```
[REMOTE-DANGER] t=71219200 W9N9: invaderCore detected — dangerUntil=71219990 (~726t)
[REMOTE-DANGER] t=71219200 W9N9: hostiles=2 detected — dangerUntil=71220480 (~1236t)
[REMOTE-DANGER] t=71219200 W9N9: hostileControl detected — dangerUntil=71220700 (~1500t)
```
Cleared immediately once the room is confirmed safe (visible + no hostiles):
```
[REMOTE-DANGER] t=71220800 W9N9: cleared — resuming harvest
```

**Transit danger** — a creep assigned to room B encountered hostiles while passing through room A on its way there:
```
[REMOTE-DANGER] t=71219200 W9N9: creep-retreat detected — dangerUntil=71220700 (~1500t)
[REMOTE-DANGER] t=71219200 W9N8: transit-blocked via W9N9 — dangerUntil=71220700 (~1500t)
```
W9N9 clears as above (direct danger). W9N8 does **not** clear early even when W9N8 itself is safe — its `dangerUntil` timer must expire first to prevent creeps from bouncing back through the hostile transit room:
```
[REMOTE-DANGER] t=71220800 W9N8: transit-block expired — resuming harvest
```

While the lockout is active the `[REMOTE]` status header includes a warning:

```
[REMOTE] t=71219250 W9N9 (home: W7N9):  ⚠ DANGER until=71220700 (~1450t)
```

### What happens during danger lockout

- All creeps assigned to the remote room are routed home via `travelRoom`.
- No new miners, haulers, maintainers, or claimers are spawned for the room.
- Road/container planning for the room is suspended for that tick.
- Direct danger lockout is sized to the threat (`ceil(TTL × 1.1)`, max 1500t); set once at first sighting and only extended if a longer-lived hostile appears. Clears immediately when the room is confirmed safe.
- Transit danger resets to `now + 1500` each time a creep retreats through the transit room; only the timer expiry resumes the room (prevents bounce loops).

### Manually clearing or extending danger

```js
// Check current danger state
remoteMining.status('W7N9', 'W9N9')   // shows dangerUntil in the output

// Force-resume immediately (set dangerUntil to 0)
Memory.rooms['W7N9'].plan.remoteRooms['W9N9'].dangerUntil = 0

// Extend manually (e.g. 3000 more ticks)
Memory.rooms['W7N9'].plan.remoteRooms['W9N9'].dangerUntil = Game.time + 3000

// Use the built-in pause helper (default 1500 ticks)
remoteMining.pause('W7N9', 'W9N9', 3000)
```

## Troubleshooting

- `remoteMining is undefined`:
  - wait for your code to run one tick after deploy (helper is installed in `loop()`).
- `status(...)` returns `null`:
  - remote not configured yet; run `activate(...)`.
- Remote has config but no source details yet:
  - bot needs visibility in that remote room before it can discover sources/paths.
- Remote roads are not being placed:
  - roads are intentionally skipped in owned rooms; automatic remote road placement is for non-owned rooms.
- Want a specific road or container to decay (can't destroy at RCL 0):
  - place a `DONOT_MAINTAIN` flag on its tile — see `console/FLAGS_CONSOLE.md`.
