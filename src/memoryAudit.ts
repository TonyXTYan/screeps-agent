import { ensureArchetype } from './creep/capabilities';
import {
    markRemoteMaintenanceRefresh,
    refreshRemoteMaintenancePressureIfNeeded,
    snapshotRemoteMaintainerCount,
} from './room/remote/maintenance';

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
    fixed += migrateLegacyDefenseRoles();
    fixed += cleanupStaleRemotePlans(activeRooms);
    fixed += fixDuplicateSourceAssignments(activeRooms);
    fixed += fixOrphanedSourceReferences(activeRooms);
    fixed += fixStaleTravelMemory();
    fixed += cleanupInvalidCreepMemory(activeRooms);
    refreshRemoteMaintenanceTelemetry(activeRooms);

    if (fixed > 0) {
        console.log(`[memoryAudit] Done: ${fixed} issue(s) fixed`);
    } else {
        console.log('[memoryAudit] Done: no issues found');
    }

    return fixed;
}

function migrateLegacyDefenseRoles(): number {
    let changed = 0;
    for (const name in Memory.creeps) {
        const memory = Memory.creeps[name];
        if (!memory) { continue; }

        if (memory.role === 'defender' || memory.archetype === 'defender') {
            memory.role = 'patrol';
            memory.archetype = 'patrol';
            memory.attacking = undefined;
            memory.rallySpawnId = undefined;
            changed++;
            continue;
        }
        if (memory.role === 'doctor' || memory.archetype === 'doctor') {
            memory.role = 'builder';
            memory.archetype = 'worker';
            changed++;
        }
    }

    if (changed > 0) {
        console.log(`[memoryAudit] Migrated legacy defense roles: ${changed}`);
    }
    return changed;
}

function refreshRemoteMaintenanceTelemetry(activeRooms: Set<string>): void {
    let refreshed = 0;
    let stalePending = 0;

    for (const homeRoomName of activeRooms) {
        const remotes = Memory.rooms[homeRoomName]?.plan?.remoteRooms;
        if (!remotes) { continue; }

        for (const remoteRoomName in remotes) {
            const remote = remotes[remoteRoomName];
            if (!remote.enabled) { continue; }
            markRemoteMaintenanceRefresh(remote, 'memoryAudit');
            snapshotRemoteMaintainerCount(remote, countAssignedRemoteMaintainers(homeRoomName, remoteRoomName));
            if (refreshRemoteMaintenancePressureIfNeeded(remote, remoteRoomName)) {
                refreshed++;
            } else if (remote.maintenance?.stale) {
                stalePending++;
            }
        }
    }

    if (refreshed > 0 || stalePending > 0) {
        console.log(`[memoryAudit] Remote maintenance telemetry: refreshed=${refreshed} stalePending=${stalePending}`);
    }
}

function countAssignedRemoteMaintainers(homeRoomName: string, remoteRoomName: string): number {
    let count = 0;
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.homeRoom !== homeRoomName) { continue; }
        if (creep.memory.remoteRoom !== remoteRoomName) { continue; }
        count++;
    }
    return count;
}

function cleanupOrphanedRoomMemory(activeRooms: Set<string>): number {
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

function fixDuplicateSourceAssignments(activeRooms: Set<string>): number {
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

function fixOrphanedSourceReferences(activeRooms: Set<string>): number {
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

function fixStaleTravelMemory(): number {
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

function cleanupInvalidCreepMemory(activeRooms: Set<string>): number {
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

function gatherValidRemoteRooms(activeRooms: Set<string>): Set<string> {
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
