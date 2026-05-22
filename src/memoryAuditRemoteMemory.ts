import { gatherValidRemoteRooms } from './memoryAuditRooms';

export function cleanupInvalidCreepMemory(activeRooms: Set<string>): number {
    let count = 0;
    const validRemoteRooms = gatherValidRemoteRooms(activeRooms);

    for (const name in Memory.creeps) {
        const mem = Memory.creeps[name];
        if (!mem) { continue; }

        if (mem.remoteRoom && mem.homeRoom) {
            const key = `${mem.homeRoom}:${mem.remoteRoom}`;
            if (!validRemoteRooms.has(key)) {
                const plan = Memory.rooms[mem.homeRoom]?.plan;
                const isClaimTarget = (plan?.claimTargets ?? []).includes(mem.remoteRoom);
                if (!isClaimTarget) {
                    const oldRemoteRoom = mem.remoteRoom;
                    delete mem.remoteRoom;
                    delete mem.remoteMode;
                    delete mem.sourceId;
                    delete mem.assignedSourceId;
                    delete mem.remoteStandby;
                    console.log(`[memoryAudit] Cleared invalid remote: ${name} -> ${oldRemoteRoom}`);
                    count++;
                }
            }
        }

        if (mem.remoteRoom && !mem.homeRoom) {
            delete mem.remoteRoom;
            delete mem.remoteMode;
            delete mem.sourceId;
            delete mem.assignedSourceId;
            delete mem.remoteStandby;
            console.log(`[memoryAudit] Cleared remote without homeRoom for ${name}`);
            count++;
        }

        if (mem.remoteStandby && !mem.remoteRoom) {
            delete mem.remoteStandby;
            console.log(`[memoryAudit] Cleared orphaned remoteStandby for ${name}`);
            count++;
        }

        if (mem.scoutWanderRoom && !mem.remoteRoom) {
            delete mem.scoutWanderRoom;
            delete mem.scoutWanderUntil;
            console.log(`[memoryAudit] Cleared orphaned scout wander for ${name}`);
            count++;
        }

        if (mem.homeRoom && !activeRooms.has(mem.homeRoom)) {
            delete mem.homeRoom;
            console.log(`[memoryAudit] Cleared invalid homeRoom for ${name}`);
            count++;
        }

        const hasRemoteArchetype = mem.remoteRoom !== undefined ||
            mem.archetype === 'remoteMiner' ||
            mem.archetype === 'remoteHauler' ||
            mem.archetype === 'remoteMaintainer' ||
            mem.archetype === 'remoteScout' ||
            mem.archetype === 'claimer' ||
            mem.archetype === 'miner';

        if (!hasRemoteArchetype) {
            if (mem.remoteMode) {
                delete mem.remoteMode;
                count++;
            }
            if (mem.sourceId) {
                delete mem.sourceId;
                count++;
            }
            if (mem.assignedSourceId) {
                delete mem.assignedSourceId;
                count++;
            }
            if (mem.remoteStandby) {
                delete mem.remoteStandby;
                count++;
            }
        }
    }

    return count;
}
