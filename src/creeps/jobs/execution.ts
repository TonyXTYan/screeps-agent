import { travelRoom } from './movement';
import { harvestSource, mineMineral } from './executionHarvest';
import {
    depositEnergy,
    depositMineral,
    depositResource,
    pickupEnergy,
    pickupResource,
    transferEnergy,
    withdrawEnergy,
    withdrawResource
} from './executionTransfer';
import {
    build,
    claimController,
    heal,
    idle,
    repair,
    reserveController,
    upgrade
} from './executionWork';
import { mineralDepleted } from './executionTargets';

export function executeJob(creep: Creep, jobType: CreepJobType): number | undefined {
    if (jobType === 'harvestSource') { return harvestSource(creep); }
    if (jobType === 'withdrawEnergy') { return withdrawEnergy(creep); }
    if (jobType === 'withdrawResource') { return withdrawResource(creep); }
    if (jobType === 'pickupEnergy') { return pickupEnergy(creep); }
    if (jobType === 'pickupResource') { return pickupResource(creep); }
    if (jobType === 'depositEnergy') { return depositEnergy(creep); }
    if (jobType === 'depositResource') { return depositResource(creep); }
    if (jobType === 'refillSpawn') { return transferEnergy(creep); }
    if (jobType === 'refillTower') { return transferEnergy(creep); }
    if (jobType === 'build') { return build(creep); }
    if (jobType === 'repair') { return repair(creep); }
    if (jobType === 'upgrade') { return upgrade(creep); }
    if (jobType === 'heal') { return heal(creep); }
    if (jobType === 'mineMineral') { return mineMineral(creep); }
    if (jobType === 'depositMineral') { return depositMineral(creep); }
    if (jobType === 'reserveController') { return reserveController(creep); }
    if (jobType === 'claimController') { return claimController(creep); }
    if (jobType === 'travelRoom') { return travelRoom(creep); }
    if (jobType === 'idle') { return idle(creep); }
    return undefined;
}

export function shouldClearJob(creep: Creep, jobType: CreepJobType, result: number): boolean {
    if (jobType === 'harvestSource') {
        return result === ERR_INVALID_TARGET;
    }

    if (jobType === 'mineMineral') {
        return result === ERR_INVALID_TARGET ||
            (result === ERR_NOT_ENOUGH_RESOURCES && mineralDepleted(creep));
    }

    if (jobType === 'build' || jobType === 'repair' || jobType === 'upgrade') {
        return result === ERR_INVALID_TARGET ||
            result === ERR_NOT_ENOUGH_RESOURCES ||
            result === ERR_FULL;
    }

    if (jobType === 'heal') {
        return result === ERR_INVALID_TARGET;
    }

    if (jobType === 'travelRoom') {
        const targetRoom = creep.memory.jobRoomName;
        return result === ERR_INVALID_TARGET ||
            (result === OK && !!targetRoom && creep.room.name === targetRoom);
    }

    if (jobType === 'reserveController' || jobType === 'claimController') {
        return result === OK || result === ERR_INVALID_TARGET;
    }

    return result === OK ||
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_FULL;
}
