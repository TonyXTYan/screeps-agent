import type { CreepCapabilities } from '../../creep.capabilities';
import { setJob } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    TOWER_REFILL_SPAWN_YIELD_RATIO,
    WORKER_EMERGENCY_SPAWN_RATIO,
    refillSpawnTarget,
    refillTowerTarget,
    refillTowerTargets,
    roomHasSpawnEnergyDemand,
    spawnEnergyRatio
} from '../energy';
import { reserveEnergySink } from './reservations';

type EmergencyEnergyDelivery = { jobType: 'refillSpawn' | 'refillTower'; target: EnergyStructure };

export function shouldInterruptForEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: CreepCapabilities
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }
    const emergencyJob = desiredEmergencyEnergyDelivery(context, creep, reservations);
    if (!emergencyJob) { return false; }
    return jobType !== emergencyJob.jobType;
}

export function canEmergencyDeliverEnergy(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: CreepCapabilities
): boolean {
    if (archetype === 'miner' || archetype === 'remoteMiner' || archetype === 'mineralMiner' || archetype === 'remoteHauler') {
        return false;
    }
    if (capabilities.haul <= 0) { return false; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return false; }
    if (archetype === 'worker') {
        return spawnEnergyRatio(context) < WORKER_EMERGENCY_SPAWN_RATIO;
    }
    if (roomHasSpawnEnergyDemand(context)) { return true; }
    return archetype === 'hauler' && refillTowerTargets(context).length > 0;
}

export function desiredEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EmergencyEnergyDelivery | null {
    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) {
        return { jobType: 'refillSpawn', target: spawnTarget };
    }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) {
        return { jobType: 'refillTower', target: towerTarget };
    }

    if (spawnTarget) {
        return { jobType: 'refillSpawn', target: spawnTarget };
    }

    return null;
}

export function tryAssignEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: CreepCapabilities,
    reservations: JobReservations
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }
    const emergencyJob = desiredEmergencyEnergyDelivery(context, creep, reservations);
    if (!emergencyJob) { return false; }

    reserveEnergySink(
        reservations,
        emergencyJob.target,
        Math.min(
            creep.store.getUsedCapacity(RESOURCE_ENERGY),
            emergencyJob.target.store.getFreeCapacity(RESOURCE_ENERGY)
        )
    );
    setJob(creep, emergencyJob.jobType, emergencyJob.target);
    return true;
}
