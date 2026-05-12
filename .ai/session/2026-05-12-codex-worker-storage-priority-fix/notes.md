# Worker Storage Priority Fix

## Summary
- Investigated report that worker creeps were not spending storage-backed energy on construction/refill.
- Root cause was priority ordering in `assignEnergySpendingJob` (`src/room.controller.ts`):
  - "guaranteed upgrader" branch ran before "guaranteed builder" branch.
  - In low-worker rooms, this could send the only worker to `upgrade`, starving construction.

## Code Change
- Reordered spending priorities so the guaranteed builder check runs before guaranteed upgrader:
  - `src/room.controller.ts` in `assignEnergySpendingJob`.
- Refill gate behavior was left unchanged:
  - workers may skip refill when storage exists and spawn/extension energy ratio is `>= 0.5`.

## Validation
- `npx tsc --noEmit` passed.

## Documentation
- Added a fixed-item entry in `.ai/memory/KNOWN_ISSUES.md` describing the regression and resolution.
