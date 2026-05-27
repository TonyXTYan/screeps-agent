# Deprecated: Defender Role

## What It Was

The `defender` archetype was an emergency hostile-response creep. Spawned reactively when
armed hostile creeps appeared in a room (target = `ceil(hostiles * 1.5)`). Used an
attack+ranged-attack body sized by `creep/roleBalance.ts:balanceSpec()`. Rallied to a
spawn in peacetime; charged hostiles when `attacking=true`.

**Modules (deleted):**
- `src/role/defender.ts` — per-creep FSM (attack or rally-to-spawn for renew)
- `src/creep/populationControl.ts` — reactive spawn logic (`checkDefenders`)
- `src/creep/roleBalance.ts` — proportional body scaler (`balanceSpec`); also scaled legacy hauler/worker bodies

**Memory fields used:**
- `role: 'defender'`, `archetype: 'defender'`
- `attacking?: boolean` — attack vs. rally mode toggle
- `rallySpawnId?: string` — spawn to rally to (field retained in `CreepMemory` interface for schema compatibility)

## Why It Was Replaced

Superseded by the `patrol` archetype, which provides:
- Baseline sizing (`ceil(enabledRemotes / 2)`) + threat surge, not reactive-only spawning
- Coordinated multi-room threat assignment
- Remote room rotation and peacetime controller loiter
- Renew FSM with threat-aware re-engagement thresholds
- Armed-hostile fail-safe (retreat + spawn block for non-combat remote creeps)

`populationControl.ts` was disconnected from the `main.ts` loop when the patrol system
was introduced; `role/defender.ts` was likewise never called from the loop after that point.

## Migration Path

Two guards converted surviving `defender` creeps to `patrol`:

1. **Per-tick guard** — `src/creep/memoryManagement.ts:migrateLegacyDefenseMemoryEntries()`:
   ran every tick until `Memory.legacyDefenseMigrationDone = true`. Rewrote `role` + `archetype`,
   cleared `attacking` + `rallySpawnId`. **Removed in this cleanup.**

2. **Per-deploy audit** — `src/memoryAudit.ts:migrateLegacyDefenseRoles()`:
   runs unconditionally on every build commit change. **Still active** as the authoritative
   safety net. Uses `(memory.archetype as string) === 'defender'` cast to handle pre-type-union
   memory entries.

## Files Deleted

| File | Reason |
|------|--------|
| `src/role/defender.ts` | Never imported from main loop after patrol replaced it |
| `src/creep/populationControl.ts` | Never called from main loop; replaced by patrol spawn in `room/remote/spawn.ts` |
| `src/creep/roleBalance.ts` | Only imported by `populationControl.ts`; no other callers |

## Scattered References Removed

| File | Change |
|------|--------|
| `src/creep/memoryManagement.ts` | Removed per-tick migration call + function definition |
| `src/creep/capabilities.ts` | Removed `role==='defender' → 'patrol'` inference guard |
| `src/creep/traffic.ts` | Removed `archetype === 'defender'` from priority check |
| `src/room/controller.ts` | Removed `role !== 'defender'` from `assignJobs` filter |
| `src/room/spawn.ts` | Removed `archetype === 'defender'` from tracked-separately branch |
| `src/main.ts` | Removed `defender` from `ROLE_PATH_COLORS` |
| `src/types.d.ts` | Removed `'defender'` from `CreepArchetype` union |
| `src/memoryAudit.ts` | Added `as string` cast on `memory.archetype` comparison (intentional legacy guard) |

## What Was Retained

- `src/memoryAudit.ts:migrateLegacyDefenseRoles()` — runs on each deploy; guards against
  any pre-migration memory still present on the live server
- `Memory.legacyDefenseMigrationDone` in `src/types.d.ts` — retained while `memoryAudit.ts`
  references it
- `rallySpawnId` in `CreepMemory` interface — may exist in live memory on migrated patrol creeps;
  harmless; patrol code ignores it
