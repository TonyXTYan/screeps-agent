import * as creepHarvest from '../harvest';
import * as towerBasics from '../../tower/basics';

export function run(creep: Creep): void {
    if (creep.memory.upgrading === undefined) {
        creep.memory.upgrading = false;
    }

    if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.upgrading = false;
        creep.say('🔄 harvest');
    }
    if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
        creep.memory.upgrading = true;
        creep.say('⚡ upgrade');
    }

    if (creep.memory.upgrading) {
        if (towerBasics.tryFillTowerUnderSiege(creep)) { return; }

        creep.memory.harvestTargetSourceId = undefined;
        creep.memory.harvestTargetSourceIndex = undefined;

        if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.memory.stationaryWorking = false;
            creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#d9d9d9' } });
        }
    } else {
        creepHarvest.run(creep);
    }
}
