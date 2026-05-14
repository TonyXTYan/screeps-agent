# Terminal Energy Reserve Policy

## Summary
- Implemented terminal energy reserve targets by room controller level:
  - RCL 6: `5000`
  - RCL 7: `10000`
  - RCL 8: `50000`
- Added emergency override so terminal reserve can be spent when the room is under refill pressure:
  - Any spawn/extension deficit, or
  - Any tower below the existing 70% reserve threshold.

## Code Changes
- Updated `src/room.controller.ts`:
  - Added reserve/recovery helpers:
    - `terminalEnergyReserveTarget`
    - `roomNeedsEnergyRecovery`
    - `terminalWithdrawableEnergy`
    - `terminalEnergyReserveDeficit`
  - Enforced reserve-aware terminal withdrawals in both:
    - `energyWithdrawalTarget`
    - `currentJobStillValid` (`withdrawEnergy` branch)
  - Added proactive reserve refill behavior:
    - `energyDepositTarget` now prioritizes terminal when below reserve in non-recovery mode
    - local haulers can pull from storage specifically to refill terminal reserve.

## Validation
- `npm run build` passed after implementation.

## Documentation
- Updated `architecture/ECONOMY.md` with terminal reserve and emergency-withdraw semantics.
- Updated `.ai/memory/CODEMAP.md` with the new terminal reserve behavior in the core economy mapping.
