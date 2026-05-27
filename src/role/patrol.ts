import { findHostiles } from '../hostileUtils';
import { acquireRenewSpawn, nearestSpawn } from '../spawn/renewal';

const PATROL_HOLD_RANGE = 8;
const PATROL_RENEW_START_TTL = 650;
const PATROL_RENEW_STOP_TTL = 1400;
const PATROL_RENEW_CRITICAL_TTL = 300;

type VisibleThreat = {
    roomName: string;
    hostiles: Creep[];
    invaderCore: StructureInvaderCore | null;
    isHomeThreat: boolean;
};

// Keep as a dedicated function so cadence can become dynamic later.
export function getPatrolRotationTicks(): number {
    return 100;
}

export function run(creep: Creep): void {
    const homeRoom = creep.memory.homeRoom ?? creep.room.name;
    const enabledRemotes = enabledRemoteRooms(homeRoom);
    const visibleThreats = visibleRemoteThreats(homeRoom, enabledRemotes);

    if (shouldRenewPatrolNow(creep, visibleThreats, homeRoom) && tryRenewPatrol(creep, homeRoom)) {
        return;
    }

    if (visibleThreats.length > 0) {
        runThreatResponse(creep, visibleThreats);
        return;
    }

    runPatrolRotation(creep, enabledRemotes, homeRoom);
}

function runThreatResponse(creep: Creep, threats: VisibleThreat[]): void {
    const targetRoom = selectThreatRoom(creep, threats);
    if (!targetRoom) { return; }

    healFriendly(creep);

    if (creep.room.name !== targetRoom.roomName) {
        creep.moveTo(new RoomPosition(25, 25, targetRoom.roomName), {
            reusePath: 3,
            ignoreCreeps: false,
            visualizePathStyle: { stroke: '#ef4444' }
        });
        return;
    }

    const target = selectCombatTarget(creep, targetRoom.hostiles);
    if (target) {
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 1, visualizePathStyle: { stroke: '#ef4444' } });
        }
        return;
    }
    if (!targetRoom.invaderCore) { return; }
    if (creep.attack(targetRoom.invaderCore) === ERR_NOT_IN_RANGE) {
        creep.moveTo(targetRoom.invaderCore, { reusePath: 1, visualizePathStyle: { stroke: '#ef4444' } });
    }
}

function runPatrolRotation(creep: Creep, enabledRemotes: string[], homeRoom: string): void {
    const cadence = getPatrolRotationTicks();
    if (enabledRemotes.length === 0) {
        if (creep.room.name !== homeRoom) {
            creep.moveTo(new RoomPosition(25, 25, homeRoom), { reusePath: 5, visualizePathStyle: { stroke: '#f59e0b' } });
        }
        return;
    }

    const now = Game.time;
    const rotateAt = creep.memory.patrolRotateAt ?? 0;
    const currentTarget = creep.memory.patrolRoom;
    const currentIndex = creep.memory.patrolRouteIndex ?? 0;
    const currentStillValid = currentTarget ? enabledRemotes.includes(currentTarget) : false;
    const shouldRotate = now >= rotateAt || !currentStillValid;

    if (shouldRotate) {
        const nextIndex = currentStillValid
            ? (Math.max(0, enabledRemotes.indexOf(currentTarget!)) + 1) % enabledRemotes.length
            : Math.abs(hashString(creep.name)) % enabledRemotes.length;
        creep.memory.patrolRouteIndex = nextIndex;
        creep.memory.patrolRoom = enabledRemotes[nextIndex];
        creep.memory.patrolRotateAt = now + cadence;
    }

    const patrolRoom = creep.memory.patrolRoom ?? enabledRemotes[currentIndex % enabledRemotes.length];
    if (creep.room.name !== patrolRoom) {
        creep.moveTo(new RoomPosition(25, 25, patrolRoom), {
            reusePath: 5,
            ignoreCreeps: false,
            visualizePathStyle: { stroke: '#f59e0b' }
        });
        return;
    }

    const hold = new RoomPosition(25, 25, patrolRoom);
    if (creep.pos.getRangeTo(hold) > PATROL_HOLD_RANGE) {
        creep.moveTo(hold, { reusePath: 8, visualizePathStyle: { stroke: '#f59e0b' } });
    }
    healFriendly(creep);
}

function enabledRemoteRooms(homeRoom: string): string[] {
    const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};
    const rooms: string[] = [];
    for (const roomName in remotes) {
        if (remotes[roomName].enabled) {
            rooms.push(roomName);
        }
    }
    rooms.sort();
    return rooms;
}

function visibleRemoteThreats(homeRoom: string, remoteRooms: string[]): VisibleThreat[] {
    const threats: VisibleThreat[] = [];
    const homeThreat = visibleThreatInRoom(homeRoom, true);
    if (homeThreat) {
        threats.push(homeThreat);
    }
    for (const roomName of remoteRooms) {
        const threat = visibleThreatInRoom(roomName, false);
        if (!threat) { continue; }
        threats.push(threat);
    }
    return threats;
}

function selectThreatRoom(creep: Creep, threats: VisibleThreat[]): VisibleThreat | null {
    if (threats.length === 0) { return null; }
    let best = threats[0];
    let bestPriority = threatPriority(best, creep);
    for (const threat of threats) {
        const priority = threatPriority(threat, creep);
        if (priority > bestPriority) {
            best = threat;
            bestPriority = priority;
        }
    }
    return best;
}

function selectCombatTarget(creep: Creep, hostiles: Creep[]): Creep | null {
    if (hostiles.length === 0) { return null; }
    const scored = hostiles.map((hostile) => ({ hostile, score: hostilePriorityScore(hostile) }));
    scored.sort((a, b) => b.score - a.score);

    const topScore = scored[0].score;
    const topPriority = scored
        .filter((entry) => entry.score === topScore)
        .map((entry) => entry.hostile);
    return creep.pos.findClosestByRange(topPriority) ?? scored[0].hostile;
}

function hostilePriorityScore(hostile: Creep): number {
    const heal = hostile.getActiveBodyparts(HEAL);
    const ranged = hostile.getActiveBodyparts(RANGED_ATTACK);
    const melee = hostile.getActiveBodyparts(ATTACK);
    return heal * 100 + ranged * 10 + melee;
}

function healFriendly(creep: Creep): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return; }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
        return;
    }

    const nearby = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
        filter: (ally) => ally.hits < ally.hitsMax
    });
    if (nearby.length === 0) { return; }
    const closest = creep.pos.findClosestByRange(nearby);
    if (!closest) { return; }
    const healCode = creep.heal(closest);
    if (healCode === ERR_NOT_IN_RANGE) {
        creep.rangedHeal(closest);
    }
}

function visibleThreatInRoom(roomName: string, isHomeThreat: boolean): VisibleThreat | null {
    const room = Game.rooms[roomName];
    if (!room) { return null; }
    const hostiles = findHostiles(room);
    const invaderCore = findHostileInvaderCore(room);
    if (hostiles.length === 0 && !invaderCore) { return null; }
    return { roomName, hostiles, invaderCore, isHomeThreat };
}

function findHostileInvaderCore(room: Room): StructureInvaderCore | null {
    const cores = room.find(FIND_HOSTILE_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_INVADER_CORE
    }) as StructureInvaderCore[];
    return cores[0] ?? null;
}

function threatPriority(threat: VisibleThreat, creep: Creep): number {
    const homeBoost = threat.isHomeThreat && threat.hostiles.length > 0 ? 10000 : 0;
    const armedBoost = threat.hostiles.length > 0 ? 1000 : 0;
    const coreBoost = threat.invaderCore ? 100 : 0;
    const distancePenalty = Game.map.getRoomLinearDistance(creep.room.name, threat.roomName);
    return homeBoost + armedBoost + coreBoost - distancePenalty;
}

function shouldRenewPatrolNow(creep: Creep, threats: VisibleThreat[], homeRoomName: string): boolean {
    const ttl = creep.ticksToLive ?? 0;
    if (ttl <= 0) { return false; }
    if (threats.length === 0) { return true; }
    if (creep.memory.renewing) { return true; }
    if (ttl <= PATROL_RENEW_CRITICAL_TTL) { return true; }
    if (creep.room.name !== homeRoomName) { return false; }
    if (ttl > PATROL_RENEW_START_TTL) { return false; }

    return !threats.some((threat) => threat.isHomeThreat && threat.hostiles.length > 0);
}

function tryRenewPatrol(creep: Creep, homeRoomName: string): boolean {
    const ttl = creep.ticksToLive ?? 0;
    if (ttl <= 0) { return false; }
    if (!creep.memory.renewing && ttl > PATROL_RENEW_START_TTL) { return false; }

    if (!creep.memory.renewing && ttl <= PATROL_RENEW_START_TTL) {
        creep.memory.renewing = true;
    }
    if (creep.memory.renewing && ttl >= PATROL_RENEW_STOP_TTL) {
        creep.memory.renewing = false;
        return false;
    }
    if (!creep.memory.renewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        creep.moveTo(new RoomPosition(25, 25, homeRoomName), { reusePath: 4, visualizePathStyle: { stroke: '#f5d142' } });
        return true;
    }

    const room = Game.rooms[homeRoomName];
    if (!room) { return false; }
    const renewSpawn = acquireRenewSpawn(creep, room) ?? nearestSpawn(creep, room);
    if (!renewSpawn) { return false; }

    if (creep.pos.isNearTo(renewSpawn)) {
        renewSpawn.renewCreep(creep);
    } else {
        creep.moveTo(renewSpawn, { range: 1, reusePath: 1, visualizePathStyle: { stroke: '#f5d142' } });
    }
    return true;
}

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}
