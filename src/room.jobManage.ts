// Job retention and assignment helpers: keepCurrentJob, assignEmergencyEnergyDelivery,
// resumePrimaryEnergyJob, and their private support functions.

import { ensureArchetype, getCreepCapabilities } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { repairStructureFilter, wallRampartRepairCap } from './role.doctor';
import { bestHealTarget, isEmergencyHealTarget } from './room.targeting';
import { setJob, jobTarget, rememberActiveAsPrimary, clearPrimaryJob } from './room.jobMemory';
import { clearStaticMiningMemory } from './room.source';
import {
    canEmergencyDeliverEnergy, refillSpawnTarget, refillTowerTarget, spawnEnergyRatio,
    reserveResourceTarget, reserveDroppedTarget, reserveEnergySink,
    roomNeedsCriticalEnergyRecovery, terminalWithdrawableEnergy,
    shouldInterruptForEnergyRefill,
} from './room.energy';
import {
    firstStoredResource, mineralReadyToMine,
    remainingConstructionProgress, remainingRepairProgress,
    reserveConstructionProgress, reserveRepairProgress,
    repairTargetFor, shouldRepairWithCreeps, shouldReserveUpgrade,
    haulerMiningSiteMinPickup, isMiningSiteEnergyTarget,
} from './room.work';
import { RoomControllerContext, JobReservations } from './room.types';
import { TOWER_REFILL_SPAWN_YIELD_RATIO } from './room.constants';

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

function currentJobStillValid(
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

        // Fallback harvest for non-miners should be temporary: once any energy is
        // loaded, re-run assignment so the creep spends or tops up via structured sources.
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { return false; }

        if (archetype === 'worker' &&
            capabilities.haul > 0 &&
            context.structures.storage &&
            context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            // Workers should use storage when available instead of direct source mining.
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
        const archetype = ensureArchetype(creep);
        const storage = context.structures.storage;
        if (archetype === 'worker' &&
            storage &&
            storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            storeTarget.id !== storage.id) {
            // Re-target workers to storage as the primary refill source when stocked.
            return false;
        }

        if (storeTarget.structureType === STRUCTURE_TERMINAL) {
            const available = terminalWithdrawableEnergy(context, reservations, roomNeedsCriticalEnergyRecovery(context));
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && available > 0;
        }

        const reserved = reservations.resources[storeTarget.id] ?? 0;
        const available = storeTarget.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0 || available <= 0) { return false; }
        if (archetype === 'hauler' &&
            isMiningSiteEnergyTarget(context, storeTarget)) {
            return available >= haulerMiningSiteMinPickup(creep);
        }
        // Check remaining available energy after accounting for other creeps' reservations
        return true;
    }
    if (jobType === 'withdrawResource') {
        const storeTarget = target as WithdrawStructure;
        const resource = creep.memory.jobResourceType ?? firstStoredResource(storeTarget.store);
        if (!resource || creep.store.getFreeCapacity() === 0) { return false; }
        const remaining = (storeTarget.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[storeTarget.id] ?? 0);
        if (remaining <= 0) { return false; }
        const archetype = ensureArchetype(creep);
        if ((archetype === 'hauler' || archetype === 'worker') &&
            resource !== RESOURCE_ENERGY &&
            target instanceof StructureContainer) {
            return remaining >= haulerMiningSiteMinPickup(creep);
        }
        return true;
    }
    if (jobType === 'pickupEnergy' || jobType === 'pickupResource') {
        const resource = target as Resource<ResourceConstant>;
        if (creep.store.getFreeCapacity() === 0 || resource.amount <= 0) { return false; }
        const remaining = resource.amount - (reservations.dropped[resource.id] ?? 0);
        return remaining > 0;
    }
    if (jobType === 'depositEnergy' || jobType === 'refillSpawn' || jobType === 'refillTower') {
        const energyTarget = target as EnergyStructure;
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            energyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[energyTarget.id] ?? 0);
    }
    if (jobType === 'depositResource' || jobType === 'depositMineral') {
        const storeTarget = target as StructureStorage | StructureTerminal | StructureContainer;
        const resource = creep.memory.jobResourceType ?? firstStoredResource(creep.store);
        return Boolean(resource) && storeTarget.store.getFreeCapacity(resource as ResourceConstant) > 0;
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

function shouldInterruptForEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }

    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) { return jobType !== 'refillSpawn'; }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) { return jobType !== 'refillTower'; }

    if (spawnTarget) { return jobType !== 'refillSpawn'; }

    return false;
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

export function assignEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }

    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) {
        reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillSpawn', spawnTarget);
        return true;
    }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) {
        reserveEnergySink(reservations, towerTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), towerTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillTower', towerTarget);
        return true;
    }

    if (spawnTarget) {
        reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillSpawn', spawnTarget);
        return true;
    }

    return false;
}

export function resumePrimaryEnergyJob(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
    const jobType = creep.memory.primaryJobType;
    const targetId = creep.memory.primaryTargetId;
    if (!jobType || !targetId) { return false; }
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') {
        clearPrimaryJob(creep);
        return false;
    }

    const target = Game.getObjectById(targetId as Id<any>) as (RoomObject & { id: string }) | null;
    if (!target) {
        clearPrimaryJob(creep);
        return false;
    }

    if (jobType === 'build') {
        const site = target as ConstructionSite;
        if (capabilities.build <= 0 || site.progress >= site.progressTotal || remainingConstructionProgress(site, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        reserveConstructionProgress(reservations, site, capabilities.build);
        setJob(creep, 'build', site);
        return true;
    }

    if (jobType === 'repair') {
        const structure = target as AnyStructure;
        const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
        const repairRcl = creep.room.controller?.level ?? 0;
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
        if (capabilities.repair <= 0 || structure.hits >= maxHits || remainingRepairProgress(structure, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        if (shouldRepairWithCreeps(context) && context.repairTargets.length > 0) {
            const primaryRemaining = remainingRepairProgress(structure, reservations);
            const best = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
            if (best && best.id !== structure.id && remainingRepairProgress(best, reservations) > primaryRemaining * 2) {
                clearPrimaryJob(creep);
                return false;
            }
        }
        reserveRepairProgress(reservations, structure, capabilities.repair);
        setJob(creep, 'repair', structure);
        return true;
    }

    if (!context.room.controller || target.id !== context.room.controller.id || capabilities.upgrade <= 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (!shouldReserveUpgrade(context, reservations) && context.constructionSites.length > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (Object.keys(reservations.constructionProgress).length === 0 && context.constructionSites.length > 0 && capabilities.build > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    reservations.upgraderWork += capabilities.upgrade;
    setJob(creep, 'upgrade', context.room.controller);
    return true;
}
