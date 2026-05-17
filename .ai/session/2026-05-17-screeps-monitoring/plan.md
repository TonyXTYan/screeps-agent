# Recovery Improvements Implementation Plan

## Summary

Implement focused recovery fixes from the `2026-05-17` log review: remote-hauler source affinity, local-hauler emergency refill priority, anti-idle delivery fallback, recovery reason logging, and a log regression checker.

## Key Changes

- Update `src/room.controller.ts` so remote haulers prefer their assigned source's container/station/dropped energy.
- Allow cross-source remote pickup only when the assigned source is effectively dry and the alternate target has a large overflow pile.
- Force local haulers carrying energy to refill spawn/extensions before deposit, withdraw, idle, build, repair, or upgrade while spawn/extension demand exists.
- Add anti-idle fallback for energy-carrying refill-capable creeps when spawn/extension demand exists.
- Add `energyRecoveryReason` to room memory and debug output so `recoveryPull=YES` explains whether it is held by spawn pressure, tower pressure, both, or none.
- Add `.ai/scripts/check-screeps-recovery-regressions.py` to parse Screeps console logs and flag known stuck patterns.

## Test Plan

- Run `npm run build`.
- Run the new checker against `screeps_console/logs/screeps_console_2026-05-17.json`.
- Confirm the checker reports historical bad windows and summarizes post-`5f626790` behavior.
- Inspect fresh logs after deploy for fewer local-hauler idle/deposit/withdraw samples during `demand=YES`, no unintended cross-source remote pickup, and visible `recoveryReason`.

## Assumptions

- Do not implement bootstrap spawn-mode changes in this pass.
- Do not tighten home-hauler renew thresholds unless new logs show renew is again the dominant stall cause.
- Keep recovery hysteresis thresholds unchanged; only add visibility and regression detection.
