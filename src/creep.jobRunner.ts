import { executeJob, shouldClearJob } from './creeps/jobs/execution';
import { honorTrafficYieldRequest } from './creeps/jobs/traffic';
import {
    opportunisticHealNearby,
    opportunisticRemoteHaulerWork
} from './creeps/jobs/sideEffects';

export function run(creep: Creep): boolean {
    if (honorTrafficYieldRequest(creep)) {
        creep.memory.lastJobResult = OK;
        return true;
    }

    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    const result = executeJob(creep, jobType);

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

export function clearJob(creep: Creep): void {
    creep.memory.jobType = undefined;
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = undefined;
    creep.memory.jobAssignedAt = undefined;
    creep.memory.jobResourceType = undefined;
}
