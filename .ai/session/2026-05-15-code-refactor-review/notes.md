# Code and Documentation Consistency Review

**Date:** 2026-05-15
**Scope:** `src/room.controller.ts`, `src/memoryAudit.ts`, `src/main.ts`, `architecture/*.md`, `.ai/memory/*.md`

---

## Findings

### 1. CRITICAL: room.controller.ts Size — Massive Growth

- **Current:** 4,406 lines, 204 functions
- **OVERVIEW.md claims:** "~3100 lines"
- **CODEMAP.md claims:** "~2868 lines" (in Known Issues)

Both architecture documents understate the file size by ~1,300 lines (~42%). The god module has grown well beyond when it was last documented.

**Refactoring plan needed.** Suggested extraction targets (already noted in CODEMAP.md):
- Remote room logic (~400+ lines, likely ~700+)
- Spawn planning logic (~250+ lines)
- Job assignment logic (~300+ lines)
- Standby miner management (main.ts + room.controller.ts)

---

### 2. DOC BUG: Tick Loop Function Name Mismatch

**OVERVIEW.md** says:
```
│ 5. memoryAudit.runIfBuildChanged()          │
```

**Actual code** in `main.ts` line 87:
```typescript
memoryAudit.runFullAudit();
```

The function was renamed but OVERVIEW.md wasn't updated. This propagates through AGENTS.md too ("memoryAudit.runIfBuildChanged()").

---

### 3. VERIFIED FIXED: Remote Miner Counting Includes Spawning Creeps

All counting functions correctly include spawning creeps:

| Function | Skips spawning? | Verdict |
|----------|----------------|---------|
| `countRemoteMinersForSource` | No | ✓ Correct |
| `countRemoteHaulersForSource` | No | ✓ Correct |
| `countRemoteHaulersForRoom` | No | ✓ Correct |
| `countActiveRemoteMinersForRoom` | No | ✓ Correct |
| `countRemoteStandbyMiners` | No | ✓ Correct |
| `hasActiveRemoteMinerForSource` | Yes | ✓ Correct (name implies active only) |
| `assignedRemoteMinerWork` | No, uses `getBodyCapabilities(body)` for spawning | ✓ Correct |
| `projectedRemoteMinerWork` | No, horizon-aware, uses `getBodyCapabilities(body)` for spawning | ✓ Correct |
| `projectedRemoteHaulerCapacity` | Same as above | ✓ Correct |

The `fixDuplicateSourceAssignments` audit function skips spawning creeps (`if (creep.spawning) { continue; }`) — this is acceptable because it's cleanup of stale state, not live counting.

---

### 4. VERIFIED FIXED: Memory Audit Preserves Miner Source Assignments

The `cleanupInvalidCreepMemory` function includes `'miner'` in `hasRemoteArchetype`:

```typescript
const hasRemoteArchetype = mem.remoteRoom !== undefined ||
    mem.archetype === 'remoteMiner' ||
    mem.archetype === 'remoteHauler' ||
    mem.archetype === 'remoteMaintainer' ||
    mem.archetype === 'remoteScout' ||
    mem.archetype === 'claimer' ||
    mem.archetype === 'miner';
```

Source IDs (`sourceId`, `assignedSourceId`) are preserved for miners. ✓

---

### 5. STALE: TICK LOOP IN MAIN.TS

**Overviews claims** (from OVERVIEW.md):
```
│ 5. memoryAudit.runIfBuildChanged()          │
│    - Full consistency audit on new deploy   │
│    - Skipped if CPU bucket < 500            │
```

**Actual code** (main.ts):
- Bucket guard changed from `< 500` to `< 0` (i.e., runs even with 0 bucket)
- Function renamed to `runFullAudit()`

Also, OVERVIEW.md step 7b says "Try to renew standby miners" but the actual `tryRenewStandbyMiner` does NOT renew — it parks blank standby miners away from spawn. The ARCH docs still call it "no standby renew" in some places (CODEMAP.md) but OVERVIEW.md doesn't reflect this clearly.

---

### 6. DUPLICATE UTILITIES (documented but unresolved)

From CODEMAP.md (still valid):
- `firstStoredResource()` exists in both `creep.jobRunner.ts` and `room.controller.ts`
- `closest()` / `closestByRange()` overlap in `room.controller.ts`

These are low-risk duplicates but add maintenance burden. Consolidation would require extracting to a shared utilities file.

---

### 7. LEGACY ROLE MEMORY DELETION RISK (documented but unresolved)

From KNOWN_ISSUES.md and CODEMAP.md (still valid):
> Legacy role scripts (`role.harvester.ts`, `role.builder.ts`) still `delete Memory.creeps[creep.name]` when idle. This can destroy remote-creep memory if a remote creep falls through to legacy fallback.

Guard check:
```typescript
// main.ts: legacy fallback block
if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
```

The guard should check `!creep.memory.remoteRoom` before invoking legacy roles. Still TODO.

---

### 8. REMOTES.md — Accurate but Understated Complexity

REMOTES.md accurately documents:
- Opt-in model and schema ✓
- Spawn flow priorities ✓
- Hauler capacity model ✓
- Miner slot caps ✓
- Path caching ✓
- Danger handling ✓
- Miner lifecycle and standby handoff ✓

However, the actual implementation has additional edge cases not yet documented:
- Route health tracking (`routeHealth: 'healthy' | 'degraded'`) with stall counting
- Miner station progress tracking (`remoteStationStuckTicks`, `remoteStationLastX/Y/Room`)
- Degraded route road placement limits (8 vs 3 unfinished sites)
- Blank standby source reassignment logic
- Hauler wander behavior during idle recheck windows

---

### 9. ECONOMY.md — Mostly Accurate

Source Miner Lifecycle section aligns with current code:
- Local miner renewal at TTL 500→1300 matches main.ts constants ✓
- Remote miner standby handoff at TTL 200 matches REMOTES.md ✓

Gathering priority and energy spending priority sections are accurate ✓

Spawn planning priority list is complete and correct ✓

---

## Refactoring Plan (Plan Mode)

### Phase 1: Documentation Fixes (quick, no code changes)

1. Update OVERVIEW.md: change `runIfBuildChanged()` → `runFullAudit()`, update room.controller.ts line count to 4406
2. Update AGENTS.md: same function name fix
3. Update OVERVIEW.md tick loop to reflect `tryRenewStandbyMiner` parking behavior (not renewal)
4. Update CODEMAP.md known issues section to remove resolved items (can move to history or mark as verified)
5. Add REMOTES.md section for route health tracking and degraded-miner recovery

### Phase 2: Extract Submodules (large refactor)

Split `room.controller.ts` (4406 lines, 204 functions) into focused modules:

```
src/
  room.controller.ts         (~800 lines) — orchestrator, run(), buildContext
  room.remote.ts             (~800 lines)   — all remote logic (assignRemoteCreep, remoteSpawnRequest, remote counting, route health)
  room.spawn.ts              (~500 lines)   — chooseSpawnRequest, runSpawnPlanner, deficit measurement
  room.jobs.ts               (~600 lines)   — assignJobs, JobReservations, reservation management
  room.links.ts              (~100 lines)   — runLinks
  room.mineral.ts            (~200 lines)   — mineral planning
  room.standby.ts            (~200 lines)   — standby miner promotion/demotion
```

Benefits:
- Each module ≤ 800 lines, easily navigable
- Clear import/export boundaries
- Easier testing of individual concerns
- Reduces merge conflict risk

### Phase 3: Guard Legacy Roles

Add `!creep.memory.remoteRoom` guard before each legacy role invocation in main.ts. This prevents remote creeps that somehow fall through to legacy roles from getting their memory deleted.

### Phase 4: Consolidate Duplicates

Extract `firstStoredResource()`, `closest()`, `closestByRange()` into `src/utils.ts` or similar.

---

## Summary

| Category | Issue | Severity | Action |
|----------|-------|----------|--------|
| Documentation | Overwrong function name (`runIfBuildChanged`) | Medium | Fix docs |
| Documentation | Stale line counts (3100/2868 vs 4406) | Low | Fix docs |
| Architecture | 4406-line god module, 204 functions | High | Extract submodules |
| Bug risk | Legacy roles can delete remote creep memory | High | Add guard in main.ts |
| Duplication | `firstStoredResource()` in 2 files | Low | Consolidate |
| Duplication | `closest()`/`closestByRange()` overlap | Low | Consolidate |
| Docs completeness | REMOTES.md missing route health details | Low | Add section |
| Verified fixed | Spawning creep counting | — | No action |
| Verified fixed | Miner source ID preservation | — | No action |
