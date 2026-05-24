import { getCreepCapabilities } from '../../creep.capabilities';
import { setJob } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { clearStaticMiningMemory, closestSourcePlan } from './sourceAssignment';
import { haulerMiningSiteMinPickup, hasEnergyToGather } from './energyTargets';
import { assignEnergySpendingJob, assignWorkerPartialEnergyWork } from './energyWork';
import { assignHaulAcquisitionJob } from './assignmentHauling';

type Capabilities = ReturnType<typeof getCreepCapabilities>;

export function handleEnergyCarryingFlow(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: Capabilities,
    reservations: JobReservations,
    energyUsed: number
): boolean {
    if (energyUsed <= 0) { return false; }

    if (archetype === 'worker' &&
        creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        hasEnergyToGather(context)) {
        return assignWorkerPartialEnergyWork(context, creep, capabilities, reservations);
    }

    if (archetype === 'hauler' &&
        creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        (context.sourcePlans.some(p => p.container &&
            creep.pos.getRangeTo(p.container) <= 3 &&
            p.container.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)) ||
            context.structures.links.source.some(l =>
                creep.pos.getRangeTo(l) <= 3 &&
                l.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)))) {
        // Hauler at a source site with free capacity; top up before leaving.
        return false;
    }

    assignEnergySpendingJob(context, creep, archetype, capabilities, reservations);
    return true;
}

export function handlePostEnergyFallbackFlow(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    if (capabilities.haul > 0) {
        if (assignHaulAcquisitionJob(context, creep, archetype, reservations)) { return true; }
    }

    if (capabilities.harvest > 0 && archetype !== 'hauler' && archetype !== 'remoteHauler') {
        const fallbackSourcePlan = closestSourcePlan(creep, context.sourcePlans);
        if (fallbackSourcePlan) {
            clearStaticMiningMemory(creep);
            setJob(creep, 'harvestSource', fallbackSourcePlan.source);
            return true;
        }
    }

    if (capabilities.reserve > 0 && context.room.controller) {
        setJob(creep, 'reserveController', context.room.controller);
        return true;
    }

    setJob(creep, 'idle', context.structures.storage ?? context.structures.spawns[0]);
    return true;
}
