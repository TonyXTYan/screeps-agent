# Movement caching inversion — Stage 1

Date: 2026-06-03 · Model: Opus 4.8 · Branch: RCL7/dev1

## Trigger
- Logs t≈71406045: remoteHaulers jammed at W7N9 east-exit funnel ([46–48,18–25]).
  `remoteHauler-Spawn2-71405677` fully wedged at [48,22], stuck 69→88→107→126.
- User observation: path visualization redraws every few ticks ⇒ wasted CPU.

## Root cause (confirmed vs docs)
- `moveTo` caches the path in `creep.memory._move` for `reusePath` ticks (API default 5).
- BUT default `ignoreCreeps: false` makes `moveTo` recompute the path whenever a creep
  sits on the next cached tile. On busy hauler highways that's almost every tick ⇒ the
  cache never survives ⇒ constant repaths (CPU) + visual flicker.
- Our movers used `ignoreCreeps:false` by default: `moveToJobTarget` (reusePath 10),
  `travelRoom` (reusePath 8), plus many raw `moveTo` sites (default 5).
- Secondary: `wanderRandomAdjacent` escape only checked terrain walls, not creeps, so the
  wedge never self-resolved in a packed corner.

## Change (Stage 1)
Inverted strategy = standard Traveler/cartographer pattern. We already had the negotiation
layer (`traffic.ts` swap/yield) and stuck detection.
- New constants in `room/constants.ts`: `MOVE_IGNORE_CREEPS_DEFAULT=true`,
  `MOVE_REUSE_PATH_TICKS=20`.
- `movement.ts:moveToJobTarget` + `jobRunner.ts:travelRoom`: normal travel ignores creeps
  with long reuse; stuck≥2 ⇒ traffic swap/yield then a creep-AVOIDING one-shot repath
  (reusePath 0, ignoreCreeps false); stuck≥4 ⇒ reset `_move` + escape ladder.
- `wanderRandomAdjacent`: skip creep/structure-occupied tiles (unwedge fix).

Cache-invalidation (user's "re-navigate if path no longer matches terrain") is largely
engine-handled: moveByPath off-path ⇒ ERR_NOT_FOUND ⇒ moveTo repaths; a new structure/site
on the next tile blocks the step ⇒ stuck detection ⇒ repath. Not separately coded.

## NOT done (deliberate)
- Stage 2: convert remaining raw `moveTo` positional sites (`creep/harvest.ts`,
  `room/remote/miners.ts`, `room/remote/haulers.ts`, `room/remote/fleet.ts`). Left short
  final-approach moves alone — avoiding creeps there is fine and keeps measurement clean.
- Home-hauler job flapping (deposit↔refill emergency-refill interrupt) — separate; deferred.

## Measurement gate (user asked: measure first) — RESULT: WIN
Deployed build c7426159 (~tick 71407175). Before vs after (remote dump `stuck=` samples):
- peak stuck: **1190 → 35** (the old [48,22] wedge eliminated; 35 was transient, resolved to 0)
- mean stuck: **260.5 → 5.3**
- `stuck≥30` events: **42 → 4** (all cleared)
- errors: **0**; CPU bucket still maxing to 10k → pixel mint (headroom intact)

## Stage 2 — EVALUATED, DECLINED
Remaining raw `creep.moveTo` sites don't warrant conversion:
- `remote/miners.ts:265` already `ignoreCreeps:true` (intentional aggressive station repath).
- `remote/miners.ts:319/329`, `remote/haulers.ts:188/207/255`, `fleet.ts:553` = short positional
  approaches (wait targets, spawn renew, scout wander) — avoiding creeps on the final step is
  correct; long-reuse caching offers ~nothing near the destination.
- `creep/harvest.ts` = legacy harvester role; its `ERR_NO_PATH`→`findOtherOption` (switch source)
  congestion branch would stop firing under `ignoreCreeps:true` (creeps become walkable). Risk > gain.
Central movers (`moveToJobTarget`, `travelRoom`) captured the win. Work complete.

Toggle = single constant (`MOVE_IGNORE_CREEPS_DEFAULT`), fully reversible.
