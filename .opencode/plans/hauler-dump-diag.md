# Plan: Add hauler diagnostics to dumpRemote, revert room.controller.ts diag

## Change 1: Revert diagnostic log in `src/room.controller.ts`

Remove lines 339-351 (the `[diag]` block added in the previous edit):

**Before** (`src/room.controller.ts` lines 333-352):
```typescript
    if (archetype === 'remoteHauler') {
        const source = findRemoteEnergySource(creep, remotePlan);
        if (source) {
            setJob(creep, source.jobType, source.target);
            return true;
        }
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0 && Game.time % 25 === 0) {
            const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
            const roomName = creep.room?.name ?? '?';
            console.log(`[diag] ${creep.name}: findRemoteEnergySource=null  free=${free}  room=${roomName}  remotePlan.sources=${Object.keys(remotePlan.sources ?? {}).length}`);
            for (const sid in (remotePlan.sources ?? {})) {
                const sp = remotePlan.sources[sid];
                console.log(`  source=${sid.slice(-8)}  station=[${sp?.stationX ?? '?'},${sp?.stationY ?? '?'}]  containerId=${sp?.containerId?.slice(-8) ?? 'N/A'}  workDemand=${sp?.workDemand ?? '?'}`);
                if (sp?.containerId) {
                    const c = Game.getObjectById(sp.containerId as Id<StructureContainer>);
                    console.log(`  containerObj=${c ? `OK en=${c.store.getUsedCapacity(RESOURCE_ENERGY)}/${c.store.getCapacity(RESOURCE_ENERGY)} hp=${c.hits}/${c.hitsMax} pos=[${c.pos.x},${c.pos.y}]` : 'NULL'}`);
                }
            }
        }
    }
```

**After** (revert to original):
```typescript
    if (archetype === 'remoteHauler') {
        const source = findRemoteEnergySource(creep, remotePlan);
        if (source) {
            setJob(creep, source.jobType, source.target);
            return true;
        }
    }
```

## Change 2: Add hauler diagnostics to `src/debug.ts` `printRemoteCreepStatus()`

In the Source Details section, after the miner info loop (current ending at line ~245), add a hauler info loop:

**Location**: After the `// Miner info` `for...in` loop and before the closing `}` of the source details `for...of` loop.

**Code to add**:
```typescript
                for (const name in Game.creeps) {
                    const creep = Game.creeps[name];
                    if (creep.spawning) { continue; }
                    if (creep.memory.homeRoom !== room.name) { continue; }
                    if (creep.memory.remoteRoom !== remoteName) { continue; }
                    const src = creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '';
                    if (src !== sourceId) { continue; }
                    if (ensureArchetype(creep) !== 'remoteHauler') { continue; }

                    const ttl = creep.ticksToLive ?? -1;
                    const jobType = creep.memory.jobType ?? 'none';
                    const jobTarget = creep.memory.jobTargetId?.slice(-8) ?? '-';
                    const en = creep.store.getUsedCapacity(RESOURCE_ENERGY);
                    const cap = creep.store.getCapacity(RESOURCE_ENERGY);
                    const pos = creep.room ? `${creep.pos.x},${creep.pos.y}` : '?,?';
                    sourceLines.push(`    hauler=${name}  TTL=${ttl}  en=${en}/${cap}  job=${jobType}  tgt=${jobTarget}  pos=[${pos}]`);
                }
```

This will add lines like:
```
    hauler=remoteHauler-Spawn1-70846136  TTL=75  en=0/700  job=withdrawEnergy  tgt=e230e5ac  pos=[42,6]
    hauler=remoteHauler-Spawn1-70847481-1  TTL=1420  en=0/700  job=idle  tgt=59cba123  pos=[5,45]
```

The `job` field tells us exactly what the hauler is doing: `withdrawEnergy` (working), `travelRoom` (traveling), or `idle` (stuck). The `tgt` field shows the target ID — if it doesn't match the container ID, we know the hauler is targeting the wrong thing.
