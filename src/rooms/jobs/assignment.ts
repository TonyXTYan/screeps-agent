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
    reserveSourceIfNeeded,
    setStaticHarvestMemory,
    setStaticMineralMemory
} from './sourceAssignment';
import {
    resourceDepositTarget,
} from './targets';
import {
    hasEnergyToGather
} from './energyTargets';
import { tryAssignEmergencyEnergyDelivery } from './emergencyEnergy';
import { keepCurrentJob } from './current';
import { handleEnergyCarryingFlow, handlePostEnergyFallbackFlow } from './assignmentFlow';

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

    if (handleEnergyCarryingFlow(context, creep, archetype, capabilities, reservations, energyUsed)) { return; }
    handlePostEnergyFallbackFlow(context, creep, archetype, capabilities, reservations);
}

function assignmentPriority(archetype: CreepArchetype): number {
    if (archetype === 'miner' || archetype === 'remoteMiner') { return 1; }
    if (archetype === 'mineralMiner') { return 2; }
    if (archetype === 'hauler' || archetype === 'remoteHauler') { return 3; }
    if (archetype === 'doctor') { return 4; }
    if (archetype === 'worker') { return 5; }
    return 6;
}
