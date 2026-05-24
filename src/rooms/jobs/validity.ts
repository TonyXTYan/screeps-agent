import { ensureArchetype, getCreepCapabilities } from '../../creep.capabilities';
import { jobTarget } from '../../creeps/jobs/memory';
import { wallRampartRepairCap } from '../../repairs/policy';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { mineralReadyToMine } from '../planning/sources';
import { remainingConstructionProgress, remainingRepairProgress } from './reservations';
import {
    isDepositEnergyJobValid,
    isDepositResourceJobValid,
    isPickupJobValid,
    isWithdrawEnergyJobValid,
    isWithdrawResourceJobValid
} from './validityTransfer';

export function currentJobStillValid(
    context: RoomControllerContext,
    creep: Creep,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): boolean {
    if (jobType === 'idle') { return true; }
    if (jobType === 'travelRoom') { return Boolean(creep.memory.jobRoomName); }

    const target = jobTarget<RoomObject & { id: string }>(creep);
    if (!target) { return false; }

    if (jobType === 'harvestSource') {
        const source = target as Source;
        if (capabilities.harvest <= 0 || source.energyCapacity <= 0) { return false; }

        const archetype = ensureArchetype(creep);
        const isDedicatedMiner =
            archetype === 'miner' ||
            archetype === 'remoteMiner' ||
            archetype === 'mineralMiner';
        if (isDedicatedMiner) { return true; }

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { return false; }

        if (archetype === 'worker' &&
            capabilities.haul > 0 &&
            context.structures.storage &&
            context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            return false;
        }

        return true;
    }
    if (jobType === 'mineMineral') {
        const mineral = target as Mineral;
        return capabilities.harvest > 0 && mineral.mineralAmount > 0 && mineralReadyToMine(context);
    }
    if (jobType === 'withdrawEnergy') {
        const storeTarget = target as StructureContainer | StructureStorage | StructureTerminal | StructureLink;
        return isWithdrawEnergyJobValid(context, creep, storeTarget, reservations);
    }
    if (jobType === 'withdrawResource') {
        const storeTarget = target as WithdrawStructure;
        return isWithdrawResourceJobValid(creep, storeTarget, reservations);
    }
    if (jobType === 'pickupEnergy' || jobType === 'pickupResource') {
        const resource = target as Resource<ResourceConstant>;
        return isPickupJobValid(creep, resource, reservations);
    }
    if (jobType === 'depositEnergy' || jobType === 'refillSpawn' || jobType === 'refillTower') {
        const energyTarget = target as EnergyStructure;
        return isDepositEnergyJobValid(creep, energyTarget, reservations);
    }
    if (jobType === 'depositResource' || jobType === 'depositMineral') {
        const storeTarget = target as StructureStorage | StructureTerminal | StructureContainer;
        return isDepositResourceJobValid(creep, storeTarget);
    }
    if (jobType === 'build') {
        const site = target as ConstructionSite;
        return capabilities.build > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            site.progress < site.progressTotal &&
            remainingConstructionProgress(site, reservations) > 0;
    }
    if (jobType === 'repair') {
        const structure = target as AnyStructure;
        const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
        const repairRcl = creep.room.controller?.level ?? 0;
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax;
        return capabilities.repair > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            structure.hits < maxHits &&
            remainingRepairProgress(structure, reservations) > 0;
    }
    if (jobType === 'upgrade') {
        return capabilities.upgrade > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            target instanceof StructureController;
    }
    if (jobType === 'heal') {
        const targetCreep = target as Creep;
        return capabilities.heal > 0 && targetCreep.hits < targetCreep.hitsMax;
    }
    if (jobType === 'reserveController' || jobType === 'claimController') {
        return capabilities.reserve > 0 && target instanceof StructureController;
    }

    return true;
}
