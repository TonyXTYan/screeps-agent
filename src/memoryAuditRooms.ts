export function cleanupOrphanedRoomMemory(activeRooms: Set<string>): number {
    let count = 0;
    const orphanedRooms: string[] = [];

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
            orphanedRooms.push(roomName);
        }
    }

    for (const roomName of orphanedRooms) {
        delete Memory.rooms[roomName];
        console.log(`[memoryAudit] Removed orphaned room: ${roomName}`);
        count++;
    }

    return count;
}

export function cleanupStaleRemotePlans(activeRooms: Set<string>): number {
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
                    filter: (c: Creep) => c.body.some(p => p.type === ATTACK) || c.body.some(p => p.type === RANGED_ATTACK) || c.body.some(p => p.type === HEAL)
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

            if (remote.sources) {
                for (const sourceId in remote.sources) {
                    const sourcePlan = remote.sources[sourceId];
                    if (sourcePlan.routeAccessible !== false && sourcePlan.pathUpdatedAt !== undefined) {
                        sourcePlan.pathUpdatedAt = undefined;
                        console.log(`[memoryAudit] Cleared path cache for source ${sourceId} in ${roomName}->${remoteName} (re-verify on deploy)`);
                        count++;
                    }
                }
            }
        }
    }

    return count;
}

export function gatherValidSourceIds(activeRooms: Set<string>): Set<string> {
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

export function gatherValidRemoteRooms(activeRooms: Set<string>): Set<string> {
    const keys = new Set<string>();

    for (const roomName of activeRooms) {
        const plan = Memory.rooms[roomName]?.plan;
        if (plan?.remoteRooms) {
            for (const remoteName in plan.remoteRooms) {
                keys.add(`${roomName}:${remoteName}`);
            }
        }
        if (plan?.claimTargets) {
            for (const target of plan.claimTargets) {
                keys.add(`${roomName}:${target}`);
            }
        }
    }

    return keys;
}
