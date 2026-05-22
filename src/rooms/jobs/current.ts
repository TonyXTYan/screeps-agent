import { getCreepCapabilities } from '../../creep.capabilities';
import { clearJob } from '../../creep.jobRunner';
import { bestHealTarget, isEmergencyHealTarget } from '../../combat/healing';
import { jobTarget, rememberActiveAsPrimary } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    refillSpawnTarget,
    refillTowerTarget,
    roomNeedsCriticalEnergyRecovery
} from '../energy';
import { shouldInterruptForEmergencyEnergyDelivery } from './emergencyEnergy';
import {
    clearStaticMiningMemory,
} from './sourceAssignment';
import {
    reserveConstructionProgress,
    reserveDroppedTarget,
    reserveEnergySink,
    reserveRepairProgress,
    reserveResourceTarget
} from './reservations';
import { currentJobStillValid } from './validity';

export function keepCurrentJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    const capabilities = getCreepCapabilities(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();

    if (shouldInterruptForEmergencyEnergyDelivery(context, creep, archetype, jobType, reservations, capabilities)) {
        clearJob(creep);
        creep.memory.interruptReason = 'emergency-refill';
        return false;
    }

    if (totalUsed > energyUsed && jobType !== 'depositResource') {
        clearJob(creep);
        creep.memory.interruptReason = 'deposit-resource';
        return false;
    }

    if (capabilities.heal > 0 && context.injuredCreeps.length > 0) {
        const priorityHealTarget = bestHealTarget(creep, context.injuredCreeps);
        if (!priorityHealTarget) {
            clearJob(creep);
            creep.memory.interruptReason = 'heal';
            return false;
        }

        const currentHealTarget = jobType === 'heal'
            ? jobTarget<Creep>(creep)
            : null;
        const priorityIsEmergency = isEmergencyHealTarget(priorityHealTarget);
        const currentIsEmergency = Boolean(currentHealTarget && isEmergencyHealTarget(currentHealTarget));

        if (jobType !== 'heal') {
            clearJob(creep);
            creep.memory.interruptReason = 'heal';
            return false;
        }

        if (creep.memory.jobTargetId !== priorityHealTarget.id && (priorityIsEmergency || !currentIsEmergency)) {
            clearJob(creep);
            creep.memory.interruptReason = 'heal-priority';
            return false;
        }
    }

    if (jobType === 'build' || jobType === 'repair' || jobType === 'upgrade') {
        if (energyUsed === 0) {
            rememberActiveAsPrimary(creep);
            clearJob(creep);
            return false;
        }

        if (shouldInterruptForEnergyRefill(context, creep, archetype, reservations)) {
            rememberActiveAsPrimary(creep);
            clearJob(creep);
            creep.memory.interruptReason = 'refill';
            return false;
        }
    }

    if (!currentJobStillValid(context, creep, jobType, reservations, capabilities)) {
        clearJob(creep);
        return false;
    }

    if (jobType === 'harvestSource' && archetype === 'miner') {
        const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        if (sourceId) {
            const hasUncovered = context.sourcePlans.some(
                plan => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0
            );
            const currentCount = reservations.sourceMinerCount[sourceId] ?? 0;
            if (hasUncovered && currentCount > 1) {
                reservations.sourceMinerCount[sourceId] = currentCount - 1;
                reservations.sourceWork[sourceId] = Math.max(0,
                    (reservations.sourceWork[sourceId] ?? 0) - capabilities.harvest);
                creep.memory.sourceId = undefined;
                creep.memory.assignedSourceId = undefined;
                clearStaticMiningMemory(creep);
                clearJob(creep);
                creep.memory.interruptReason = 'source-redistribute';
                return false;
            }
        }
    }

    reserveCurrentJob(creep, jobType, reservations, capabilities);
    return true;
}

function reserveCurrentJob(
    creep: Creep,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): void {
    const target = jobTarget<RoomObject & { id: string }>(creep);
    if (!target) { return; }

    if (jobType === 'withdrawResource') {
        reserveResourceTarget(reservations, target.id, creep.store.getFreeCapacity());
    } else if (jobType === 'withdrawEnergy') {
        reserveResourceTarget(reservations, target.id, creep.store.getFreeCapacity(RESOURCE_ENERGY));
    } else if (jobType === 'pickupEnergy' || jobType === 'pickupResource') {
        reserveDroppedTarget(reservations, target.id, creep.store.getFreeCapacity());
    } else if (jobType === 'depositEnergy' || jobType === 'refillSpawn' || jobType === 'refillTower') {
        reserveEnergySink(reservations, target as EnergyStructure, creep.store.getUsedCapacity(RESOURCE_ENERGY));
    } else if (jobType === 'build') {
        reserveConstructionProgress(reservations, target as ConstructionSite, capabilities.build);
    } else if (jobType === 'repair') {
        reserveRepairProgress(reservations, target as AnyStructure, capabilities.repair);
    } else if (jobType === 'upgrade') {
        reservations.upgraderWork += capabilities.upgrade;
    }
}

function shouldInterruptForEnergyRefill(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    if (archetype === 'miner' || archetype === 'mineralMiner' ||
        (archetype === 'worker' && context.structures.storage)) { return false; }
    if (!roomNeedsCriticalEnergyRecovery(context)) { return false; }
    if (refillSpawnTarget(context, creep, reservations)) { return true; }
    return refillTowerTarget(context, creep, reservations) !== null;
}
