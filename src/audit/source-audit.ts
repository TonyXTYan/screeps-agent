import { ensureArchetype } from '../creeps/capabilities';

function gatherValidSourceIds(activeRooms: Set<string>): Set<string> {
    const ids = new Set<string>();

    for (const roomName of activeRooms) {
        if (Game.rooms[roomName]) {
            for (const source of Game.rooms[roomName].find(FIND_SOURCES)) {
                ids.add(source.id);
            }
        }

        const plan = Memory.rooms[roomName]?.plan;
        if (plan?.sources) {
            for (const sourceId in plan.sources) {
                ids.add(sourceId);
            }
        }

        if (plan?.remoteRooms) {
            for (const remoteName in plan.remoteRooms) {
                const sources = plan.remoteRooms[remoteName].sources;
                if (sources) {
                    for (const sourceId in sources) {
                        ids.add(sourceId);
                    }
                }
            }
        }
    }

    return ids;
}

export function fixDuplicateSourceAssignments(activeRooms: Set<string>): number {
    let count = 0;

    for (const roomName of activeRooms) {
        const sourceAssignments = new Map<string, { name: string; workParts: number; ttl: number }[]>();
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.spawning) { continue; }
            if (creep.memory.remoteStandby) { continue; }
            const archetype = ensureArchetype(creep);
            if (archetype !== 'miner' && archetype !== 'remoteMiner') { continue; }
            const sid = creep.memory.assignedSourceId ?? creep.memory.sourceId;
            if (!sid || creep.memory.homeRoom !== roomName) { continue; }

            const workParts = creep.getActiveBodyparts(WORK);
            const ttl = creep.ticksToLive ?? 0;

            if (!sourceAssignments.has(sid)) {
                sourceAssignments.set(sid, []);
            }
            sourceAssignments.get(sid)!.push({ name, workParts, ttl });
        }

        for (const [sid, entries] of sourceAssignments) {
            if (entries.length <= 1) { continue; }

            entries.sort((a, b) => b.workParts - a.workParts || b.ttl - a.ttl);
            const keeper = entries[0];
            const removed: string[] = [];

            for (let i = 1; i < entries.length; i++) {
                const creep = Game.creeps[entries[i].name];
                if (!creep) { continue; }
                delete creep.memory.assignedSourceId;
                delete creep.memory.sourceId;
                removed.push(entries[i].name);
            }

            if (removed.length > 0) {
                console.log(`[memoryAudit] Duplicate source ${sid}: kept ${keeper.name} (${keeper.workParts}W), unassigned ${removed.join(', ')}`);
                count += removed.length;
            }
        }
    }

    return count;
}

export function fixOrphanedSourceReferences(activeRooms: Set<string>): number {
    let count = 0;

    const validSourceIds = gatherValidSourceIds(activeRooms);

    for (const name in Memory.creeps) {
        const mem = Memory.creeps[name];
        if (!mem) { continue; }

        if (mem.assignedSourceId && !validSourceIds.has(mem.assignedSourceId)) {
            const oldAssignedSourceId = mem.assignedSourceId;
            delete mem.assignedSourceId;
            console.log(`[memoryAudit] Cleared orphaned assignedSourceId for ${name}: ${oldAssignedSourceId}`);
            count++;
        }

        if (mem.sourceId && !validSourceIds.has(mem.sourceId)) {
            const oldSourceId = mem.sourceId;
            delete mem.sourceId;
            console.log(`[memoryAudit] Cleared orphaned sourceId for ${name}: ${oldSourceId}`);
            count++;
        }
    }

    return count;
}
