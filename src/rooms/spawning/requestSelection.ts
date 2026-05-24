import {
    ensureArchetype
} from '../../creep.capabilities';
import {
    mineralReadyToMine,
    sourceSpawnDeficit
} from '../planning/sources';
import {
    stationaryTargetIdForMineral,
    stationaryTargetIdForSource
} from '../jobs/sourceAssignment';
import type { PendingSpawnRequest, RoomControllerContext, SpawnRequest } from '../controllerTypes';
import {
    addPendingCapabilities,
    measureCapabilities,
    pendingArchetypeCount
} from './accounting';
import {
    desiredHaulerCapacity,
    desiredWorkerWork,
    maxWorkerCount,
    workerWorkRatio
} from './requestDemand';
import { remoteSpawnRequest } from './remote';
export { desiredHaulerCapacity, desiredWorkerWork } from './requestDemand';

export function chooseSpawnRequest(context: RoomControllerContext, pending: PendingSpawnRequest[] = []): SpawnRequest | null {
    const capacities = addPendingCapabilities(measureCapabilities(context.creeps), pending);
    const { demand: haulerCapacityDemand, maxCount: maxHaulerCount } = desiredHaulerCapacity(context);
    const workerWorkDemand = desiredWorkerWork(context);

    if (context.creeps.length === 0 && !pending.some(r => r.archetype === 'worker')) {
        return { archetype: 'worker', reason: 'emergency recovery' };
    }

    const pendingSourceIds = new Set(
        pending.filter(r => r.archetype === 'miner' && r.sourceId).map(r => r.sourceId!)
    );
    const sourceDeficit = sourceSpawnDeficit(context, pendingSourceIds);
    if (sourceDeficit) {
        return {
            archetype: 'miner',
            reason: 'source harvest deficit ' + sourceDeficit.source.id,
            sourceId: sourceDeficit.source.id,
            stationaryTargetId: stationaryTargetIdForSource(sourceDeficit),
            staticMining: sourceDeficit.staticMining
        };
    }

    if (capacities.heal === 0 && !pending.some(r => r.archetype === 'doctor') &&
        context.room.energyCapacityAvailable >= 450) {
        return { archetype: 'doctor', reason: 'no heal-capable creep' };
    }

    const pendingHaulerCount = pendingArchetypeCount(pending, 'hauler');
    const haulerCount = context.creeps.filter(c => ensureArchetype(c) === 'hauler' && !c.spawning).length;
    if (context.structures.storage && (context.room.controller?.level ?? 0) >= 4 &&
        haulerCount + pendingHaulerCount < 2) {
        return { archetype: 'hauler', reason: 'min hauler count 2' };
    }

    const haulerCountWithPending = haulerCount + pendingHaulerCount;
    if (capacities.haulerCapacity < haulerCapacityDemand &&
        haulerCountWithPending < maxHaulerCount &&
        !pending.some(r => r.archetype === 'hauler')) {
        return { archetype: 'hauler', reason: 'haul deficit ' + capacities.haulerCapacity + '/' + haulerCapacityDemand + ' ' + haulerCountWithPending + '/' + maxHaulerCount };
    }

    if (capacities.workerWork < workerWorkDemand && !pending.some(r => r.archetype === 'worker')) {
        const workerCountCap = maxWorkerCount(context);
        const workerCreeps = context.creeps.filter(c => ensureArchetype(c) === 'worker' && !c.spawning).length +
            pendingArchetypeCount(pending, 'worker');
        if (workerCreeps < workerCountCap) {
            return { archetype: 'worker', reason: 'worker deficit ' + capacities.workerWork + '/' + workerWorkDemand + ' ' + workerCreeps + '/' + workerCountCap, workRatio: workerWorkRatio(context) };
        }
    }

    if (mineralReadyToMine(context) && context.mineralPlan &&
        !pending.some(r => r.archetype === 'mineralMiner') &&
        capacities.mineralMinerWork === 0) {
        return {
            archetype: 'mineralMiner',
            reason: 'passive mineral extraction',
            mineralId: context.mineralPlan.mineral.id,
            stationaryTargetId: stationaryTargetIdForMineral(context.mineralPlan),
            staticMining: context.mineralPlan.staticMining
        };
    }

    const claimTargets = context.room.memory.plan?.claimTargets ?? [];
    if (claimTargets.length > 0 && capacities.claim === 0 && !pending.some(r => r.archetype === 'claimer')) {
        return { archetype: 'claimer', reason: 'configured claim target ' + claimTargets[0], remoteRoom: claimTargets[0], remoteMode: 'claim', maxClaimParts: 5 };
    }

    return remoteSpawnRequest(context, capacities, pending);
}
