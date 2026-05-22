import { ensureArchetype, getCreepCapabilities } from "../creep.capabilities";
import { clearJob } from "../creep.jobRunner";
import { isHostile } from "../hostileUtils";
import { wallRampartRepairCap } from "../role.doctor";
import { TOWER_REFILL_SPAWN_YIELD_RATIO, WORKER_EMERGENCY_SPAWN_RATIO, TOWER_HAULER_DEPOSIT_RATIO, BUILD_RESERVATION_TICKS, REPAIR_RESERVATION_TICKS, DOCTOR_EMERGENCY_HITS_RATIO, DOCTOR_THREAT_RADIUS } from "./constants";
import { roomNeedsCriticalEnergyRecovery, terminalEnergyReserveDeficit, roomHasEnergyDemand, terminalWithdrawableEnergy, roomHasSpawnEnergyDemand } from "./context";
import { assignedSourcePlan, refillSpawnTarget, refillTowerTarget, refillTerminalTarget, refillTowerTargets } from "./spawn";
import { RoomControllerContext, JobReservations, ResourceTarget, SourcePlan, MineralPlan } from "./types";

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

export function assignJob(context: RoomControllerContext, creep: Creep, reservations: JobReservations): void {
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

    if (assignEmergencyEnergyDelivery(context, creep, archetype, capabilities, reservations)) {
        return;
    }

    if (energyUsed > 0) {
        if (archetype === 'worker' &&
            creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            hasEnergyToGather(context)) {
            if (assignWorkerPartialEnergyWork(context, creep, capabilities, reservations)) { return; }

            // Not full and there's ambient energy — fall through to top up from storage.
            // (energyWithdrawalTarget always returns storage for workers, so the "dump
            // partial then re-withdraw" pattern is never needed and only causes bouncing.)
        } else if (archetype === 'hauler' &&
                   creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                   (context.sourcePlans.some(p => p.container &&
                        creep.pos.getRangeTo(p.container) <= 3 &&
                        p.container.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)) ||
                    context.structures.links.source.some(l =>
                        creep.pos.getRangeTo(l) <= 3 &&
                        l.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)))) {
            // Hauler at a source site with free capacity — fall through to top up from the container/link
            // before leaving, but only if it has enough to meet the min-pickup threshold.
        } else {
            assignEnergySpendingJob(context, creep, archetype, capabilities, reservations);
            return;
        }
    }

    if (capabilities.haul > 0) {
        const dropped = droppedResourceTarget(context, creep, reservations);
        if (dropped) {
            reserveDroppedTarget(reservations, dropped.id, Math.min(creep.store.getFreeCapacity(), dropped.amount));
            setResourceJob(creep, 'pickupResource', dropped, dropped.resourceType);
            return;
        }

        const salvage = salvageWithdrawalTarget(context, creep, reservations);
        if (salvage) {
            reserveResourceTarget(reservations, salvage.target.id, Math.min(creep.store.getFreeCapacity(), salvage.amount));
            setResourceJob(creep, 'withdrawResource', salvage.target, salvage.resource);
            return;
        }

        if (archetype === 'hauler') {
            const mineralContainer = mineralContainerWithdrawalTarget(context, creep, archetype, reservations);
            if (mineralContainer) {
                reserveResourceTarget(reservations, mineralContainer.target.id, Math.min(creep.store.getFreeCapacity(), mineralContainer.amount));
                setResourceJob(creep, 'withdrawResource', mineralContainer.target, mineralContainer.resource);
                return;
            }
        }

        if ((archetype === 'hauler' || archetype === 'worker') && roomNeedsCriticalEnergyRecovery(context)) {
            const spawnTarget = refillSpawnTarget(context, creep, reservations);
            if (spawnTarget) {
                const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
                if (withdrawalTarget) {
                    setJob(creep, 'withdrawEnergy', withdrawalTarget);
                    return;
                }
            }
        }

        if (archetype === 'hauler' &&
            context.structures.storage &&
            terminalEnergyReserveDeficit(context, reservations) > 0 &&
            !roomNeedsCriticalEnergyRecovery(context) &&
            !roomHasEnergyDemand(context)) {
            const storageReserved = reservations.resources[context.structures.storage.id] ?? 0;
            const storageAvailable = context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) - storageReserved;
            if (storageAvailable > 0) {
                setJob(creep, 'withdrawEnergy', context.structures.storage);
                return;
            }
        }

        const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
        if (withdrawalTarget) {
            setJob(creep, 'withdrawEnergy', withdrawalTarget);
            return;
        }

        if (archetype === 'worker') {
            const mineralContainer = mineralContainerWithdrawalTarget(context, creep, archetype, reservations);
            if (mineralContainer) {
                reserveResourceTarget(reservations, mineralContainer.target.id, Math.min(creep.store.getFreeCapacity(), mineralContainer.amount));
                setResourceJob(creep, 'withdrawResource', mineralContainer.target, mineralContainer.resource);
                return;
            }
        }
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

export function setJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null): void {
    if (!target) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType && creep.memory.jobTargetId === target.id) {
        creep.memory.jobRoomName = target.pos.roomName;
        creep.memory.jobResourceType = undefined;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

export function setTravelJob(creep: Creep, roomName: string): void {
    if (creep.memory.jobType === 'travelRoom' && creep.memory.jobRoomName === roomName) { return; }

    creep.memory.jobType = 'travelRoom';
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

export function setResourceJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null, resource: ResourceConstant | null): void {
    if (!target || !resource) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType &&
        creep.memory.jobTargetId === target.id &&
        creep.memory.jobResourceType === resource) {
        creep.memory.jobRoomName = target.pos.roomName;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = resource;
}

export function isDedicatedRemoteCreep(creep: Creep, homeRoomName: string): boolean {
    return creep.memory.homeRoom === homeRoomName && Boolean(creep.memory.remoteRoom);
}

export function hasEnergyToGather(context: RoomControllerContext): boolean {
    if (context.droppedEnergy.length > 0) return true;
    if (context.tombstones.length > 0) return true;
    if (context.structures.containers.some(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return true;
    if (context.structures.links.source.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.controller.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.hub.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.sink.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    return false;
}

export function assignWorkerPartialEnergyWork(context: RoomControllerContext, creep: Creep, capabilities: ReturnType<typeof getCreepCapabilities>, reservations: JobReservations): boolean {
    if (capabilities.build > 0 && context.constructionSites.length > 0) {
        const site = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (site) {
            reserveConstructionProgress(reservations, site, capabilities.build);
            rememberPrimaryJob(creep, 'build', site);
            setJob(creep, 'build', site);
            return true;
        }
    }

    if (capabilities.repair > 0 &&
        context.repairTargets.length > 0 &&
        shouldRepairWithCreeps(context)) {
        const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
        if (repairTarget) {
            reserveRepairProgress(reservations, repairTarget, capabilities.repair);
            rememberPrimaryJob(creep, 'repair', repairTarget);
            setJob(creep, 'repair', repairTarget);
            return true;
        }
    }

    if (capabilities.upgrade > 0 && context.room.controller && shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return true;
    }

    return false;
}

export function assignEnergySpendingJob(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, capabilities: ReturnType<typeof getCreepCapabilities>, reservations: JobReservations): void {
    const spawnRatio = spawnEnergyRatio(context);
    if (!(archetype === 'worker' && context.structures.storage && spawnRatio >= 0.5)) {
        const spawnTarget = refillSpawnTarget(context, creep, reservations);
        if (spawnTarget) {
            reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'refillSpawn', spawnTarget);
            return;
        }

        const towerTarget = refillTowerTarget(context, creep, reservations);
        if (towerTarget) {
            reserveEnergySink(reservations, towerTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), towerTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'refillTower', towerTarget);
            return;
        }

        const terminalTarget = refillTerminalTarget(context, creep, reservations);
        if (terminalTarget) {
            reserveEnergySink(reservations, terminalTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), terminalTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'depositEnergy', terminalTarget);
            return;
        }
    }

    const resumed = resumePrimaryEnergyJob(context, creep, capabilities, reservations);
    if (resumed) { return; }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const sink = energyDepositTarget(context, creep, reservations);
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
            return;
        }
    }

    if (Object.keys(reservations.constructionProgress).length === 0 && capabilities.build > 0 && context.constructionSites.length > 0) {
        const guaranteedSite = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (guaranteedSite) {
            reserveConstructionProgress(reservations, guaranteedSite, capabilities.build);
            rememberPrimaryJob(creep, 'build', guaranteedSite);
            setJob(creep, 'build', guaranteedSite);
            return;
        }
    }

    if (reservations.upgraderWork === 0 &&
        capabilities.upgrade > 0 &&
        context.room.controller &&
        shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.upgrade > 0 && context.room.controller && shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.build > 0 && context.constructionSites.length > 0) {
        const site = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (site) {
            reserveConstructionProgress(reservations, site, capabilities.build);
            rememberPrimaryJob(creep, 'build', site);
            setJob(creep, 'build', site);
            return;
        }
    }

    if (capabilities.upgrade > 0 && context.room.controller) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.repair > 0 && context.repairTargets.length > 0 && shouldRepairWithCreeps(context)) {
        const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
        if (repairTarget) {
            reserveRepairProgress(reservations, repairTarget, capabilities.repair);
            rememberPrimaryJob(creep, 'repair', repairTarget);
            setJob(creep, 'repair', repairTarget);
            return;
        }
    }

    const sink = energyDepositTarget(context, creep, reservations);
    setJob(creep, 'depositEnergy', sink);
}

export function minCarryForHauler(rcl: number): number {
    if (rcl >= 7) return 6;
    if (rcl >= 4) return 4;
    return 2;
}

export function minWorkForWorker(rcl: number): number {
    if (rcl >= 7) return 3;
    if (rcl >= 4) return 2;
    return 1;
}

export function minWorkForMiner(rcl: number): number {
    if (rcl >= 7) return 4;
    if (rcl >= 4) return 3;
    return 1;
}

export function keepCurrentJob(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, reservations: JobReservations): boolean {
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

export function currentJobStillValid(context: RoomControllerContext, creep: Creep, jobType: CreepJobType, reservations: JobReservations, capabilities: ReturnType<typeof getCreepCapabilities>): boolean {
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

export function shouldInterruptForEmergencyEnergyDelivery(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, jobType: CreepJobType, reservations: JobReservations, capabilities: ReturnType<typeof getCreepCapabilities>): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }

    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) { return jobType !== 'refillSpawn'; }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) { return jobType !== 'refillTower'; }

    if (spawnTarget) { return jobType !== 'refillSpawn'; }

    return false;
}

export function reserveCurrentJob(creep: Creep, jobType: CreepJobType, reservations: JobReservations, capabilities: ReturnType<typeof getCreepCapabilities>): void {
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

export function shouldInterruptForEnergyRefill(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, reservations: JobReservations): boolean {
    if (archetype === 'miner' || archetype === 'mineralMiner' ||
    (archetype === 'worker' && context.structures.storage)) { return false; }

    if (!roomNeedsCriticalEnergyRecovery(context)) { return false; }

    if (refillSpawnTarget(context, creep, reservations)) { return true; }

    return refillTowerTarget(context, creep, reservations) !== null;
}

export function assignEmergencyEnergyDelivery(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, capabilities: ReturnType<typeof getCreepCapabilities>, reservations: JobReservations): boolean {
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

export function canEmergencyDeliverEnergy(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, capabilities: ReturnType<typeof getCreepCapabilities>): boolean {
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

export function droppedResourceTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): Resource<ResourceConstant> | null {
    let best: Resource<ResourceConstant> | null = null;
    let bestRange = Infinity;
    for (const resource of context.droppedResources) {
        const remaining = resource.amount - (reservations.dropped[resource.id] ?? 0);
        if (remaining <= 0) { continue; }

        const range = creep.pos.getRangeTo(resource);
        if (range < bestRange) {
            best = resource;
            bestRange = range;
        }
    }

    return best;
}

export function salvageWithdrawalTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): ResourceTarget | null {
    const targets: WithdrawStructure[] = [...context.tombstones, ...context.ruins];
    let best: ResourceTarget | null = null;
    let bestRange = Infinity;
    for (const target of targets) {
        const resource = firstStoredResource(target.store);
        if (!resource) { continue; }
        const remaining = (target.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[target.id] ?? 0);
        if (remaining <= 0) { continue; }

        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = { target, resource, amount: remaining };
            bestRange = range;
        }
    }

    return best;
}

export function mineralContainerWithdrawalTarget(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, reservations: JobReservations): ResourceTarget | null {
    if (archetype !== 'hauler' && archetype !== 'worker') { return null; }

    if (creep.store.getFreeCapacity() <= 0) { return null; }

    const container = context.mineralPlan?.container;
    if (!container) { return null; }

    const resource = firstStoredNonEnergyResource(container.store);
    if (!resource) { return null; }

    const remaining = (container.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[container.id] ?? 0);
    if (remaining <= 0) { return null; }

    if (remaining < haulerMiningSiteMinPickup(creep)) { return null; }

    return { target: container, resource, amount: remaining };
}

export function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }

    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }

    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

export function energyDepositTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): StructureStorage | StructureTerminal | StructureContainer | StructureTower | null {
    if (context.structures.terminal &&
        context.structures.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        terminalEnergyReserveDeficit(context, reservations) > 0 &&
        !roomHasEnergyDemand(context)) {
        return context.structures.terminal;
    }

    const towerTarget = closest(creep, context.structures.towers
                .filter(t => towerEnergyRatio(t) < TOWER_HAULER_DEPOSIT_RATIO &&
                    t.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[t.id] ?? 0)));
    if (towerTarget) { return towerTarget; }

    if (context.structures.storage && context.structures.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.terminal;
    }

    const sourceContainerIds: { [id: string]: boolean } = {};
    for (const sourcePlan of context.sourcePlans) {
        if (sourcePlan.container) {
            sourceContainerIds[sourcePlan.container.id] = true;
        }
    }

    const nonSourceContainers = context.structures.containers
                .filter((container) =>
                    container.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                    !sourceContainerIds[container.id]);
    if (nonSourceContainers.length > 0) {
        return closest(creep, nonSourceContainers);
    }

    return closest(
    creep,
    context.structures.containers.filter((container) => container.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
}

export function energyWithdrawalTarget(context: RoomControllerContext, creep: Creep, archetype: CreepArchetype, reservations: JobReservations): StructureContainer | StructureStorage | StructureTerminal | StructureLink | null {
    if (archetype === 'worker' &&
        context.structures.storage &&
        context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    const haulerMinPickup = haulerMiningSiteMinPickup(creep);
    const isHauler = archetype === 'hauler' || archetype === 'remoteHauler';
    const miningSiteContainerIds: { [id: string]: boolean } = {};
    for (const sourcePlan of context.sourcePlans) {
        if (sourcePlan.container) {
            miningSiteContainerIds[sourcePlan.container.id] = true;
        }
    }

    if (context.mineralPlan?.container) {
        miningSiteContainerIds[context.mineralPlan.container.id] = true;
    }

    const sourceContainers = context.structures.containers
                .filter((container) => {
                    // Threshold of 50 prevents idle stalls when containers dip below 200. Subtract reservations to avoid over-committing.
                    const reserved = reservations.resources[container.id] ?? 0;
                    const available = container.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
                    if (available <= 0) { return false; }

                    const baseMin = Math.min(50, creep.store.getFreeCapacity(RESOURCE_ENERGY));
                    if (!isHauler) { return available >= baseMin; }
                    if (!miningSiteContainerIds[container.id]) { return available >= baseMin; }
                    return available >= haulerMinPickup;
                });
    const sourceLinks = context.structures.links.source
                .filter((link) => {
                    const available = link.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[link.id] ?? 0);
                    if (available <= 0) { return false; }
                    if (!isHauler) { return true; }
                    return available >= haulerMinPickup;
                });
    const allowTerminalReserveBreak = roomNeedsCriticalEnergyRecovery(context);
    const terminalAvailable = terminalWithdrawableEnergy(context, reservations, allowTerminalReserveBreak);
    const terminalTarget = context.structures.terminal && terminalAvailable > 0 ? context.structures.terminal : null;
    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        // If already at a source site (e.g. picking up dropped energy), top up from the container/link
        // before leaving — but only if it meets the min-pickup threshold, to avoid draining trickles.
        const nearbySourceContainer = context.sourcePlans
            .map(p => p.container)
            .find(c => c &&
                creep.pos.getRangeTo(c) <= 3 &&
                (c.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[c.id] ?? 0)) >= haulerMinPickup);
        if (nearbySourceContainer) { return nearbySourceContainer; }

        const nearbySourceLink = context.structures.links.source.find(l =>
            creep.pos.getRangeTo(l) <= 3 &&
            (l.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[l.id] ?? 0)) >= haulerMinPickup);
        if (nearbySourceLink) { return nearbySourceLink; }

        const sourceIds = new Set(context.structures.links.source.map(l => l.id));
        const demandLinks = [...context.structures.links.hub, ...context.structures.links.controller, ...context.structures.links.sink]
            .filter((link) => !sourceIds.has(link.id) && link.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        // Primary: drain hub/controller/sink links so they always have capacity for incoming transfers.
        // Exclude source links even if dual-classified — they use the min-pickup threshold below.
        // Fallback to source containers/links only when link chain can't keep up (overflow).
        return closest(creep, demandLinks) ??
               terminalTarget ??
               closest(creep, sourceContainers) ??
               closest(creep, sourceLinks);
    }

    const linkWithEnergy = closest(creep, [...context.structures.links.controller, ...context.structures.links.hub, ...sourceLinks]
                .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0));
    if (linkWithEnergy) { return linkWithEnergy; }

    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    return terminalTarget ?? closest(creep, [...sourceContainers, ...sourceLinks]);
}

export function spawnEnergyRatio(context: RoomControllerContext): number {
    let used = 0, total = 0;
    for (const s of [...context.structures.spawns, ...context.structures.extensions]) {
        used += s.store.getUsedCapacity(RESOURCE_ENERGY);
        total += s.store.getCapacity(RESOURCE_ENERGY);
    }

    return total > 0 ? used / total : 1;
}

export function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
}

export function bestConstructionSite(creep: Creep, sites: ConstructionSite[], reservations: JobReservations, workParts: number): ConstructionSite | null {
    let best: ConstructionSite | null = null;
    let bestPriority = Infinity;
    let bestRange = Infinity;
    let bestRemaining = 0;
    for (const site of sites) {
        const remaining = remainingConstructionProgress(site, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const priority = constructionPriority(site);
        const range = creep.pos.getRangeTo(site);
        if (!best ||
            priority < bestPriority ||
            (priority === bestPriority && remaining > bestRemaining) ||
            (priority === bestPriority && remaining === bestRemaining && range < bestRange)) {
            best = site;
            bestPriority = priority;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

export function repairTargetFor(creep: Creep, targets: AnyStructure[], reservations: JobReservations, workParts: number): AnyStructure | null {
    let best: AnyStructure | null = null;
    let bestRange = Infinity;
    let bestRemaining = 0;
    for (const target of targets) {
        const remaining = remainingRepairProgress(target, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const range = creep.pos.getRangeTo(target);
        if (!best || remaining > bestRemaining || (remaining === bestRemaining && range < bestRange)) {
            best = target;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

export function remainingConstructionProgress(site: ConstructionSite, reservations: JobReservations): number {
    return site.progressTotal - site.progress - (reservations.constructionProgress[site.id] ?? 0);
}

export function remainingRepairProgress(structure: AnyStructure, reservations: JobReservations): number {
    const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
    const repairRcl = structure.room.controller?.level ?? 0;
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
    const cappedRemaining = Math.max(0, maxHits - structure.hits);
    return cappedRemaining - (reservations.repairProgress[structure.id] ?? 0);
}

export function reserveConstructionProgress(reservations: JobReservations, site: ConstructionSite, workParts: number): void {
    reservations.constructionProgress[site.id] = (reservations.constructionProgress[site.id] ?? 0) +
    workParts * BUILD_POWER * BUILD_RESERVATION_TICKS;
}

export function reserveRepairProgress(reservations: JobReservations, structure: AnyStructure, workParts: number): void {
    reservations.repairProgress[structure.id] = (reservations.repairProgress[structure.id] ?? 0) +
    workParts * REPAIR_POWER * REPAIR_RESERVATION_TICKS;
}

export function constructionPriority(site: ConstructionSite): number {
    if (site.structureType === STRUCTURE_TOWER) { return 1; }

    if (site.structureType === STRUCTURE_SPAWN) { return 2; }

    if (site.structureType === STRUCTURE_EXTENSION) { return 3; }

    if (site.structureType === STRUCTURE_STORAGE) { return 4; }

    if (site.structureType === STRUCTURE_LINK) { return 5; }

    if (site.structureType === STRUCTURE_TERMINAL) { return 6; }

    if (site.structureType === STRUCTURE_LAB) { return 7; }

    if (site.structureType === STRUCTURE_EXTRACTOR) { return 8; }

    if (site.structureType === STRUCTURE_CONTAINER) { return 9; }

    if (site.structureType === STRUCTURE_ROAD) { return 10; }

    if (site.structureType === STRUCTURE_RAMPART) { return 11; }

    if (site.structureType === STRUCTURE_WALL) { return 12; }

    return 20;
}

export function shouldRepairWithCreeps(context: RoomControllerContext): boolean {
    if (context.constructionSites.length === 0) { return true; }

    if (!context.structures.storage) { return true; }

    return context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 5000;
}

export function desiredUpgraderWork(rcl: number): number {
    if (rcl >= 8) { return 1; }

    if (rcl >= 7) { return 10; }

    if (rcl >= 5) { return 5; }

    return 2;
}

export function shouldReserveUpgrade(context: RoomControllerContext, reservations: JobReservations): boolean {
    if (!context.room.controller) { return false; }

    const rcl = context.room.controller.level;
    if (rcl >= 8) {
        const downgradeTimer = context.room.controller.ticksToDowngrade;
        if (downgradeTimer > 100000) { return false; }
    }

    if (reservations.upgraderWork >= desiredUpgraderWork(rcl)) { return false; }

    if (context.room.energyAvailable === 0 && storedEnergy(context) === 0) { return false; }

    return true;
}

export function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }

    return context.mineralPlan?.container != null;
}

export function totalStoredTargets(targets: Array<Tombstone | Ruin>): number {
    let total = 0;
    for (const target of targets) {
        total += totalStoredResources(target.store);
    }

    return total;
}

export function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }

    return total;
}

export function firstStoredResource(store: StoreDefinition): ResourceConstant | null {
    let fallback: ResourceConstant | null = null;
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (store.getUsedCapacity(resource) <= 0) { continue; }
        if (resource !== RESOURCE_ENERGY) { return resource; }
        fallback = resource;
    }

    return fallback;
}

export function firstStoredNonEnergyResource(store: StoreDefinition): ResourceConstant | null {
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (resource === RESOURCE_ENERGY) { continue; }
        if (store.getUsedCapacity(resource) > 0) { return resource; }
    }

    return null;
}

export function haulerMiningSiteMinPickup(creep: Creep): number {
    return Math.max(1, Math.ceil(creep.store.getCapacity() * 0.5));
}

export function isMiningSiteEnergyTarget(context: RoomControllerContext, target: StructureContainer | StructureStorage | StructureTerminal | StructureLink): boolean {
    if (target.structureType === STRUCTURE_LINK) {
        return context.structures.links.source.some((link) => link.id === target.id);
    }

    if (target.structureType !== STRUCTURE_CONTAINER) { return false; }

    if (context.mineralPlan?.container?.id === target.id) { return true; }

    return context.sourcePlans.some((sourcePlan) => sourcePlan.container?.id === target.id);
}

export function storedEnergy(context: RoomControllerContext): number {
    const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    return storageEnergy + terminalEnergy;
}

export function sumFreeEnergy(structures: EnergyStructure[]): number {
    let total = 0;
    for (const structure of structures) {
        total += structure.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    return total;
}

export function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}

export function closest<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }

    return best;
}

export function closestReachable<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    return creep.pos.findClosestByPath(targets, { ignoreCreeps: false }) as T | null;
}

export function bestHealTarget(creep: Creep, targets: Creep[]): Creep | null {
    if (targets.length === 0) { return null; }

    const emergencyTargets = targets.filter((target) => isEmergencyHealTarget(target));
    const pool = emergencyTargets.length > 0 ? emergencyTargets : targets;
    let best = pool[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of pool) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio ||
            (ratio === bestRatio && missing > bestMissing) ||
            (ratio === bestRatio && missing === bestMissing && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestMissing = missing;
            bestRange = range;
        }
    }

    return best;
}

export function isEmergencyHealTarget(target: Creep): boolean {
    if (target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO) {
        return true;
    }

    return target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
        filter: isHostile
    }).length > 0;
}

export function closestByRange<T extends RoomObject>(origin: RoomObject, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = origin.pos.getRangeTo(best);
    for (const target of targets) {
        const range = origin.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }

    return best;
}

export function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }

    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }

    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }

    if (archetype === 'claimer') { return 'manual'; }

    return 'builder';
}

export function rememberActiveAsPrimary(creep: Creep): void {
    const jobType = creep.memory.jobType;
    const targetId = creep.memory.jobTargetId;
    if (!jobType || !targetId) { return; }

    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') { return; }

    creep.memory.primaryJobType = jobType;
    creep.memory.primaryTargetId = targetId;
    creep.memory.primaryRoomName = creep.memory.jobRoomName;
    creep.memory.primaryResourceType = creep.memory.jobResourceType;
    creep.memory.primaryAssignedAt = creep.memory.primaryAssignedAt ?? creep.memory.jobAssignedAt ?? Game.time;
}

export function rememberPrimaryJob(creep: Creep, jobType: CreepJobType, target: RoomObject & { id: string }, resource?: ResourceConstant): void {
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') { return; }

    if (creep.memory.primaryJobType === jobType && creep.memory.primaryTargetId === target.id) { return; }

    creep.memory.primaryJobType = jobType;
    creep.memory.primaryTargetId = target.id;
    creep.memory.primaryRoomName = target.pos.roomName;
    creep.memory.primaryResourceType = resource;
    creep.memory.primaryAssignedAt = Game.time;
}

export function clearPrimaryJob(creep: Creep): void {
    creep.memory.primaryJobType = undefined;
    creep.memory.primaryTargetId = undefined;
    creep.memory.primaryRoomName = undefined;
    creep.memory.primaryResourceType = undefined;
    creep.memory.primaryAssignedAt = undefined;
}

export function jobTarget<T extends RoomObject>(creep: Creep): T | null {
    const id = creep.memory.jobTargetId;
    if (!id) { return null; }

    return Game.getObjectById(id as Id<any>) as T | null;
}

export function reserveSourceWork(reservations: JobReservations, sourcePlan: SourcePlan, work: number): void {
    reservations.sourceWork[sourcePlan.source.id] = (reservations.sourceWork[sourcePlan.source.id] ?? 0) + work;
}

export function reserveSourceIfNeeded(creep: Creep, reservations: JobReservations, sourcePlan: SourcePlan, work: number): void {
    const alreadyAssigned = (creep.memory.assignedSourceId ?? creep.memory.sourceId) === sourcePlan.source.id;
    if (!alreadyAssigned) {
        reservations.sourceMinerCount[sourcePlan.source.id] = (reservations.sourceMinerCount[sourcePlan.source.id] ?? 0) + 1;
        reserveSourceWork(reservations, sourcePlan, work);
    }
}

export function reserveResourceTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.resources[targetId] = (reservations.resources[targetId] ?? 0) + Math.max(0, amount);
}

export function reserveDroppedTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.dropped[targetId] = (reservations.dropped[targetId] ?? 0) + Math.max(0, amount);
}

export function reserveEnergySink(reservations: JobReservations, target: EnergyStructure, amount: number): void {
    const alreadyReserved = reservations.energySinks[target.id] ?? 0;
    const remainingCapacity = Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY) - alreadyReserved);
    const reserveAmount = Math.min(Math.max(0, amount), remainingCapacity);
    reservations.energySinks[target.id] = alreadyReserved + reserveAmount;
}

export function resumePrimaryEnergyJob(context: RoomControllerContext, creep: Creep, capabilities: ReturnType<typeof getCreepCapabilities>, reservations: JobReservations): boolean {
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

export function setStaticHarvestMemory(creep: Creep, sourcePlan: SourcePlan): void {
    creep.memory.sourceId = sourcePlan.source.id;
    creep.memory.assignedSourceId = sourcePlan.source.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForSource(sourcePlan);
    creep.memory.staticMining = sourcePlan.staticMining;
}

export function setStaticMineralMemory(creep: Creep, mineralPlan: MineralPlan): void {
    creep.memory.assignedMineralId = mineralPlan.mineral.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForMineral(mineralPlan);
    creep.memory.staticMining = mineralPlan.staticMining;
}

export function clearStaticMiningMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.staticMining = undefined;
}

export function stationaryTargetIdForSource(sourcePlan: SourcePlan): string {
    return sourcePlan.container?.id ?? sourcePlan.source.id;
}

export function stationaryTargetIdForMineral(mineralPlan: MineralPlan): string {
    return mineralPlan.container?.id ?? mineralPlan.mineral.id;
}

export function closestSourcePlan(creep: Creep, sourcePlans: SourcePlan[]): SourcePlan | null {
    let best: SourcePlan | null = null;
    let bestRange = Infinity;
    for (const plan of sourcePlans) {
        const range = creep.pos.getRangeTo(plan.source);
        if (range < bestRange) {
            best = plan;
            bestRange = range;
        }
    }

    return best;
}

export function createReservations(context: RoomControllerContext): JobReservations {
    const reservations: JobReservations = {
                resources: {},
                dropped: {},
                energySinks: {},
                constructionProgress: {},
                repairProgress: {},
                sourceWork: {},
                sourceMinerCount: {},
                mineralWork: 0,
                upgraderWork: 0
            };
    for (const creep of context.creeps) {
        const capabilities = getCreepCapabilities(creep);
        const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        if (sourceId && ensureArchetype(creep) === 'miner') {
            reservations.sourceWork[sourceId] = (reservations.sourceWork[sourceId] ?? 0) + capabilities.harvest;
            reservations.sourceMinerCount[sourceId] = (reservations.sourceMinerCount[sourceId] ?? 0) + 1;
        }
        if (creep.spawning) { continue; }
        if (creep.memory.assignedMineralId && ensureArchetype(creep) === 'mineralMiner') {
            reservations.mineralWork += capabilities.harvest;
        }
    }

    return reservations;
}

export function assignmentPriority(archetype: CreepArchetype): number {
    if (archetype === 'miner' || archetype === 'remoteMiner') { return 1; }

    if (archetype === 'mineralMiner') { return 2; }

    if (archetype === 'hauler' || archetype === 'remoteHauler') { return 3; }

    if (archetype === 'doctor') { return 4; }

    if (archetype === 'worker') { return 5; }

    return 6;
}
