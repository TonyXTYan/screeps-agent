import { ensureArchetype, getCreepCapabilities } from '../../creep.capabilities';
import { bestHealTarget } from '../../combat/healing';
import { setJob, setResourceJob } from '../../creeps/jobs/memory';
import { firstStoredResourcePreferNonEnergy as firstStoredResource } from '../../resources/store';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    createReservations
} from './reservations';
import { mineralReadyToMine } from '../planning/sources';
import {
    assignedSourcePlan,
    clearStaticMiningMemory,
    closestSourcePlan,
    reserveSourceIfNeeded,
    setStaticHarvestMemory,
    setStaticMineralMemory
} from './sourceAssignment';
import {
    resourceDepositTarget,
} from './targets';
import {
    haulerMiningSiteMinPickup,
    hasEnergyToGather
} from './energyTargets';
import { tryAssignEmergencyEnergyDelivery } from './emergencyEnergy';
import { keepCurrentJob } from './current';
import { assignEnergySpendingJob, assignWorkerPartialEnergyWork } from './energyWork';
import { assignHaulAcquisitionJob } from './assignmentHauling';

export function assignJobs(context: RoomControllerContext): void {
    const reservations = createReservations(context);
    const creeps = context.creeps
        .filter((creep) => !creep.spawning && creep.memory.role !== 'defender')
        .filter((creep) => !isDedicatedRemoteCreep(creep, context.room.name))
        .sort((a, b) => assignmentPriority(ensureArchetype(a)) - assignmentPriority(ensureArchetype(b)));

    for (const creep of creeps) {
        const archetype = ensureArchetype(creep);
        if (keepCurrentJob(context, creep, archetype, reservations)) { continue; }
        assignJob(context, creep, reservations);
    }
}

function isDedicatedRemoteCreep(creep: Creep, homeRoomName: string): boolean {
    return creep.memory.homeRoom === homeRoomName && Boolean(creep.memory.remoteRoom);
}

function assignJob(context: RoomControllerContext, creep: Creep, reservations: JobReservations): void {
    const capabilities = getCreepCapabilities(creep);
    const archetype = ensureArchetype(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();
    const hasMinerals = totalUsed > energyUsed;

    if (hasMinerals && archetype !== 'mineralMiner') {
        const resourceSink = resourceDepositTarget(context);
        if (resourceSink) {
            setResourceJob(creep, 'depositResource', resourceSink, firstStoredResource(creep.store));
            return;
        }
    }

    if ((archetype === 'miner' || archetype === 'remoteMiner') && capabilities.harvest > 0) {
        const sourcePlan = assignedSourcePlan(creep, context.sourcePlans, reservations);
        if (sourcePlan) {
            reserveSourceIfNeeded(creep, reservations, sourcePlan, capabilities.harvest);
            setStaticHarvestMemory(creep, sourcePlan);
            setJob(creep, 'harvestSource', sourcePlan.source);
            return;
        }
    }

    if (archetype === 'mineralMiner' && capabilities.harvest > 0 && context.mineralPlan && mineralReadyToMine(context)) {
        reservations.mineralWork += capabilities.harvest;
        setStaticMineralMemory(creep, context.mineralPlan);
        setJob(creep, 'mineMineral', context.mineralPlan.mineral);
        return;
    }

    if (capabilities.heal > 0 && context.injuredCreeps.length > 0) {
        setJob(creep, 'heal', bestHealTarget(creep, context.injuredCreeps));
        return;
    }

    if (tryAssignEmergencyEnergyDelivery(context, creep, archetype, capabilities, reservations)) {
        return;
    }

    if (energyUsed > 0) {
        if (archetype === 'worker' &&
            creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            hasEnergyToGather(context)) {
            if (assignWorkerPartialEnergyWork(context, creep, capabilities, reservations)) { return; }
        } else if (archetype === 'hauler' &&
                   creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                   (context.sourcePlans.some(p => p.container &&
                        creep.pos.getRangeTo(p.container) <= 3 &&
                        p.container.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)) ||
                    context.structures.links.source.some(l =>
                        creep.pos.getRangeTo(l) <= 3 &&
                        l.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)))) {
            // Hauler at a source site with free capacity; top up before leaving.
        } else {
            assignEnergySpendingJob(context, creep, archetype, capabilities, reservations);
            return;
        }
    }

    if (capabilities.haul > 0) {
        if (assignHaulAcquisitionJob(context, creep, archetype, reservations)) { return; }
    }

    if (capabilities.harvest > 0 && archetype !== 'hauler' && archetype !== 'remoteHauler') {
        const fallbackSourcePlan = closestSourcePlan(creep, context.sourcePlans);
        if (fallbackSourcePlan) {
            clearStaticMiningMemory(creep);
            setJob(creep, 'harvestSource', fallbackSourcePlan.source);
            return;
        }
    }

    if (capabilities.reserve > 0 && context.room.controller) {
        setJob(creep, 'reserveController', context.room.controller);
        return;
    }

    setJob(creep, 'idle', context.structures.storage ?? context.structures.spawns[0]);
}

function assignmentPriority(archetype: CreepArchetype): number {
    if (archetype === 'miner' || archetype === 'remoteMiner') { return 1; }
    if (archetype === 'mineralMiner') { return 2; }
    if (archetype === 'hauler' || archetype === 'remoteHauler') { return 3; }
    if (archetype === 'doctor') { return 4; }
    if (archetype === 'worker') { return 5; }
    return 6;
}
