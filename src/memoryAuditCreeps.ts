export function fixStaleTravelMemory(): number {
    let count = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        const mem = creep.memory;

        if ((mem.travelStuckTicks ?? 0) > 20) {
            delete mem.travelStuckTicks;
            delete mem.travelLastX;
            delete mem.travelLastY;
            delete mem.travelLastRoom;
            console.log(`[memoryAudit] Cleared stale travel stuck for ${name}`);
            count++;
        }
    }

    return count;
}

export { cleanupInvalidCreepMemory } from './memoryAuditRemoteMemory';
export { fixDuplicateSourceAssignments, fixOrphanedSourceReferences } from './memoryAuditSourceAssignments';
