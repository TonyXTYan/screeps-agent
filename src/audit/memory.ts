import { cleanupOrphanedRoomMemory, cleanupStaleRemotePlans } from './room-audit';
import { fixDuplicateSourceAssignments, fixOrphanedSourceReferences } from './source-audit';
import { fixStaleTravelMemory, cleanupInvalidCreepMemory } from './creep-audit';

export function runFullAudit(): number {
    let fixed = 0;

    const activeRooms = new Set<string>();
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        if (spawn.room?.controller?.my) {
            activeRooms.add(spawn.room.name);
        }
    }

    fixed += cleanupOrphanedRoomMemory(activeRooms);
    fixed += cleanupStaleRemotePlans(activeRooms);
    fixed += fixDuplicateSourceAssignments(activeRooms);
    fixed += fixOrphanedSourceReferences(activeRooms);
    fixed += fixStaleTravelMemory();
    fixed += cleanupInvalidCreepMemory(activeRooms);

    if (fixed > 0) {
        console.log(`[memoryAudit] Done: ${fixed} issue(s) fixed`);
    } else {
        console.log('[memoryAudit] Done: no issues found');
    }

    return fixed;
}
