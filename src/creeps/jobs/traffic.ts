import {
    assignYieldPosition,
    clearTrafficYieldRequest,
    shouldYieldForTraffic
} from './trafficYieldHelpers';

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

function nextStepTowards(creep: Creep, targetPos: RoomPosition, targetRange: number): RoomPosition | null {
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
