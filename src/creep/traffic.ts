// Traffic yield system: request, honour, assign yield positions, compute priorities.

const TRAFFIC_YIELD_TTL = 2;

export function honorTrafficYieldRequest(creep: Creep): boolean {
    const until = creep.memory.trafficYieldUntil;
    const roomName = creep.memory.trafficYieldRoom;
    const x = creep.memory.trafficYieldX;
    const y = creep.memory.trafficYieldY;
    if (until == null || roomName == null || x == null || y == null) {
        clearTrafficYieldRequest(creep);
        return false;
    }
    if (until < Game.time) {
        clearTrafficYieldRequest(creep);
        return false;
    }
    if (creep.room.name !== roomName || creep.fatigue > 0) { return false; }

    const target = new RoomPosition(x, y, roomName);
    if (creep.pos.isEqualTo(target)) {
        clearTrafficYieldRequest(creep);
        return false;
    }

    const code = creep.moveTo(target, {
        range: 0,
        reusePath: 0,
        ignoreCreeps: false
    });
    if (code !== ERR_NO_PATH) { return true; }

    clearTrafficYieldRequest(creep);
    return false;
}

export function clearTrafficYieldRequest(creep: Creep): void {
    creep.memory.trafficYieldX = undefined;
    creep.memory.trafficYieldY = undefined;
    creep.memory.trafficYieldRoom = undefined;
    creep.memory.trafficYieldUntil = undefined;
}

export function requestTrafficYieldForPath(creep: Creep, targetPos: RoomPosition, targetRange: number): boolean {
    if (creep.fatigue > 0) { return false; }
    if (creep.room.name !== targetPos.roomName) { return false; }

    const nextStep = nextStepTowards(creep, targetPos, targetRange);
    if (!nextStep || nextStep.getRangeTo(creep.pos) > 1) { return false; }

    const blockers = nextStep.lookFor(LOOK_CREEPS).filter((other) => other.my && other.id !== creep.id);
    let yielded = false;
    for (const blocker of blockers) {
        if (!shouldYieldForTraffic(blocker, creep)) { continue; }
        if (!assignYieldPosition(blocker, creep, targetPos)) { continue; }
        yielded = true;
    }
    return yielded;
}

export function nextStepTowards(creep: Creep, targetPos: RoomPosition, targetRange: number): RoomPosition | null {
    if (creep.room.name === targetPos.roomName) {
        const localPath = creep.pos.findPathTo(targetPos, {
            range: Math.max(0, targetRange),
            ignoreCreeps: false,
            maxRooms: 1,
            maxOps: 2000
        });
        if (localPath.length > 0) {
            return new RoomPosition(localPath[0].x, localPath[0].y, creep.room.name);
        }
    }

    const route = PathFinder.search(creep.pos, { pos: targetPos, range: Math.max(0, targetRange) }, {
        maxRooms: 1
    });
    if (route.path.length === 0) { return null; }
    return route.path[0];
}

function shouldYieldForTraffic(blocker: Creep, requester: Creep): boolean {
    if (!blocker.my || blocker.spawning) { return false; }
    if (blocker.fatigue > 0 || blocker.getActiveBodyparts(MOVE) <= 0) { return false; }
    if (isStationaryMinerOnContainer(blocker)) { return false; }
    return trafficPriority(blocker) <= trafficPriority(requester);
}

function isStationaryMinerOnContainer(creep: Creep): boolean {
    if (!creep.memory.staticMining) { return false; }
    const archetype = creep.memory.archetype;
    if (archetype !== 'miner' && archetype !== 'remoteMiner') { return false; }
    const stationId = creep.memory.stationaryTargetId;
    if (!stationId) { return false; }
    const station = Game.getObjectById(stationId as Id<any>);
    if (!(station instanceof StructureContainer)) { return false; }
    return creep.pos.isEqualTo(station.pos);
}

function trafficPriority(creep: Creep): number {
    const archetype = creep.memory.archetype;
    const job = creep.memory.jobType;
    if (archetype === 'defender' || job === 'heal') { return 100; }
    if (archetype === 'remoteHauler' || archetype === 'hauler') { return 80; }
    if (job === 'travelRoom') { return 60; }
    if (job === 'idle') { return 10; }
    return 40;
}

function assignYieldPosition(blocker: Creep, requester: Creep, requesterTarget: RoomPosition): boolean {
    const room = Game.rooms[blocker.room.name];
    if (!room) { return false; }
    const terrain = room.getTerrain();

    let best: RoomPosition | null = null;
    let bestScore = -Infinity;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = blocker.pos.x + dx;
            const y = blocker.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const candidate = new RoomPosition(x, y, blocker.room.name);
            if (candidate.isEqualTo(requester.pos)) { continue; }
            if (candidate.lookFor(LOOK_CREEPS).some((other) => other.id !== blocker.id && other.id !== requester.id)) { continue; }
            const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }

            const score = candidate.getRangeTo(requesterTarget) - candidate.getRangeTo(requester.pos) * 0.5;
            if (!best || score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
    }

    if (!best) { return false; }
    blocker.memory.trafficYieldX = best.x;
    blocker.memory.trafficYieldY = best.y;
    blocker.memory.trafficYieldRoom = best.roomName;
    blocker.memory.trafficYieldUntil = Game.time + TRAFFIC_YIELD_TTL;
    return true;
}
