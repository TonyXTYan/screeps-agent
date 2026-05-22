import { emergencyHealWhileRetreating } from './emergencyHealing';

const REMOTE_RETREAT_DANGER_TICKS = 1500;

export function retreatRemoteCreepFromHostiles(creep: Creep): boolean {
    const homeRoom = creep.memory.homeRoom;
    if (!homeRoom || creep.room.name === homeRoom) { return false; }

    markRemoteDanger(creep, homeRoom);
    emergencyHealWhileRetreating(creep);
    creep.say('🏠');

    const exitDir = Game.map.findExit(creep.room, homeRoom);
    if (typeof exitDir === 'number' && exitDir >= TOP && exitDir <= LEFT) {
        const closestExit = creep.pos.findClosestByPath(exitDir as ExitConstant, {
            ignoreCreeps: true
        });
        if (closestExit) {
            const exitCode = creep.moveTo(closestExit, {
                ignoreCreeps: true,
                maxRooms: 1,
                reusePath: 0,
                visualizePathStyle: { stroke: '#ff4d4d' }
            });
            if (exitCode !== ERR_NO_PATH) { return true; }
        }
    }

    creep.moveTo(new RoomPosition(25, 25, homeRoom), {
        ignoreCreeps: true,
        maxRooms: 8,
        reusePath: 0,
        visualizePathStyle: { stroke: '#ff4d4d' }
    });
    return true;
}

export function nudgeFromEdge(creep: Creep): void {
    if (creep.pos.x === 0 && creep.pos.y === 0) {
        creep.move(BOTTOM_RIGHT);
        return;
    }
    if (creep.pos.x === 0 && creep.pos.y === 49) {
        creep.move(TOP_RIGHT);
        return;
    }
    if (creep.pos.x === 49 && creep.pos.y === 0) {
        creep.move(BOTTOM_LEFT);
        return;
    }
    if (creep.pos.x === 49 && creep.pos.y === 49) {
        creep.move(TOP_LEFT);
        return;
    }
    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
    }
}

function markRemoteDanger(creep: Creep, homeRoom: string): void {
    const remoteRoom = creep.memory.remoteRoom ?? creep.room.name;
    const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
    if (!plan) { return; }

    plan.lastSeenHostiles = Game.time;
    plan.dangerUntil = Math.max(plan.dangerUntil ?? 0, Game.time + REMOTE_RETREAT_DANGER_TICKS);
    plan.skipReason = 'danger';
}
