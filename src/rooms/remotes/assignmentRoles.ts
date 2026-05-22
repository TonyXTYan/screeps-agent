import type { CreepCapabilities } from '../../creep.capabilities';
import { clearJob } from '../../creep.jobRunner';
import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { findHostiles } from '../../hostileUtils';
import { getRoomStructures } from '../../room.structures';
import { closest, closestReachable } from '../../utils/selection';
import { assignOverflowRemoteScout } from './scoutOverflow';
import { remoteRoomCrowdedForScout, remoteScoutPack } from './scouts';

const REMOTE_SCOUT_KEEP_COUNT = 2;

export { assignRemoteMaintainerRole } from './assignmentRoleMaintainer';
export { assignRemoteMinerRole } from './assignmentRoleMiner';

export function assignRemoteScoutRole(creep: Creep, homeRoom: string, remoteRoom: string): boolean {
    const scoutPack = remoteScoutPack(homeRoom, remoteRoom);
    const scoutRank = scoutPack.indexOf(creep.name);
    if (scoutPack.length > REMOTE_SCOUT_KEEP_COUNT && scoutRank >= REMOTE_SCOUT_KEEP_COUNT) {
        return assignOverflowRemoteScout(creep, homeRoom);
    }
    if (remoteRoomCrowdedForScout(creep, homeRoom, remoteRoom)) {
        return assignOverflowRemoteScout(creep, homeRoom, remoteRoom);
    }

    if (findHostiles(creep.room).length > 0 && creep.room.name !== homeRoom) {
        setTravelJob(creep, homeRoom);
        return true;
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }
    const hold = new RoomPosition(25, 25, remoteRoom);
    if (creep.pos.getRangeTo(hold) > 8) {
        creep.moveTo(hold, { visualizePathStyle: { stroke: '#a0b7ff' } });
    }
    clearJob(creep);
    return true;
}

export function assignRemoteFallbackRole(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    capabilities: CreepCapabilities
): boolean {
    // Fallback for legacy/misclassified remote creeps that still carry remote assignment.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        const structures = getRoomStructures(creep.room);
        const sink = structures.storage ?? closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
        } else {
            const towerFill = closest(creep, structures.towers.filter(t => t.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
            if (towerFill) {
                setJob(creep, 'refillTower', towerFill);
            } else {
                setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
            }
        }
        return true;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && capabilities.harvest > 0) {
        const source = closestReachable(creep, creep.room.find(FIND_SOURCES));
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        setJob(creep, 'idle', creep.room.controller);
    } else {
        setTravelJob(creep, remoteRoom);
    }
    return true;
}
