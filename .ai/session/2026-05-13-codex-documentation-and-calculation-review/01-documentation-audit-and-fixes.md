# Documentation Audit + Fixes (Detailed) — 2026-05-13

## Objective
Create a documentation-consistency audit against current implementation, apply docs-only corrections, and confirm which issues are now fixed.

## Scope
Documentation reviewed and corrected:
- `architecture/OVERVIEW.md`
- `architecture/ECONOMY.md`
- `architecture/REMOTES.md`
- `architecture/DEFENSE.md`
- `architecture/MEMORY.md`
- `console/REMOTE_MINING_CONSOLE.md`
- `.ai/memory/STRATEGY.md`
- `.ai/memory/CURRENT_ARCHITECTURE.md`
- `.ai/memory/CODEMAP.md`
- `.ai/memory/KNOWN_ISSUES.md`

Implementation references used as ground truth:
- `src/room.controller.ts`
- `src/creep.capabilities.ts`
- `src/tower.basics.ts`
- `src/creep.populationControl.ts`
- `src/role.defender.ts`
- `src/main.ts`
- `src/hostileUtils.ts`
- `src/types.d.ts`

## Method
1. Enumerated candidate drift points from prior audit notes.
2. Verified current runtime behavior in code (constants, flow order, body planning, archetypes, command names).
3. Updated docs to reflect actual behavior.
4. Re-grepped stale phrases and manually rechecked updated sections.

## Original Issues And Why They Were Issues

| ID | Severity | Original Drift | Code Evidence | Why It Mattered |
|---|---|---|---|---|
| D1 | High | Remote hauler docs said cap `500` and pure `CARRY+MOVE` | `MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500` and optional `+WORK` in body planner (`src/room.controller.ts:104`, `src/creep.capabilities.ts:155-163`) | Strategy/docs mis-described remote throughput policy and spawn expectations |
| D2 | High | Defense docs said tower repair available at low energy and defenders harvest when idle | Tower heal/repair branch gated at `energyRatio > 0.5` (`src/tower.basics.ts:48`); defender idle path is rally/renew, no harvest fallback (`src/role.defender.ts`) | Defense playbook in docs diverged from live behavior |
| D3 | High | Strategy manual audit command used `require('memoryAudit').runFullAudit()` | Runtime exposes `runMemoryAudit()` on `globalThis` (`src/main.ts`) | Console operation docs were wrong |
| D4 | Medium | Job/archetype counts stale in docs | `CreepJobType` has 19 entries; `CreepArchetype` has 11 including `defender` (`src/types.d.ts`) | Misleading architecture inventory |
| D5 | Medium | Codemap/known-issues still claimed hostile helper duplication | Hostile helpers centralized in `src/hostileUtils.ts`; imported across modules | Known-issues backlog contained resolved work |
| D6 | Medium | Room controller pipeline order in docs outdated | Actual `run()` order in `src/room.controller.ts:107-120` | Misguided future edits/debugging |
| D7 | Low | Overview module count stale and missing `hostileUtils.ts` | `src/` has 21 files | Architectural map accuracy issue |
| D8 | Low | Defender misclassification explanation stale in docs | Archetype includes `defender` (`src/types.d.ts`), behavior handled explicitly | Explanatory narrative lagged code evolution |

## Documentation Changes Applied

### 1) Remote policy alignment
Updated references in:
- `architecture/REMOTES.md`
- `architecture/ECONOMY.md`
- `console/REMOTE_MINING_CONSOLE.md`
- `.ai/memory/STRATEGY.md`
- `.ai/memory/CURRENT_ARCHITECTURE.md`

Key updates:
- Demand cap references updated to `2500`.
- Body wording updated to CARRY+MOVE core with optional trailing WORK.
- Remote spawn sub-order and demand-cap phrasing aligned to controller logic.

Current doc evidence:
- `architecture/REMOTES.md:75-83`
- `architecture/ECONOMY.md:33-39`
- `.ai/memory/STRATEGY.md:53-55,169,177-179`
- `.ai/memory/CURRENT_ARCHITECTURE.md:104-106,136,202-204`
- `console/REMOTE_MINING_CONSOLE.md:88-91`

### 2) Defense behavior alignment
Updated references in:
- `architecture/DEFENSE.md`
- `.ai/memory/STRATEGY.md`
- `.ai/memory/CURRENT_ARCHITECTURE.md`

Key updates:
- Tower repair/heal gating text now reflects `>50%` branch requirement.
- Defender idle behavior now documented as rally/renew behavior.
- Execution-priority explanation updated to “bypass economic assignment” wording.

Current doc evidence:
- `architecture/DEFENSE.md:51-54,95-105`
- `.ai/memory/STRATEGY.md:125`
- `.ai/memory/CURRENT_ARCHITECTURE.md:176-185`

### 3) Memory-audit command alignment
Updated references in:
- `.ai/memory/STRATEGY.md`
- `architecture/MEMORY.md` (already aligned in final state)

Current doc evidence:
- `.ai/memory/STRATEGY.md:290`
- `architecture/MEMORY.md:161`

### 4) Counts/inventory alignment
Updated references in:
- `architecture/OVERVIEW.md`
- `architecture/MEMORY.md`
- `.ai/memory/CURRENT_ARCHITECTURE.md`

Key updates:
- Source map updated to 21 modules.
- Job/archetype counts corrected to 19/11.
- `defender` included in archetype lists.

Current doc evidence:
- `architecture/OVERVIEW.md:9-19,108-112`
- `architecture/MEMORY.md:112-114`
- `.ai/memory/CURRENT_ARCHITECTURE.md:85-95`

### 5) Stale issue cleanup alignment
Updated references in:
- `.ai/memory/CODEMAP.md`
- `.ai/memory/KNOWN_ISSUES.md`

Key updates:
- Codemap now reflects centralized hostile utility.
- Resolved stale runtime-cleanup bullets removed from known issues.

Current doc evidence:
- `.ai/memory/CODEMAP.md:22-26`
- `.ai/memory/KNOWN_ISSUES.md:11-14`

### 6) Pipeline ordering alignment
Updated reference in:
- `architecture/ECONOMY.md`

Current doc evidence:
- `architecture/ECONOMY.md:14-25`

Corresponding code order:
- `src/room.controller.ts:107-120`

## Validation Performed
- Phrase sweep for previously stale wording (cap/body/command/count markers).
- Manual line-by-line spot check for each corrected section.
- Cross-check against implementation constants and function order.

## Recheck Status (2026-05-13)
- D1 Remote hauler policy drift (docs vs code): `Fixed`
- D2 Defense behavior docs conflict with runtime: `Fixed`
- D3 Strategy memory-audit command outdated: `Fixed`
- D4 Archetype/job counts stale in docs: `Fixed`
- D5 Hostile-helper duplication note stale in docs: `Fixed`
- D6 Room controller pipeline order outdated in docs: `Fixed`
- D7 Module inventory count stale in overview docs: `Fixed`
- D8 Outdated defender misclassification explanatory text in docs: `Fixed`

## Notes
- This file captures documentation-state correction only.
- Runtime/balance gaps that still require code changes are tracked in `02-online-verification-and-rcl-remote-balance-audit.md`.
