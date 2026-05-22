import { findHostiles } from './hostiles';
import { emergencyHealTarget, emergencyHealWhileRetreating } from './heal';
import { REMOTE_DANGER_TICKS } from '../constants';
import { nudgeFromRoomEdge } from '../utils/path';

export function markRemoteDanger(creep: Creep, homeRoom: string): void {
    const remoteRoom = creep.memory.remoteRoom ?? creep.room.name;
    const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
    if (!plan) { return; }

    plan.lastSeenHostiles = Game.time;
    plan.dangerUntil = Math.max(plan.dangerUntil ?? 0, Game.time + REMOTE_DANGER_TICKS);
    plan.skipReason = 'danger';
}

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

export function fleeFromHostiles(creep: Creep): boolean {
    const hostiles = findHostiles(creep.room);
    if (hostiles.length === 0) { return false; }
    const nearbyHostile = hostiles.find(h => creep.pos.getRangeTo(h) <= 5);
    if (!nearbyHostile) { return false; }

    if (retreatRemoteCreepFromHostiles(creep)) { return true; }

    const emergencyTarget = emergencyHealTarget(creep);
    if (emergencyTarget) {
        creep.say('🩺');
        const healCode = creep.heal(emergencyTarget);
        if (healCode === ERR_NOT_IN_RANGE) {
            creep.rangedHeal(emergencyTarget);
            creep.moveTo(emergencyTarget, { visualizePathStyle: { stroke: '#ff4d4d' } });
        }
        return true;
    }

    emergencyHealWhileRetreating(creep);

    creep.say('😱');
    const result = PathFinder.search(
        creep.pos,
        hostiles.map(h => ({ pos: h.pos, range: 5 })),
        { flee: true, maxRooms: 1 }
    );
    if (result.path.length > 0) {
        creep.move(creep.pos.getDirectionTo(result.path[0]));
    } else if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
        creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom), { visualizePathStyle: { stroke: '#ff4d4d' } });
    } else {
        nudgeFromRoomEdge(creep);
    }
    return true;
}
