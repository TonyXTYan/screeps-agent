import { BUILD_COMMIT } from './env';

export function runIfBuildChanged(): void {
    const lastCommit = (Memory as { lastBuildCommit?: string }).lastBuildCommit;
    if (lastCommit === BUILD_COMMIT) { return; }

    if (Game.cpu.bucket < 500) { return; }

    console.log(`[memoryAudit] Build changed: ${lastCommit ?? 'none'} -> ${BUILD_COMMIT}`);
    runFullAudit();
    (Memory as { lastBuildCommit?: string }).lastBuildCommit = BUILD_COMMIT;
}

export function runFullAudit(): void {
    let fixed = 0;
    let reported = 0;

    const activeRooms = new Set<string>();
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        if (spawn.room?.controller?.my) {
            activeRooms.add(spawn.room.name);
        }
    }

    fixed += cleanupOrphanedRoomMemory(activeRooms);
    fixed += cleanupStaleRemotePlans(activeRooms);
    fixed += cleanupInvalidCreepMemory(activeRooms);
    reported += reportDuplicateSourceAssignments(activeRooms);

    if (fixed > 0 || reported > 0) {
        console.log(`[memoryAudit] Done: ${fixed} fixed, ${reported} reported`);
    }
}

function cleanupOrphanedRoomMemory(activeRooms: Set<string>): number {
    let count = 0;

    for (const roomName in Memory.rooms) {
        if (activeRooms.has(roomName)) { continue; }

        let isReferenced = false;
        for (const otherName in Memory.rooms) {
            if (otherName === roomName) { continue; }
            const plan = Memory.rooms[otherName]?.plan;
            if (plan?.remoteRooms?.[roomName]) { isReferenced = true; break; }
            if ((plan?.claimTargets ?? []).includes(roomName)) { isReferenced = true; break; }
        }

        if (!isReferenced) {
            delete Memory.rooms[roomName];
            console.log(`[memoryAudit] Removed orphaned room: ${roomName}`);
            count++;
        }
    }

    return count;
}

function cleanupStaleRemotePlans(activeRooms: Set<string>): number {
    let count = 0;

    for (const roomName of activeRooms) {
        const plan = Memory.rooms[roomName]?.plan;
        if (!plan?.remoteRooms) { continue; }

        for (const remoteName in plan.remoteRooms) {
            const remote = plan.remoteRooms[remoteName];

            if (remote.dangerUntil && remote.dangerUntil <= Game.time) {
                remote.dangerUntil = undefined;
                console.log(`[memoryAudit] Cleared expired danger: ${roomName}->${remoteName}`);
                count++;
            }

            if (remote.skipReason && Game.rooms[remoteName]) {
                const hostiles = Game.rooms[remoteName].find(FIND_HOSTILE_CREEPS, {
                    filter: (c: Creep) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
                });
                if (hostiles.length === 0) {
                    remote.skipReason = undefined;
                    console.log(`[memoryAudit] Cleared stale skip reason: ${roomName}->${remoteName}`);
                    count++;
                }
            }

            if (remote.lastSeenHostiles && remote.lastSeenHostiles + 5000 < Game.time) {
                remote.lastSeenHostiles = undefined;
                count++;
            }

            if (remote.sources && Game.rooms[remoteName]) {
                const actualSources = Game.rooms[remoteName].find(FIND_SOURCES);
                const actualIds = new Set(actualSources.map(s => s.id as string));
                for (const sourceId in remote.sources) {
                    if (!actualIds.has(sourceId)) {
                        delete remote.sources[sourceId];
                        console.log(`[memoryAudit] Removed stale source ${sourceId} from ${roomName}->${remoteName}`);
                        count++;
                    }
                }
            }
        }
    }

    return count;
}

function cleanupInvalidCreepMemory(activeRooms: Set<string>): number {
    let count = 0;

    for (const name in Memory.creeps) {
        const mem = Memory.creeps[name];
        if (!mem) { continue; }

        if (mem.remoteRoom && mem.homeRoom) {
            const plan = Memory.rooms[mem.homeRoom]?.plan;
            const exists = plan?.remoteRooms?.[mem.remoteRoom] !== undefined ||
                (plan?.claimTargets ?? []).includes(mem.remoteRoom);
            if (!exists) {
                delete mem.remoteRoom;
                delete mem.remoteMode;
                delete mem.sourceId;
                delete mem.assignedSourceId;
                delete mem.remoteStandby;
                console.log(`[memoryAudit] Cleared invalid remote: ${name} ${mem.remoteRoom}`);
                count++;
            }
        }

        if (mem.homeRoom && !activeRooms.has(mem.homeRoom)) {
            delete mem.homeRoom;
            console.log(`[memoryAudit] Cleared invalid homeRoom for ${name}`);
            count++;
        }
    }

    return count;
}

function reportDuplicateSourceAssignments(activeRooms: Set<string>): number {
    let count = 0;

    for (const roomName of activeRooms) {
        const sourceAssignments = new Map<string, string[]>();
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.spawning) { continue; }
            const sid = creep.memory.assignedSourceId ?? creep.memory.sourceId;
            if (!sid || creep.memory.homeRoom !== roomName) { continue; }
            if (!sourceAssignments.has(sid)) {
                sourceAssignments.set(sid, []);
            }
            sourceAssignments.get(sid)!.push(name);
        }
        for (const [sid, names] of sourceAssignments) {
            if (names.length > 1) {
                console.log(`[memoryAudit] Duplicate source ${sid} in ${roomName}: ${names.join(', ')}`);
                count++;
            }
        }
    }

    return count;
}
