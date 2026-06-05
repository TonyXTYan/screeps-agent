import { findHostiles } from '../hostileUtils';
import { acquireRenewSpawn, nearestSpawn } from '../spawn/renewal';
import { ensureArchetype } from '../creep/capabilities';
import { mirrorExitPositionIntoRoom } from '../room/remote/routing';
import { nudgeFromRoomEdge, moveToJobTarget } from '../creep/movement';

const PATROL_HOLD_RANGE = 8;
const PATROL_RENEW_START_TTL = 300;
const PATROL_RENEW_THREAT_STOP_TTL = 500;
const PATROL_RENEW_STOP_TTL = 1400;
const PATROL_CONTROLLER_LOITER_RANGE = 5;
const PATROL_CONTROLLER_LOITER_MIN_RANGE = 4;
const PATROL_CONTROLLER_LOITER_MAX_RANGE = 6;

let patrolCacheTick = -1;
const activePatrolNamesCache = new Map<string, string[]>();
const patrolThreatAssignmentCache = new Map<string, { [creepName: string]: string }>();

type VisibleThreat = {
    roomName: string;
    hostiles: Creep[];
    invaderCore: StructureInvaderCore | null;
    isHomeThreat: boolean;
};

// Keep as a dedicated function so cadence can become dynamic later.
export function getPatrolRotationTicks(): number {
    return 50;
}

export function run(creep: Creep): void {
    const homeRoom = creep.memory.homeRoom ?? creep.room.name;
    const enabledRemotes = enabledRemoteRooms(homeRoom);
    const visibleThreats = visibleRemoteThreats(homeRoom, enabledRemotes);

    if (shouldRenewPatrolNow(creep, visibleThreats) && tryRenewPatrol(creep, homeRoom)) {
        return;
    }

    if (visibleThreats.length > 0) {
        runThreatResponse(creep, visibleThreats);
        return;
    }

    runPatrolRotation(creep, enabledRemotes, homeRoom);
}

function runThreatResponse(creep: Creep, threats: VisibleThreat[]): void {
    const homeRoom = creep.memory.homeRoom ?? creep.room.name;
    const targetRoom = selectThreatRoomForPatrol(creep, threats, homeRoom);
    if (!targetRoom) { return; }

    healFriendly(creep);

    if (creep.room.name !== targetRoom.roomName) {
        movePatrolToRoom(creep, targetRoom.roomName, homeRoom, '#ef4444');
        return;
    }

    const target = selectCombatTarget(creep, targetRoom.hostiles);
    if (target) {
        const range = creep.pos.getRangeTo(target);
        if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
            const nearbyHostiles = targetRoom.hostiles.filter((hostile) => creep.pos.getRangeTo(hostile) <= 3).length;
            if (nearbyHostiles >= 2) {
                creep.rangedMassAttack();
            } else {
                creep.rangedAttack(target);
            }
        }
        const attackCode = creep.attack(target);
        // Stay inside the threat room: a hostile hugging the room edge must not pull
        // us across the border. Crossing drops vision of the room and reverts us to
        // rotation, producing the W<->W boundary bounce. Step inward instead.
        if (nudgeFromRoomEdge(creep)) { return; }
        if (attackCode === ERR_NOT_IN_RANGE) {
            moveToCombatTarget(creep, target, '#ef4444');
        }
        return;
    }
    if (!targetRoom.invaderCore) { return; }
    if (creep.pos.getRangeTo(targetRoom.invaderCore) <= 3 && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
        creep.rangedAttack(targetRoom.invaderCore);
    }
    const coreAttackCode = creep.attack(targetRoom.invaderCore);
    if (nudgeFromRoomEdge(creep)) { return; }
    if (coreAttackCode === ERR_NOT_IN_RANGE) {
        moveToCombatTarget(creep, targetRoom.invaderCore, '#ef4444');
    }
}

// Pursue a combat target without leaving the current room: clamp pathing to this
// room (maxRooms) and treat the room's exit tiles as impassable so a step never
// lands the patrol on an edge (which would auto-transfer it to the adjacent room
// next tick). Together with the nudge-off-edge guard this keeps threat response
// committed to the danger room instead of ping-ponging across the boundary.
function moveToCombatTarget(creep: Creep, target: Creep | StructureInvaderCore, stroke: string): void {
    creep.moveTo(target, {
        reusePath: 1,
        maxRooms: 1,
        visualizePathStyle: { stroke },
        costCallback: (roomName, matrix) => {
            if (roomName !== creep.room.name) { return undefined; }
            for (let i = 0; i < 50; i++) {
                matrix.set(0, i, 0xff);
                matrix.set(49, i, 0xff);
                matrix.set(i, 0, 0xff);
                matrix.set(i, 49, 0xff);
            }
            return matrix;
        }
    });
}

function runPatrolRotation(creep: Creep, enabledRemotes: string[], homeRoom: string): void {
    const cadence = getPatrolRotationTicks();
    if (enabledRemotes.length === 0) {
        if (creep.room.name !== homeRoom) {
            moveToJobTarget(creep, new RoomPosition(25, 25, homeRoom), '#f59e0b');
        }
        return;
    }

    const currentTarget = creep.memory.patrolRoom;
    const currentStillValid = currentTarget ? enabledRemotes.includes(currentTarget) : false;
    if (!currentStillValid) {
        rotatePatrolTarget(creep, enabledRemotes, homeRoom);
    }

    const patrolRoom = creep.memory.patrolRoom ?? enabledRemotes[0];
    if (creep.room.name !== patrolRoom) {
        markPatrolTravelTarget(creep, patrolRoom);
        movePatrolToRoom(creep, patrolRoom, homeRoom, '#f59e0b');
        return;
    }

    startPatrolLoiterWindow(creep, patrolRoom, cadence);
    const loiterUntil = creep.memory.patrolLoiterUntil ?? (Game.time + cadence);
    if (Game.time >= loiterUntil) {
        rotatePatrolTarget(creep, enabledRemotes);
        const nextRoom = creep.memory.patrolRoom ?? patrolRoom;
        if (nextRoom === patrolRoom) {
            creep.memory.patrolLoiterUntil = Game.time + cadence;
        } else {
            startPatrolLoiterWindow(creep, nextRoom, cadence);
        }
        if (nextRoom !== patrolRoom) {
            movePatrolToRoom(creep, nextRoom, homeRoom, '#f59e0b');
            return;
        }
    }

    if (!controllerLoiterStep(creep, patrolRoom)) {
        const hold = new RoomPosition(25, 25, patrolRoom);
        if (creep.pos.getRangeTo(hold) > PATROL_HOLD_RANGE) {
            creep.moveTo(hold, { reusePath: 8, visualizePathStyle: { stroke: '#f59e0b' } });
        }
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

function rotatePatrolTarget(creep: Creep, enabledRemotes: string[], homeRoom?: string): void {
    if (enabledRemotes.length === 0) { return; }
    const currentTarget = creep.memory.patrolRoom;
    const currentIndex = currentTarget ? enabledRemotes.indexOf(currentTarget) : -1;
    let nextIndex: number;
    if (homeRoom !== undefined || currentIndex < 0) {
        // Seed: spread patrols by rank in the sorted active-patrol list so each starts at a different room.
        const patrolNames = homeRoom ? activeHomePatrolNames(homeRoom) : [];
        const rank = patrolNames.indexOf(creep.name);
        nextIndex = rank >= 0
            ? rank % enabledRemotes.length
            : Math.abs(hashString(creep.name)) % enabledRemotes.length;
    } else {
        nextIndex = (currentIndex + 1) % enabledRemotes.length;
    }
    creep.memory.patrolRouteIndex = nextIndex;
    creep.memory.patrolRoom = enabledRemotes[nextIndex];
    creep.memory.patrolRotateAt = Game.time + getPatrolRotationTicks();
}

function startPatrolLoiterWindow(creep: Creep, patrolRoom: string, cadence: number): void {
    if (creep.memory.patrolLoiterRoom !== patrolRoom || !creep.memory.patrolLoiterUntil) {
        creep.memory.patrolLoiterRoom = patrolRoom;
        creep.memory.patrolLoiterUntil = Game.time + cadence;
    }
}

function markPatrolTravelTarget(creep: Creep, patrolRoom: string): void {
    if (creep.memory.patrolLoiterRoom === patrolRoom) { return; }
    creep.memory.patrolLoiterRoom = patrolRoom;
    creep.memory.patrolLoiterUntil = undefined;
}

function movePatrolToRoom(
    creep: Creep,
    targetRoomName: string,
    homeRoomName: string,
    stroke: string
): void {
    // Pure travel: route through the shared stuck-aware mover so highway crossings use the
    // ignoreCreeps:true terrain cache (no per-tick repath when a hauler sits on the path) and
    // gain swap/yield + escape recovery in 1-wide edge pockets. The anchor (room controller /
    // entry tile / centre) is fixed, so the long-reuse cache is safe. Combat pursuit and loiter
    // keep their bespoke creep-avoiding logic.
    const anchor = patrolTravelAnchor(targetRoomName, homeRoomName);
    moveToJobTarget(creep, anchor, stroke);
}

function patrolTravelAnchor(targetRoomName: string, homeRoomName: string): RoomPosition {
    const visibleTarget = Game.rooms[targetRoomName];
    if (visibleTarget?.controller) {
        return visibleTarget.controller.pos;
    }
    const entry = remoteEntryAnchor(homeRoomName, targetRoomName);
    if (entry) { return entry; }
    return new RoomPosition(25, 25, targetRoomName);
}

function remoteEntryAnchor(homeRoomName: string, targetRoomName: string): RoomPosition | null {
    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) { return null; }
    const exitDirection = Game.map.findExit(homeRoomName, targetRoomName);
    if (typeof exitDirection !== 'number' || exitDirection < TOP || exitDirection > LEFT) { return null; }
    const exits = homeRoom.find(exitDirection as ExitConstant) as RoomPosition[];
    if (exits.length === 0) { return null; }
    const origin = homeRoom.storage?.pos ?? homeRoom.find(FIND_MY_SPAWNS)[0]?.pos ?? new RoomPosition(25, 25, homeRoomName);
    let best = exits[0];
    let bestRange = origin.getRangeTo(best);
    for (const exit of exits) {
        const range = origin.getRangeTo(exit);
        if (range < bestRange) {
            best = exit;
            bestRange = range;
        }
    }
    return mirrorExitPositionIntoRoom(best, targetRoomName);
}

function controllerLoiterStep(creep: Creep, patrolRoom: string): boolean {
    const room = Game.rooms[patrolRoom];
    const controller = room?.controller;
    if (!controller || creep.room.name !== patrolRoom) { return false; }
    const controllerRange = creep.pos.getRangeTo(controller);
    if (controllerRange < PATROL_CONTROLLER_LOITER_MIN_RANGE || controllerRange > PATROL_CONTROLLER_LOITER_MAX_RANGE) {
        creep.moveTo(controller, { range: PATROL_CONTROLLER_LOITER_RANGE, reusePath: 2, visualizePathStyle: { stroke: '#f59e0b' } });
        return true;
    }
    const loiter = controllerLoiterPoint(controller, creep.name);
    if (!loiter) { return false; }
    creep.moveTo(loiter, { reusePath: 1, visualizePathStyle: { stroke: '#f59e0b' } });
    return true;
}

function controllerLoiterPoint(controller: StructureController, creepName: string): RoomPosition | null {
    const room = controller.room;
    const terrain = room.getTerrain();
    for (let i = 0; i < 20; i++) {
        const seed = Math.abs(hashString(creepName + ':' + room.name + ':' + Game.time + ':' + i));
        const dx = (seed % 13) - 6;
        const dy = (Math.floor(seed / 13) % 13) - 6;
        const range = Math.max(Math.abs(dx), Math.abs(dy));
        if (range < PATROL_CONTROLLER_LOITER_MIN_RANGE || range > PATROL_CONTROLLER_LOITER_MAX_RANGE) { continue; }
        const x = controller.pos.x + dx;
        const y = controller.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) { continue; }
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
        const pos = new RoomPosition(x, y, room.name);
        const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART);
        if (blocked) { continue; }
        if (pos.lookFor(LOOK_CREEPS).length > 0) { continue; }
        return pos;
    }
    return null;
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

function selectThreatRoomForPatrol(
    creep: Creep,
    threats: VisibleThreat[],
    homeRoom: string
): VisibleThreat | null {
    if (threats.length === 0) { return null; }

    const assignments = assignPatrolThreatRooms(homeRoom, threats);
    const assignedRoom = assignments[creep.name];
    if (assignedRoom) {
        const assignedThreat = threats.find((threat) => threat.roomName === assignedRoom);
        if (assignedThreat) { return assignedThreat; }
    }

    return selectThreatRoomFallback(homeRoom, threats);
}

function selectThreatRoomFallback(homeRoom: string, threats: VisibleThreat[]): VisibleThreat | null {
    if (threats.length === 0) { return null; }
    const scored = scoreThreats(homeRoom, threats);
    return scored[0]?.threat ?? null;
}

function assignPatrolThreatRooms(homeRoom: string, threats: VisibleThreat[]): { [creepName: string]: string } {
    refreshPatrolCachesForTick();
    const assignments: { [creepName: string]: string } = {};
    if (threats.length === 0) { return assignments; }
    const cacheKey = homeRoom + '|' + threatSignature(threats);
    const cached = patrolThreatAssignmentCache.get(cacheKey);
    if (cached) { return cached; }

    const patrolNames = activeHomePatrolNames(homeRoom);
    if (patrolNames.length === 0) { return assignments; }

    const scoredThreats = scoreThreats(homeRoom, threats);
    const armedThreats = scoredThreats.filter((entry) => entry.threat.hostiles.length > 0);
    const targetThreats = armedThreats.length > 0 ? armedThreats : scoredThreats;
    if (targetThreats.length === 0) { return assignments; }

    const slots = allocateThreatSlots(targetThreats, patrolNames.length);
    for (let i = 0; i < patrolNames.length; i++) {
        assignments[patrolNames[i]] = slots[i];
    }
    patrolThreatAssignmentCache.set(cacheKey, assignments);
    return assignments;
}

function activeHomePatrolNames(homeRoom: string): string[] {
    refreshPatrolCachesForTick();
    const cached = activePatrolNamesCache.get(homeRoom);
    if (cached) { return cached; }
    const names: string[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if ((creep.memory.homeRoom ?? creep.room.name) !== homeRoom) { continue; }
        if (creep.memory.renewing) { continue; }
        if (ensureArchetype(creep) !== 'patrol') { continue; }
        names.push(name);
    }
    names.sort();
    activePatrolNamesCache.set(homeRoom, names);
    return names;
}

function refreshPatrolCachesForTick(): void {
    if (patrolCacheTick === Game.time) { return; }
    patrolCacheTick = Game.time;
    activePatrolNamesCache.clear();
    patrolThreatAssignmentCache.clear();
}

function threatSignature(threats: VisibleThreat[]): string {
    const parts = threats.map((threat) =>
        threat.roomName + ':' + threat.hostiles.length + ':' + (threat.invaderCore ? '1' : '0'));
    parts.sort();
    return parts.join('|');
}

type ThreatScore = {
    threat: VisibleThreat;
    score: number;
};

function scoreThreats(homeRoom: string, threats: VisibleThreat[]): ThreatScore[] {
    const scored = threats.map((threat) => ({
        threat,
        score: threatPriority(threat, homeRoom)
    }));
    scored.sort((a, b) => b.score - a.score || a.threat.roomName.localeCompare(b.threat.roomName));
    return scored;
}

function allocateThreatSlots(scoredThreats: ThreatScore[], patrolCount: number): string[] {
    const slots: string[] = [];
    if (scoredThreats.length === 0 || patrolCount <= 0) { return slots; }

    for (const entry of scoredThreats) {
        if (slots.length >= patrolCount) { break; }
        slots.push(entry.threat.roomName);
    }

    let index = 0;
    while (slots.length < patrolCount) {
        slots.push(scoredThreats[index % scoredThreats.length].threat.roomName);
        index++;
    }

    return slots;
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

function threatPriority(threat: VisibleThreat, originRoomName: string): number {
    const homeBoost = threat.isHomeThreat && threat.hostiles.length > 0 ? 10000 : 0;
    const armedBoost = threat.hostiles.length > 0 ? 1000 : 0;
    const coreBoost = threat.invaderCore ? 100 : 0;
    const distancePenalty = Game.map.getRoomLinearDistance(originRoomName, threat.roomName);
    return homeBoost + armedBoost + coreBoost - distancePenalty;
}

function shouldRenewPatrolNow(creep: Creep, threats: VisibleThreat[]): boolean {
    const ttl = creep.ticksToLive ?? 0;
    if (ttl <= 0) { return false; }
    const hasAnyArmedThreat = threats.some((threat) => threat.hostiles.length > 0);
    if (creep.memory.renewing) {
        if (hasAnyArmedThreat && ttl > PATROL_RENEW_THREAT_STOP_TTL) {
            creep.memory.renewing = false;
            return false;
        }
        if (!hasAnyArmedThreat && ttl >= PATROL_RENEW_STOP_TTL) {
            creep.memory.renewing = false;
            return false;
        }
        return true;
    }
    if (ttl > PATROL_RENEW_START_TTL) { return false; }
    creep.memory.renewing = true;
    return true;
}

function tryRenewPatrol(creep: Creep, homeRoomName: string): boolean {
    const ttl = creep.ticksToLive ?? 0;
    if (ttl <= 0) { return false; }
    if (!creep.memory.renewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        moveToJobTarget(creep, new RoomPosition(25, 25, homeRoomName), '#f5d142');
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
