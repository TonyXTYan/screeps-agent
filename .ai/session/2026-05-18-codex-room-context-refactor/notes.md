# Room context refactor session

## Goal

Start the broader Screeps architecture refactor with the lowest-risk extraction: move room context assembly out of `room.controller.ts` while preserving runtime behavior.

## Changes

- Added `src/room.context.ts` as the owner of `RoomControllerContext`, `SourcePlan`, `MineralPlan`, `buildContext()`, and source/mineral plan derivation.
- Updated `src/room.controller.ts` to import the context builder/types and keep orchestration, assignment, spawn planning, and remotes in place for now.
- Updated architecture/code-map docs so future agents know the new module boundary.

## Follow-ups

Recommended next slices:

1. Extract room memory/default initialization helpers.
2. Extract spawn planning from `room.controller.ts` into a dedicated module.
3. Introduce an action registry for `creep.jobRunner.ts`.
4. Extract the remote subsystem.
5. Add Memory-configured strategy selection once the room/spawn/job boundaries are smaller.
