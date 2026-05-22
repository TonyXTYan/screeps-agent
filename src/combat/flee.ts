import { findHostiles } from '../hostileUtils';
import {
    emergencyHealTarget,
    emergencyHealWhileRetreating
} from './emergencyHealing';
import {
    nudgeFromEdge,
    retreatRemoteCreepFromHostiles
} from './remoteRetreat';

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
        nudgeFromEdge(creep);
    }
    return true;
}
