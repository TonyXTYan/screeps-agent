# Defender Role Cleanup Plan

## Context

The `defender` archetype and its supporting modules (`populationControl.ts`, `roleBalance.ts`) were replaced by the `patrol` system. The files still exist on disk but are fully disconnected from the runtime loop — neither is imported by `main.ts`. A one-time memory migration in `memoryAudit.ts:migrateLegacyDefenseRoles()` (runs on every deploy) handles any surviving `role='defender'` entries. This cleanup removes the dead files and all scattered references.

---

## Files to Delete (3)

- `src/role/defender.ts`
- `src/creep/populationControl.ts`
- `src/creep/roleBalance.ts` — only imported by `populationControl.ts`, no other callers

---

## Source File Edits (8)

### `src/creep/memoryManagement.ts`
- Remove the `migrateLegacyDefenseMemoryEntries();` call from `run()` (currently line 4 of the function body)
- Delete the entire `migrateLegacyDefenseMemoryEntries()` function definition (lines 59–85)
- The per-deploy migration in `memoryAudit.ts:migrateLegacyDefenseRoles()` covers this; the per-tick version is redundant

### `src/creep/capabilities.ts`
- Delete line 102: `if (creep.memory.role === 'defender') { return 'patrol'; }`
- No live creep will have `role='defender'` after `memoryAudit.ts` runs on deploy

### `src/creep/traffic.ts`
- Line 102: `if (archetype === 'patrol' || archetype === 'defender' || job === 'heal')`  
  → `if (archetype === 'patrol' || job === 'heal')`

### `src/room/controller.ts`
- Line 606: `.filter((creep) => !creep.spawning && creep.memory.role !== 'patrol' && creep.memory.role !== 'defender')`  
  → `.filter((creep) => !creep.spawning && creep.memory.role !== 'patrol')`

### `src/room/spawn.ts`
- Line 155: `else if (archetype === 'doctor' || archetype === 'claimer' || archetype === 'defender' || archetype === 'patrol')`  
  → `else if (archetype === 'doctor' || archetype === 'claimer' || archetype === 'patrol')`

### `src/main.ts`
- Lines 53–54: remove `defender: '#ef4444'` from `ROLE_PATH_COLORS`; remove trailing comma from the now-last `manual` entry

### `src/types.d.ts`
- Line 25: delete `'defender' |` from the `CreepArchetype` union

### `src/memoryAudit.ts` ⚠️ (discovered via build)
- Removing `'defender'` from `CreepArchetype` causes a TS error on the existing comparison `memory.archetype === 'defender'`
- Fix: change line 43 from:
  ```typescript
  if (memory.role === 'defender' || memory.archetype === 'defender') {
  ```
  to:
  ```typescript
  if (memory.role === 'defender' || (memory.archetype as string) === 'defender') {
  ```
  The `as string` cast is intentional — the audit protects against legacy in-memory data that predates the type system

---

## Documentation Edits

### `.ai/project-instructions.md`
- Entry point description: remove "emergency defender population control →" from the tick-loop order
- Module list: delete bullets for `creep/populationControl.ts`, `creep/roleBalance.ts`, and `role/defender`
- Key patterns: delete bullet for `creep/roleBalance.ts:balanceSpec(spec, energy)`

### `architecture/OVERVIEW.md`
- Source map: remove lines for `roleBalance.ts`, `populationControl.ts`, `role/defender.ts`
- Key type unions note: update to remove `defender` as a compatibility value

### `architecture/POPULATION_CAPS.md`
- Remove historical line: "Emergency defender spawn override is retired."

### `architecture/MEMORY.md`
- Update `rallySpawnId` note: remove "Legacy defender rally point (migration compatibility)"
- Remove any bullet noting `role='defender' → 'patrol'` as a live migration
- Memory audit table: clarify that the `defender → patrol` audit runs unconditionally on each deploy

### `.ai/memory/CODEMAP.md`
- Source map: remove lines for `roleBalance.ts`, `populationControl.ts`, `role/defender.ts`
- Notes: update archetype union description (remove `defender`); replace stale note about retained-but-dead files

---

## New File: `architecture/depreciated/defender-role.md`

Document the full history and deletion record (see content below).

---

## Verification

1. `npm run build` — must compile with zero errors; the `as string` cast in `memoryAudit.ts` resolves the type narrowing error
2. `grep -rn "'defender'" src/` — only `memoryAudit.ts` should remain (the intentional `as string` cast line)
3. `grep -rn "populationControl\|roleBalance\|role/defender" src/` — zero matches
4. `codegraph sync` — update symbol index

---

## Deprecation Note Content

File: `architecture/depreciated/defender-role.md`

```markdown
# Deprecated: Defender Role

## What It Was

The `defender` archetype was an emergency hostile-response creep. Spawned reactively when
armed hostile creeps appeared in a room (target = `ceil(hostiles * 1.5)`). Used an
attack+ranged-attack body sized by `creep/roleBalance.ts:balanceSpec()`. Rallied to a
spawn in peacetime; charged hostiles when `attacking=true`.

**Modules (now deleted):**
- `src/role/defender.ts` — per-creep FSM (attack or rally-to-spawn for renew)
- `src/creep/populationControl.ts` — reactive spawn logic
- `src/creep/roleBalance.ts` — proportional body scaler; also scaled legacy harvester/builder bodies

**Memory fields used:**
- `role: 'defender'`, `archetype: 'defender'`
- `attacking?: boolean` — attack vs. rally mode toggle
- `rallySpawnId?: string` — spawn to rally to

## Why It Was Replaced

Superseded by the `patrol` archetype, which provides:
- Baseline sizing (`ceil(enabledRemotes / 2)`) + threat surge, not reactive-only spawning
- Coordinated multi-room threat assignment
- Remote rotation and peacetime loiter
- Renew FSM with threat-aware re-engagement
- Armed-hostile fail-safe (retreat + spawn block for non-combat remote creeps)

## Migration Path

Two migration guards converted surviving `defender` creeps to `patrol`:

1. **Per-tick guard** — `src/creep/memoryManagement.ts:migrateLegacyDefenseMemoryEntries()`:
   ran every tick until `Memory.legacyDefenseMigrationDone=true`. Rewrote `role` + `archetype`,
   cleared `attacking` + `rallySpawnId`. **Removed in this cleanup.**

2. **Per-deploy audit** — `src/memoryAudit.ts:migrateLegacyDefenseRoles()`:
   runs on every build commit change. Still active as the authoritative migration guard.

## Files Deleted

| File | Reason |
|------|--------|
| `src/role/defender.ts` | Never imported from main loop after patrol replaced it |
| `src/creep/populationControl.ts` | Never called from main loop; replaced by patrol spawn in `room/remote/spawn.ts` |
| `src/creep/roleBalance.ts` | Only imported by `populationControl.ts`; no other callers |

## Scattered References Removed

| File | Change |
|------|--------|
| `src/creep/memoryManagement.ts` | Removed per-tick migration call + function |
| `src/creep/capabilities.ts` | Removed `role==='defender'→'patrol'` inference guard |
| `src/creep/traffic.ts` | Removed `archetype==='defender'` from priority check |
| `src/room/controller.ts` | Removed `role!=='defender'` from assignJobs filter |
| `src/room/spawn.ts` | Removed `archetype==='defender'` from tracked-separately branch |
| `src/main.ts` | Removed `defender` from `ROLE_PATH_COLORS` |
| `src/types.d.ts` | Removed `'defender'` from `CreepArchetype` union |
| `src/memoryAudit.ts` | Added `as string` cast on `memory.archetype` comparison (type safety) |

## What Was Retained

- `src/memoryAudit.ts:migrateLegacyDefenseRoles()` — still runs on deploy; guards against
  any pre-migration memory still present on the live server
- `Memory.legacyDefenseMigrationDone` field in `types.d.ts` — retained while `memoryAudit.ts`
  references it
- `rallySpawnId` in `CreepMemory` interface — may exist in live memory on migrated patrol creeps;
  harmless; patrol code ignores it
```
