import { honorTrafficYieldRequest } from './traffic';
import { opportunisticRemoteHaulerWork, opportunisticHealNearby } from './offload';
import { travelRoom } from './travel';
import { mineralDepleted } from './movement';
import * as executor from './executor';

export function clearJob(creep: Creep): void {
    creep.memory.jobType = undefined;
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = undefined;
    creep.memory.jobAssignedAt = undefined;
    creep.memory.jobResourceType = undefined;
}

function shouldClearJob(creep: Creep, jobType: CreepJobType, result: number): boolean {
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

export function run(creep: Creep): boolean {
    if (honorTrafficYieldRequest(creep)) {
        creep.memory.lastJobResult = OK;
        return true;
    }

    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    let result: number | undefined;

    if (jobType === 'harvestSource') { result = executor.harvestSource(creep); }
    else if (jobType === 'withdrawEnergy') { result = executor.withdrawEnergy(creep); }
    else if (jobType === 'withdrawResource') { result = executor.withdrawResource(creep); }
    else if (jobType === 'pickupEnergy') { result = executor.pickupEnergy(creep); }
    else if (jobType === 'pickupResource') { result = executor.pickupResource(creep); }
    else if (jobType === 'depositEnergy') { result = executor.depositEnergy(creep); }
    else if (jobType === 'depositResource') { result = executor.depositResource(creep); }
    else if (jobType === 'refillSpawn') { result = executor.transferEnergy(creep); }
    else if (jobType === 'refillTower') { result = executor.transferEnergy(creep); }
    else if (jobType === 'build') { result = executor.build(creep); }
    else if (jobType === 'repair') { result = executor.repair(creep); }
    else if (jobType === 'upgrade') { result = executor.upgrade(creep); }
    else if (jobType === 'heal') { result = executor.heal(creep); }
    else if (jobType === 'mineMineral') { result = executor.mineMineral(creep); }
    else if (jobType === 'depositMineral') { result = executor.depositMineral(creep); }
    else if (jobType === 'reserveController') { result = executor.reserveController(creep); }
    else if (jobType === 'claimController') { result = executor.claimController(creep); }
    else if (jobType === 'travelRoom') { result = travelRoom(creep); }
    else if (jobType === 'idle') { result = executor.idle(creep); }

    if (result !== undefined) {
        creep.memory.lastJobResult = result;
        if (shouldClearJob(creep, jobType, result)) {
            clearJob(creep);
        }
        if (jobType !== 'build' && jobType !== 'repair') {
            opportunisticRemoteHaulerWork(creep, jobType);
        }
        if (jobType !== 'heal') {
            opportunisticHealNearby(creep);
        }
        return true;
    }

    return false;
}
