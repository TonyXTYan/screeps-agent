import { BODY_BUDGET_RATIO, BODY_MIN_BUDGET, MAX_CARRY_CAPACITY, bodyCost, ensureArchetype, getBodyCapabilities, getCreepCapabilities, planBodyForArchetype } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from './room.structures';
import { repairStructureFilter, wallRampartRepairCap } from './repair.rules';
import { isHostile } from './hostileUtils';
import { reserveRenewSpawns } from './spawn.renewal';
import { closest, closestByRange, firstStoredResource } from './utils.shared';
import * as remoteOps from './remote.operations';

// Local copies of functions not exported from utils.shared
function sumFreeEnergy(structures: EnergyStructure[]): number {
    let total = 0;
    for (const structure of structures) {
        total += structure.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return total;
}

function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }
    return total;
}

function firstStoredNonEnergyResource(store: StoreDefinition): ResourceConstant | null {
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (resource === RESOURCE_ENERGY) { continue; }
        if (store.getUsedCapacity(resource) > 0) { return resource; }
    }
    return null;
}

// ─── Shared types (exported so room.controller.ts can import rather than redefine) ───

export interface RoomControllerContext {
    room: Room;
    structures: RoomStructureCache;
    sources: Source[];
    mineral: Mineral | undefined;
    creeps: Creep[];
    droppedEnergy: Resource<RESOURCE_ENERGY>[];
    droppedResources: Resource<ResourceConstant>[];
    tombstones: Tombstone[];
    ruins: Ruin[];
    constructionSites: ConstructionSite[];
    repairTargets: AnyStructure[];
    injuredCreeps: Creep[];
    sourcePlans: SourcePlan[];
    mineralPlan: MineralPlan | null;
}

export interface SpawnRequest {
    archetype: CreepArchetype;
    reason: string;
    sourceId?: string;
    mineralId?: string;
    stationaryTargetId?: string;
    staticMining?: boolean;
    hasContainer?: boolean;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    workRatio?: number;
    minClaimParts?: number;
    maxClaimParts?: number;
    remoteStandby?: boolean;
}

export interface PendingSpawnRequest extends SpawnRequest {
    plannedBody?: BodyPartConstant[];
}

export interface ResourceTarget {
    target: WithdrawStructure;
    resource: ResourceConstant;
    amount: number;
}

export interface SourcePlan {
    source: Source;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

export interface MineralPlan {
    mineral: Mineral;
    extractor: StructureExtractor | undefined;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

export interface JobReservations {
    resources: { [targetId: string]: number };
    dropped: { [targetId: string]: number };
    energySinks: { [targetId: string]: number };
    constructionProgress: { [targetId: string]: number };
    repairProgress: { [targetId: string]: number };
    sourceWork: { [sourceId: string]: number };
    sourceMinerCount: { [sourceId: string]: number };
    mineralWork: number;
    upgraderWork: number;
}

// ─── Shared constants ───

const LINK_TRANSFER_THRESHOLD = 200;
const BUILD_RESERVATION_TICKS = 10;
const REPAIR_RESERVATION_TICKS = 5;
const MAX_REMOTE_HAULERS_PER_SOURCE = 2;
const REMOTE_HOME_RECOVERY_STORED_ENERGY = 500;
const REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED = 5000;
const REMOTE_THROTTLE_STORED_ENERGY = 1;
const REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5;
const REMOTE_HAULER_ABSOLUTE_MIN_COST = 600;
const REMOTE_HAULER_USEFUL_MIN_COST = 900;
const REMOTE_HAULER_MIN_DEMAND_RATIO = 0.4;
const REMOTE_MAINTAINER_MIN_COST = 500;

const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const TOWER_RESERVE_RATIO = 0.7;
const TOWER_RECOVERY_RATIO = 0.55;
const TOWER_HAULER_DEPOSIT_RATIO = 0.9;
const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;
const TERMINAL_RESERVE_RCL6 = 5000;
const TERMINAL_RESERVE_RCL7 = 10000;
const TERMINAL_RESERVE_RCL8 = 50000;
const MINERAL_WORK_DEMAND = 5;

// ─── Group D: Planning & Targeting (partial — init / memory helpers) ───

function initialiseRoomPlan(room: Room): void {
    if (!room.memory.plan) {
        room.memory.plan = {};
    }
    if (!room.memory.plan.remoteRooms) {
        room.memory.plan.remoteRooms = {};
    }
    if (!room.memory.plan.claimTargets) {
        room.memory.plan.claimTargets = [];
    }
}

function rememberPlans(context: RoomControllerContext): void {
    if (!context.room.memory.plan) { return; }

    context.room.memory.plan.sources = {};
    for (const plan of context.sourcePlans) {
        context.room.memory.plan.sources[plan.source.id] = {
            sourceId: plan.source.id,
            containerId: plan.container?.id,
            linkId: plan.link?.id,
            requiredWork: plan.requiredWork,
            assignedWork: plan.assignedWork,
            staticMining: plan.staticMining
        };
    }

    if (context.mineralPlan) {
        context.room.memory.plan.mineral = {
            mineralId: context.mineralPlan.mineral.id,
            extractorId: context.mineralPlan.extractor?.id,
            containerId: context.mineralPlan.container?.id,
            linkId: context.mineralPlan.link?.id,
            requiredWork: context.mineralPlan.requiredWork,
            assignedWork: context.mineralPlan.assignedWork,
            staticMining: context.mineralPlan.staticMining
        };
    } else {
        context.room.memory.plan.mineral = undefined;
    }
}

function updatePlanAssignments(context: RoomControllerContext): void {
    for (const sourcePlan of context.sourcePlans) {
        sourcePlan.assignedWork = assignedSourceWork(context.creeps, sourcePlan.source.id);
    }

    if (context.mineralPlan) {
        let assigned = 0;
        for (const creep of context.creeps) {
            if (creep.spawning) { continue; }
            if (creep.memory.assignedMineralId !== context.mineralPlan.mineral.id) { continue; }
            if (ensureArchetype(creep) !== 'mineralMiner') { continue; }
            assigned += getCreepCapabilities(creep).harvest;
        }
        context.mineralPlan.assignedWork = assigned;
    }
}

function rememberLoad(context: RoomControllerContext): void {
    const capacities = measureCapabilities(context.creeps);
    const spawnEnergyDeficit = sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
    const towerEnergyDeficit = sumFreeEnergy(context.structures.towers.filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO));
    const mineralReady = mineralReadyToMine(context);
    const salvageResources = totalStoredTargets(context.tombstones) +
        totalStoredTargets(context.ruins) +
        context.droppedResources.reduce((total, resource) => total + resource.amount, 0);

    context.room.memory.load = {
        updatedAt: Game.time,
        rcl: context.room.controller?.level ?? 0,
        energyAvailable: context.room.energyAvailable,
        energyCapacity: context.room.energyCapacityAvailable,
        storedEnergy: storedEnergy(context),
        sourceCount: context.sources.length,
        minerWork: capacities.minerWork,
        minerWorkDemand: totalSourcePlanWorkDemand(context.sourcePlans),
        haulerCapacity: capacities.haulerCapacity,
        haulerCapacityDemand: desiredHaulerCapacity(context).demand,
        workerWork: capacities.workerWork,
        workerWorkDemand: desiredWorkerWork(context),
        spawnEnergyDeficit,
        towerEnergyDeficit,
        constructionSites: context.constructionSites.length,
        repairTargets: context.repairTargets.length,
        mineralReady,
        salvageResources,
        mineralMinerWork: capacities.mineralMinerWork,
        mineralMinerWorkDemand: mineralReady && context.mineralPlan ? context.mineralPlan.requiredWork : 0
    };
}

function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
    }
}

// ─── Group A: Job Assignment ───

function assignJobs(context: RoomControllerContext): void {
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

function hasEnergyToGather(context: RoomControllerContext): boolean {
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

function assignWorkerPartialEnergyWork(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
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

function assignEnergySpendingJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): void {
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

function minCarryForHauler(rcl: number): number {
    if (rcl >= 7) return 6;
    if (rcl >= 4) return 4;
    return 2;
}

function minWorkForWorker(rcl: number): number {
    if (rcl >= 7) return 3;
    if (rcl >= 4) return 2;
    return 1;
}

function minWorkForMiner(rcl: number): number {
    if (rcl >= 7) return 4;
    if (rcl >= 4) return 3;
    return 1;
}

function meetsMinimumBody(body: BodyPartConstant[], archetype: CreepArchetype, rcl: number, fleetCount: number): boolean {
    if (fleetCount === 0) return true;
    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const carry = body.filter(p => p === CARRY).length;
        return carry >= minCarryForHauler(rcl);
    }
    if (archetype === 'worker') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForWorker(rcl);
    }
    if (archetype === 'miner' || archetype === 'remoteMiner' || archetype === 'mineralMiner') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForMiner(rcl);
    }
    return true;
}

function createReservations(context: RoomControllerContext): JobReservations {
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

function assignmentPriority(archetype: CreepArchetype): number {
    if (archetype === 'miner' || archetype === 'remoteMiner') { return 1; }
    if (archetype === 'mineralMiner') { return 2; }
    if (archetype === 'hauler' || archetype === 'remoteHauler') { return 3; }
    if (archetype === 'doctor') { return 4; }
    if (archetype === 'worker') { return 5; }
    return 6;
}

function keepCurrentJob(
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
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
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

function assignEmergencyEnergyDelivery(
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

function canEmergencyDeliverEnergy(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>
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
    // Tower-only demand: only interrupt haulers, not workers mid-build
    return archetype === 'hauler' && refillTowerTargets(context).length > 0;
}

function droppedResourceTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): Resource<ResourceConstant> | null {
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

function salvageWithdrawalTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): ResourceTarget | null {
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

function mineralContainerWithdrawalTarget(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): ResourceTarget | null {
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

function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

function energyDepositTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): StructureStorage | StructureTerminal | StructureContainer | StructureTower | null {
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

function energyWithdrawalTarget(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): StructureContainer | StructureStorage | StructureTerminal | StructureLink | null {
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

function resumePrimaryEnergyJob(
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

// Reservation primitives
function reserveResourceTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.resources[targetId] = (reservations.resources[targetId] ?? 0) + Math.max(0, amount);
}

function reserveDroppedTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.dropped[targetId] = (reservations.dropped[targetId] ?? 0) + Math.max(0, amount);
}

function reserveEnergySink(reservations: JobReservations, target: EnergyStructure, amount: number): void {
    const alreadyReserved = reservations.energySinks[target.id] ?? 0;
    const remainingCapacity = Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY) - alreadyReserved);
    const reserveAmount = Math.min(Math.max(0, amount), remainingCapacity);
    reservations.energySinks[target.id] = alreadyReserved + reserveAmount;
}

function reserveSourceWork(reservations: JobReservations, sourcePlan: SourcePlan, work: number): void {
    reservations.sourceWork[sourcePlan.source.id] = (reservations.sourceWork[sourcePlan.source.id] ?? 0) + work;
}

function reserveSourceIfNeeded(
    creep: Creep,
    reservations: JobReservations,
    sourcePlan: SourcePlan,
    work: number
): void {
    const alreadyAssigned = (creep.memory.assignedSourceId ?? creep.memory.sourceId) === sourcePlan.source.id;
    if (!alreadyAssigned) {
        reservations.sourceMinerCount[sourcePlan.source.id] = (reservations.sourceMinerCount[sourcePlan.source.id] ?? 0) + 1;
        reserveSourceWork(reservations, sourcePlan, work);
    }
}

// ─── Helpers needed by spawn planning ───

function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}

// ─── Group B: Spawn Planning ───

function runSpawnPlanner(context: RoomControllerContext): void {
    const allFreeSpawns = context.structures.spawns.filter((s) => !s.spawning);
    if (allFreeSpawns.length === 0) { return; }

    // When multiple spawns are free, keep at least one unreserved for spawn planning
    // so long renew queues do not starve replacement/deficit spawns.
    const maxRenewReservations = allFreeSpawns.length > 1 ? allFreeSpawns.length - 1 : allFreeSpawns.length;
    const renewalReservedSpawnIds = reserveRenewSpawns(
        renewalDemandCreepsForRoom(context.room.name),
        allFreeSpawns,
        maxRenewReservations
    );
    const freeSpawns = allFreeSpawns.filter((spawn) => !renewalReservedSpawnIds[spawn.id]);
    if (freeSpawns.length === 0) { return; }

    const pending: PendingSpawnRequest[] = [];
    const rcl = context.room.controller?.level ?? 0;

    for (const spawn of context.structures.spawns) {
        if (!spawn.spawning) continue;
        const memory = Memory.creeps[spawn.spawning.name];
        if (!memory || !memory.archetype) continue;
        const spawningCreep = Game.creeps[spawn.spawning.name];
        pending.push(pendingSpawnRequest({
            archetype: memory.archetype,
            sourceId: memory.sourceId ?? memory.assignedSourceId,
            remoteRoom: memory.remoteRoom,
            remoteMode: memory.remoteMode,
            remoteStandby: memory.remoteStandby,
            reason: 'currently spawning'
        }, spawningCreep?.body.map((part) => part.type)));
    }

    let remainingEnergy = context.room.energyAvailable;

    for (const spawn of freeSpawns) {
        let spawned = false;
        while (!spawned) {
            const request = chooseSpawnRequest(context, pending);
            if (!request) { break; }
            const homeFleet = remoteOps.creepsForHomeRoom(context.room.name);
            const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request, remainingEnergy);
            if (recoveryReason) {
                logRemoteSpawnSkip(context, request, recoveryReason);
                pending.push(pendingSpawnRequest(request));
                continue;
            }

            const defaultBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
            const maxBudget = request.archetype === 'claimer' && request.remoteMode === 'reserve'
                ? context.room.energyCapacityAvailable
                : defaultBudget;
            const body = planBodyForArchetype(request.archetype, maxBudget, {
                staticMining: request.staticMining,
                hasContainer: request.hasContainer,
                workRatio: request.workRatio,
                minClaimParts: request.minClaimParts,
                maxClaimParts: request.maxClaimParts
            });

            if (body.length === 0) {
                if (Game.time % 25 === 0) {
                    console.log('room.controller: waiting for energy to spawn ' + request.archetype + ' for ' + request.reason);
                }
                pending.push(pendingSpawnRequest(request));
                continue;
            }

            const cost = bodyCost(body);
            const remoteMinimumCost = remoteSpawnMinimumCost(context, request, cost);
            if (remoteMinimumCost > 0 && cost < remoteMinimumCost) {
                logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' planned=' + cost);
                pending.push(pendingSpawnRequest(request));
                continue;
            }

            if (cost > remainingEnergy) {
                const affordableBody = planBodyForArchetype(request.archetype, remainingEnergy, {
                    staticMining: request.staticMining,
                    hasContainer: request.hasContainer,
                    workRatio: request.workRatio,
                    minClaimParts: request.minClaimParts,
                    maxClaimParts: request.maxClaimParts
                });
                if (affordableBody.length > 0) {
                    const affordableCost = bodyCost(affordableBody);
                    const fleetCount = remoteOps.countFleetForArchetype(context.creeps, request.archetype) +
                        pendingArchetypeCount(pending, request.archetype);
                    if (remoteMinimumCost > 0 && affordableCost < remoteMinimumCost) {
                        logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' have=' + affordableCost + ' planned=' + cost);
                        pending.push(pendingSpawnRequest(request));
                        continue;
                    }
                    if (meetsMinimumBody(affordableBody, request.archetype, rcl, fleetCount) && affordableCost <= remainingEnergy) {
                        const aName = request.archetype + '-' + spawn.name + '-' + Game.time + (pending.length > 0 ? '-' + pending.length : '');
                        const aRole = legacyRoleForArchetype(request.archetype);
                        const aCode = spawn.spawnCreep(affordableBody, aName, {
                            memory: {
                                archetype: request.archetype,
                                role: aRole,
                                sourceId: request.sourceId,
                                assignedSourceId: request.sourceId,
                                assignedMineralId: request.mineralId,
                                stationaryTargetId: request.stationaryTargetId,
                                staticMining: request.staticMining,
                                homeRoom: context.room.name,
                                remoteRoom: request.remoteRoom,
                                remoteMode: request.remoteMode,
                                remoteStandby: request.remoteStandby
                            }
                        });
                        if (aCode === OK) {
                            console.log('room.controller: spawning ' + aName + ' for ' + request.reason + ' cost=' + affordableCost + ' (scaled from ' + cost + ')');
                            pending.push(pendingSpawnRequest(request, affordableBody));
                            remainingEnergy -= affordableCost;
                            spawned = true;
                        } else if (aCode !== ERR_BUSY && Game.time % 25 === 0) {
                            console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + aCode);
                            break;
                        } else {
                            pending.push(pendingSpawnRequest(request));
                            continue;
                        }
                    } else {
                        if (Game.time % 25 === 0) {
                            console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                        }
                        pending.push(pendingSpawnRequest(request));
                        continue;
                    }
                } else {
                    if (Game.time % 25 === 0) {
                        console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                    }
                    pending.push(pendingSpawnRequest(request));
                    continue;
                }
            } else {
                const name = request.archetype + '-' + spawn.name + '-' + Game.time + (pending.length > 0 ? '-' + pending.length : '');
                const role = legacyRoleForArchetype(request.archetype);
                const code = spawn.spawnCreep(body, name, {
                    memory: {
                        archetype: request.archetype,
                        role,
                        sourceId: request.sourceId,
                        assignedSourceId: request.sourceId,
                        assignedMineralId: request.mineralId,
                        stationaryTargetId: request.stationaryTargetId,
                        staticMining: request.staticMining,
                        homeRoom: context.room.name,
                        remoteRoom: request.remoteRoom,
                        remoteMode: request.remoteMode,
                        remoteStandby: request.remoteStandby
                    }
                });

                if (code === OK) {
                    console.log('room.controller: spawning ' + name + ' for ' + request.reason + ' cost=' + cost);
                    pending.push(pendingSpawnRequest(request, body));
                    remainingEnergy -= cost;
                    spawned = true;
                } else if (code !== ERR_BUSY && Game.time % 25 === 0) {
                    console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + code);
                    break;
                }
            }
        }
    }
}

function pendingSpawnRequest(request: SpawnRequest, plannedBody?: BodyPartConstant[]): PendingSpawnRequest {
    const pending: PendingSpawnRequest = {
        ...request
    };
    if (plannedBody) {
        pending.plannedBody = plannedBody;
    }
    return pending;
}

function renewalDemandCreepsForRoom(roomName: string): Creep[] {
    const creeps: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if (creep.room.name !== roomName) { continue; }
        if ((creep.memory.homeRoom ?? creep.room.name) !== roomName) { continue; }
        if (!creep.memory.renewing &&
            !creep.memory.remoteRenewing &&
            !creep.memory.remoteHaulerRenewAfterTrip) {
            continue;
        }
        creeps.push(creep);
    }
    creeps.sort((a, b) => (a.ticksToLive ?? Infinity) - (b.ticksToLive ?? Infinity));
    return creeps;
}

function addPendingCapabilities(
    capacities: ReturnType<typeof measureCapabilities>,
    pending: PendingSpawnRequest[]
): ReturnType<typeof measureCapabilities> {
    const totals = { ...capacities };
    for (const request of pending) {
        if (!request.plannedBody) { continue; }
        const caps = getBodyCapabilities(request.plannedBody);

        if (request.archetype === 'miner') {
            totals.minerWork += caps.harvest;
        } else if (request.archetype === 'hauler') {
            totals.haulerCapacity += caps.haul;
        } else if (request.archetype === 'mineralMiner') {
            totals.mineralMinerWork += caps.harvest;
        } else if (request.archetype === 'remoteMiner') {
            totals.remoteMinerWork += caps.harvest;
        } else if (request.archetype === 'remoteHauler') {
            totals.remoteHaulerCapacity += caps.haul;
        } else if (request.archetype === 'worker') {
            totals.workerWork += caps.work;
        }

        totals.heal += caps.heal;
        totals.claim += caps.claim;
    }
    return totals;
}

function pendingArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype === archetype) { count++; }
    }
    return count;
}

function pendingRemoteArchetypeCount(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId?: string,
    standby?: boolean
): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && request.sourceId !== sourceId) { continue; }
        if (standby !== undefined && !!request.remoteStandby !== standby) { continue; }
        count++;
    }
    return count;
}

function pendingRemoteBodyCapability(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId: string,
    capability: 'harvest' | 'haul'
): number {
    let total = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (request.sourceId !== sourceId) { continue; }
        if (!request.plannedBody) { continue; }
        const caps = getBodyCapabilities(request.plannedBody);
        total += capability === 'harvest' ? caps.harvest : caps.haul;
    }
    return total;
}

function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 3) { return 1; }
    const remainingWork = context.constructionSites.reduce(
        (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 4 && remainingWork > 30000) { return 3; }
    if (remainingWork > 10000) { return 2; }
    return 1;
}

function chooseSpawnRequest(context: RoomControllerContext, pending: PendingSpawnRequest[] = []): SpawnRequest | null {
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
        const rcl = context.room.controller?.level ?? 0;
        const maxWorkerCount = context.constructionSites.length < 3
            ? 1
            : ([0, 2, 2, 2, 3, 3, 3, 4, 4][Math.min(rcl, 8)] || 4);
        const workerCreeps = context.creeps.filter(c => ensureArchetype(c) === 'worker' && !c.spawning).length +
            pendingArchetypeCount(pending, 'worker');
        if (workerCreeps < maxWorkerCount) {
            return { archetype: 'worker', reason: 'worker deficit ' + capacities.workerWork + '/' + workerWorkDemand + ' ' + workerCreeps + '/' + maxWorkerCount, workRatio: workerWorkRatio(context) };
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

function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: ReturnType<typeof measureCapabilities>,
    pending: PendingSpawnRequest[] = []
): SpawnRequest | null {
    if (activeMinerCount(context.creeps) < context.sourcePlans.length) { return null; }
    if (pending.some(r => !r.remoteRoom)) { return null; }

    const homeFleet = remoteOps.creepsForHomeRoom(context.room.name);
    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.dangerUntil && remote.dangerUntil > Game.time) { continue; }
        if (remote.mode === 'harvest' && (!remote.sources || Object.keys(remote.sources).length === 0)) {
            if (remoteOps.countRemoteScouts(context.room.name, roomName) === 0 &&
                !pending.some(r => r.archetype === 'remoteScout' && r.remoteRoom === roomName) &&
                !remoteOps.hasAssignedNonScoutRemoteCreep(homeFleet, roomName) &&
                !pending.some(r => r.remoteRoom === roomName && r.archetype !== 'remoteScout')) {
                const request: SpawnRequest = { archetype: 'remoteScout', reason: 'remote scout ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (blockReason) {
                    logRemoteSpawnSkip(context, request, blockReason);
                    continue;
                }
                return request;
            }
            continue;
        }
        if (remote.mode === 'harvest' && remote.reserve !== false) {
            const reservation = Game.rooms[roomName]?.controller?.reservation;
            if ((!reservation || reservation.ticksToEnd < 4000) &&
                !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
                remoteOps.remoteClaimerCount(homeFleet, roomName, 'reserve', 2) === 0) {
                const maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
                const request: SpawnRequest = {
                    archetype: 'claimer',
                    reason: 'remote reserve ' + roomName,
                    remoteRoom: roomName,
                    remoteMode: 'reserve',
                    minClaimParts: 2,
                    maxClaimParts
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if (remote.mode === 'harvest' && remote.sources) {
            const numSources = Object.keys(remote.sources).length;
            const totalRoomHaulers = remoteOps.countRemoteHaulersForRoom(homeFleet, roomName) +
                pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName);
            const totalRoomMiners = remoteOps.countActiveRemoteMinersForRoom(homeFleet, roomName) +
                pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, undefined, false);
            const sourceLessStandbyMiners = remoteOps.countSourceLessRemoteStandbyMiners(homeFleet, roomName);
            const standbySourceId = remoteOps.sourceNeedingStandbyReplacement(homeFleet, roomName);
            if (standbySourceId &&
                !pending.some(r =>
                    r.archetype === 'remoteMiner' &&
                    r.remoteRoom === roomName &&
                    r.remoteStandby &&
                    r.sourceId === standbySourceId)) {
                const request: SpawnRequest = {
                    archetype: 'remoteMiner',
                    reason: 'remote standby replacement ' + roomName + ':' + standbySourceId,
                    remoteRoom: roomName,
                    remoteMode: remote.mode,
                    remoteStandby: true,
                    sourceId: standbySourceId,
                    staticMining: true,
                    hasContainer: remoteOps.remoteSourceHasContainerStation(remote.sources[standbySourceId])
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }

            for (const sourceId in remote.sources) {
                const sourcePlan = remote.sources[sourceId];
                if (sourcePlan.routeAccessible === false) { continue; }
                const targetMinerWork = sourcePlan.workDemand ?? 3;
                const minerCoverageHorizon = remoteOps.remoteSourceReplacementHorizon(context, sourcePlan, 'remoteMiner');
                const minerProjectedWork = remoteOps.projectedRemoteMinerWork(homeFleet, roomName, sourceId, minerCoverageHorizon) +
                    pendingRemoteBodyCapability(pending, 'remoteMiner', roomName, sourceId, 'harvest');
                const minerCount = remoteOps.countRemoteMinersForSource(homeFleet, roomName, sourceId) +
                    pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, sourceId, false);
                const sourceMinerLimit = remoteOps.remoteSourceActiveMinerLimit(sourcePlan);
                const sourceHasStandby = remoteOps.hasRemoteStandbyMinerForSource(homeFleet, roomName, sourceId) ||
                    pending.some(r =>
                        r.archetype === 'remoteMiner' &&
                        r.remoteRoom === roomName &&
                        r.remoteStandby &&
                        r.sourceId === sourceId);
                if (minerProjectedWork < targetMinerWork && minerCount < sourceMinerLimit && (minerCount === 0 || minerProjectedWork === 0) &&
                    totalRoomMiners <= numSources &&
                    sourceLessStandbyMiners === 0 &&
                    !sourceHasStandby &&
                    !pending.some(r => r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    const request: SpawnRequest = {
                        archetype: 'remoteMiner',
                        reason: 'remote source handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + minerProjectedWork + '/' + targetMinerWork,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId,
                        staticMining: true,
                        hasContainer: remoteOps.remoteSourceHasContainerStation(sourcePlan)
                    };
                    const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                    if (!blockReason) { return request; }
                    logRemoteSpawnSkip(context, request, blockReason);
                }

                const targetHaulerCapacity = sourcePlan.haulerCapacityDemand ?? 150;
                const haulerCoverageHorizon = remoteOps.remoteSourceReplacementHorizon(context, sourcePlan, 'remoteHauler');
                const haulerProjectedCapacity = remoteOps.projectedRemoteHaulerCapacity(homeFleet, roomName, sourceId, haulerCoverageHorizon) +
                    pendingRemoteBodyCapability(pending, 'remoteHauler', roomName, sourceId, 'haul');
                if (haulerProjectedCapacity < targetHaulerCapacity &&
                    totalRoomHaulers < 2 * numSources &&
                    remoteOps.countRemoteHaulersForSource(homeFleet, roomName, sourceId) +
                        pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName, sourceId) < MAX_REMOTE_HAULERS_PER_SOURCE &&
                    !remoteOps.hasIdleRemoteHauler(homeFleet, roomName, sourceId) &&
                    !pending.some(r => r.archetype === 'remoteHauler' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    const request: SpawnRequest = {
                        archetype: 'remoteHauler',
                        reason: 'remote haul handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + haulerProjectedCapacity + '/' + targetHaulerCapacity,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId
                    };
                    const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                    if (!blockReason) { return request; }
                    logRemoteSpawnSkip(context, request, blockReason);
                }
            }

            if (remote.maintainRoads !== false && remoteOps.remoteNeedsMaintainer(roomName) &&
                !remoteOps.hasRemoteMaintainer(homeFleet, roomName) &&
                !pending.some(r => r.archetype === 'remoteMaintainer' && r.remoteRoom === roomName)) {
                const request: SpawnRequest = { archetype: 'remoteMaintainer', reason: 'remote maintenance ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if ((remote.mode === 'reserve' || remote.mode === 'claim') &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
            remoteOps.remoteClaimerCount(homeFleet, roomName, remote.mode, remote.mode === 'reserve' ? 2 : 1) === 0) {
            let maxClaimParts: number | undefined;
            if (remote.mode === 'reserve') {
                const reservation = Game.rooms[roomName]?.controller?.reservation;
                maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
            }
            const request: SpawnRequest = {
                archetype: 'claimer',
                reason: 'configured remote ' + remote.mode + ' ' + roomName,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                minClaimParts: remote.mode === 'reserve' ? 2 : undefined,
                maxClaimParts
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }

    return null;
}

function isRemoteSpawnRequest(request: SpawnRequest): boolean {
    return request.archetype === 'remoteMiner' ||
        request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        request.archetype === 'remoteScout' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

function isEmergencyRemoteRequest(homeFleet: Creep[], request: SpawnRequest): boolean {
    if (request.archetype === 'remoteScout') { return true; }
    if (request.archetype !== 'remoteMiner' || !request.remoteRoom || !request.sourceId) { return false; }
    if (remoteOps.countSourceLessRemoteStandbyMiners(homeFleet, request.remoteRoom) > 0) { return false; }
    return remoteOps.countRemoteMinersForSource(homeFleet, request.remoteRoom, request.sourceId) === 0 &&
        remoteOps.projectedRemoteMinerWork(homeFleet, request.remoteRoom, request.sourceId, 0) === 0;
}

function remoteSpawnRecoveryBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    request: SpawnRequest,
    availableEnergy: number = context.room.energyAvailable
): string | null {
    if (!isRemoteSpawnRequest(request)) { return null; }
    if (isRouteHealthMaintainerRequest(context, request)) { return null; }
    if (isEmergencyRemoteRequest(homeFleet, request)) { return null; }

    const energyCapacity = context.room.energyCapacityAvailable;
    const hasStorage = !!(context.structures.storage || context.structures.terminal);
    if (hasStorage && storedEnergy(context) < REMOTE_HOME_RECOVERY_STORED_ENERGY) {
        return 'home recovery stored<' + REMOTE_HOME_RECOVERY_STORED_ENERGY;
    }
    const stored = hasStorage ? storedEnergy(context) : 0;
    if (energyCapacity > 0 && availableEnergy < energyCapacity * REMOTE_SPAWN_MIN_ENERGY_RATIO &&
        stored < REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED) {
        return 'home recovery energy<' + Math.ceil(REMOTE_SPAWN_MIN_ENERGY_RATIO * 100) + '% remaining=' + availableEnergy;
    }
    return null;
}

function remoteSpawnMinimumCost(
    context: RoomControllerContext,
    request: SpawnRequest,
    plannedCost: number
): number {
    if (!isRemoteSpawnRequest(request)) { return 0; }

    if (request.archetype === 'remoteHauler') {
        const demand = remoteSourcePlanForRequest(context, request)?.haulerCapacityDemand ?? 150;
        const capacityCost = remoteHaulerCostForCapacity(Math.ceil(demand * REMOTE_HAULER_MIN_DEMAND_RATIO));
        return Math.max(REMOTE_HAULER_ABSOLUTE_MIN_COST, Math.min(REMOTE_HAULER_USEFUL_MIN_COST, capacityCost));
    }

    if (request.archetype === 'remoteMiner') {
        const homeFleet = remoteOps.creepsForHomeRoom(context.room.name);
        if (isEmergencyRemoteRequest(homeFleet, request)) {
            return bodyCost([WORK, CARRY, MOVE]);
        }
        const sourcePlan = remoteSourcePlanForRequest(context, request);
        const workDemand = sourcePlan?.workDemand ?? 3;
        return remoteMinerCostForWorkDemand(context, request, workDemand, plannedCost);
    }

    if (request.archetype === 'remoteMaintainer') {
        return REMOTE_MAINTAINER_MIN_COST;
    }

    if (request.archetype === 'claimer' && request.remoteMode === 'reserve') {
        return (request.minClaimParts ?? 1) * bodyCost([CLAIM, MOVE]);
    }

    return 0;
}

function isRouteHealthMaintainerRequest(context: RoomControllerContext, request: SpawnRequest): boolean {
    if (request.archetype !== 'remoteMaintainer' || !request.remoteRoom) { return false; }
    const remotePlan = context.room.memory.plan?.remoteRooms?.[request.remoteRoom];
    return remoteOps.remoteNeedsRouteHealthMaintainer(request.remoteRoom, remotePlan);
}

function remoteSourcePlanForRequest(
    context: RoomControllerContext,
    request: SpawnRequest
): RemoteSourcePlan | undefined {
    if (!request.remoteRoom || !request.sourceId) { return undefined; }
    return context.room.memory.plan?.remoteRooms?.[request.remoteRoom]?.sources?.[request.sourceId];
}

function remoteHaulerCostForCapacity(capacity: number): number {
    const segments = Math.max(1, Math.ceil(capacity / (2 * CARRY_CAPACITY)));
    return segments * bodyCost([CARRY, CARRY, MOVE]);
}

function remoteMinerCostForWorkDemand(
    context: RoomControllerContext,
    request: SpawnRequest,
    workDemand: number,
    plannedCost: number
): number {
    for (let budget = bodyCost([WORK, CARRY, MOVE]); budget <= context.room.energyCapacityAvailable; budget += 50) {
        const body = planBodyForArchetype('remoteMiner', budget, {
            staticMining: request.staticMining,
            hasContainer: request.hasContainer
        });
        if (body.length === 0) { continue; }
        if (getBodyCapabilities(body).harvest >= workDemand) {
            return bodyCost(body);
        }
    }
    return plannedCost;
}

function logRemoteSpawnSkip(context: RoomControllerContext, request: SpawnRequest, reason: string): void {
    if (Game.time % 25 !== 0) { return; }
    console.log('room.controller: skipping ' + request.archetype +
        ' for ' + request.reason +
        ' reason=' + reason +
        ' stored=' + storedEnergy(context) +
        ' energy=' + context.room.energyAvailable + '/' + context.room.energyCapacityAvailable);
}

function remoteRequestBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    request: SpawnRequest
): string | null {
    const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request);
    if (recoveryReason) { return recoveryReason; }

    if (storedEnergy(context) < REMOTE_THROTTLE_STORED_ENERGY && remoteRequestUsesRemoteIncome(request)) {
        const primaryRemote = firstEnabledHarvestRemoteName(remoteRooms);
        if (primaryRemote && roomName !== primaryRemote) {
            return 'remote throttle primary=' + primaryRemote + ' stored<' + REMOTE_THROTTLE_STORED_ENERGY;
        }
    }

    if (request.archetype === 'remoteHauler' && hasRemoteRouteCongestion(homeFleet, roomName)) {
        return 'route congestion';
    }

    return null;
}

function remoteRequestUsesRemoteIncome(request: SpawnRequest): boolean {
    return request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

function firstEnabledHarvestRemoteName(remoteRooms: { [roomName: string]: RemoteRoomPlan }): string | null {
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (remote.enabled && remote.mode === 'harvest') { return roomName; }
    }
    return null;
}

function hasRemoteRouteCongestion(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.jobType !== 'travelRoom') { continue; }
        if ((creep.memory.travelStuckTicks ?? 0) >= 4) { return true; }
    }
    return false;
}

function measureCapabilities(creeps: Creep[]): {
    minerWork: number;
    haulerCapacity: number;
    workerWork: number;
    heal: number;
    claim: number;
    mineralMinerWork: number;
    remoteMinerWork: number;
    remoteHaulerCapacity: number;
} {
    let minerWork = 0;
    let haulerCapacity = 0;
    let workerWork = 0;
    let heal = 0;
    let claim = 0;
    let mineralMinerWork = 0;
    let remoteMinerWork = 0;
    let remoteHaulerCapacity = 0;

    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        const capabilities = getCreepCapabilities(creep);

        if (archetype === 'miner') {
            minerWork += capabilities.harvest;
        }
        else if (archetype === 'hauler') { haulerCapacity += capabilities.haul; }
        else if (archetype === 'mineralMiner') { mineralMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteMiner') { remoteMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteHauler') { remoteHaulerCapacity += capabilities.haul; }
        else if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { /* tracked separately */ }
        else if (archetype === 'doctor' || archetype === 'claimer' || archetype === 'defender') { /* tracked separately */ }
        else { workerWork += capabilities.work; }

        heal += capabilities.heal;
        claim += capabilities.claim;
    }

    return {
        minerWork,
        haulerCapacity,
        workerWork,
        heal,
        claim,
        mineralMinerWork,
        remoteMinerWork,
        remoteHaulerCapacity
    };
}

function desiredHaulerCapacity(context: RoomControllerContext): { demand: number; maxCount: number } {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 10 ? 300 : 0;
    const rawDemand = context.sources.length * base + rclBonus + salvageBonus;

    const haulerBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const maxCarryPerHauler = Math.min(MAX_CARRY_CAPACITY, 2 * Math.floor(haulerBudget / 150) * CARRY_CAPACITY);
    const maxCount = Math.max(2, Math.ceil(rawDemand / Math.max(1, maxCarryPerHauler)) + 1);
    return { demand: Math.min(rawDemand, maxCarryPerHauler * maxCount), maxCount };
}

function desiredWorkerWork(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (context.constructionSites.length > 0) {
        const base = Math.min(12, 4 + context.constructionSites.length);

        if (rcl >= 4) {
            const ratio = workerWorkRatio(context);
            const unitCost = ratio * 100 + 100;
            const unitParts = ratio + 2;
            const energyAvail = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
            const segments = Math.min(
                Math.floor(50 / unitParts),
                Math.floor(energyAvail / unitCost)
            );
            const workPerWorker = segments * ratio;
            const upgradeDemand = desiredUpgraderWork(rcl);
            const minWorkers = Math.max(2, 1 + Math.ceil(upgradeDemand / Math.max(1, workPerWorker)));
            return Math.max(base, minWorkers * workPerWorker);
        }

        return base;
    }
    if (rcl >= 8) { return 8; }
    if (rcl >= 7) { return 6; }
    return 4;
}

// ─── Group C: Energy Management ───

function refillSpawnTargets(context: RoomControllerContext): EnergyStructure[] {
    return [...context.structures.spawns, ...context.structures.extensions]
        .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
}

function refillTowerTargets(context: RoomControllerContext): EnergyStructure[] {
    return context.structures.towers
        .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO);
}

function refillSpawnTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillSpawnTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

function refillTowerTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillTowerTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

function refillTerminalTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): StructureTerminal | null {
    const terminal = context.structures.terminal;
    if (!terminal || terminal.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return null;
    }
    const reserved = reservations.energySinks[terminal.id] ?? 0;
    const deficit = terminalEnergyReserveDeficit(context, reservations);
    return deficit > reserved ? terminal : null;
}

function runLinks(context: RoomControllerContext): void {
    const receivers = linkReceivers(context);
    if (receivers.length === 0) { return; }

    const senders = uniqueLinks([
        ...context.structures.links.source,
        ...context.structures.links.hub.filter((link) => spawnEnergyPressure(context) === 0),
        ...context.structures.links.other
    ]);

    for (const link of senders) {
        if (link.cooldown > 0) { continue; }
        if (link.store.getUsedCapacity(RESOURCE_ENERGY) < LINK_TRANSFER_THRESHOLD) { continue; }

        const receiver = receivers.find((candidate) =>
            candidate.id !== link.id &&
            candidate.store.getFreeCapacity(RESOURCE_ENERGY) >= LINK_TRANSFER_THRESHOLD);
        if (!receiver) { continue; }

        const code = link.transferEnergy(receiver);
        if (code !== OK && Game.time % 25 === 0) {
            console.log('room.controller: source link transfer failed in ' + context.room.name + ' with code ' + code);
        }
    }
}

function linkReceivers(context: RoomControllerContext): StructureLink[] {
    const receivers: StructureLink[] = [];
    const spawnPressure = spawnEnergyPressure(context);
    const controllerNeedsEnergy = context.room.controller !== undefined &&
        context.structures.links.controller.some((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) < 400);

    if (spawnPressure > 0) {
        receivers.push(...context.structures.links.sink, ...context.structures.links.hub);
    }

    if (controllerNeedsEnergy) {
        receivers.push(...context.structures.links.controller);
    }

    receivers.push(...context.structures.links.hub, ...context.structures.links.controller);
    return uniqueLinks(receivers);
}

function uniqueLinks(links: StructureLink[]): StructureLink[] {
    const seen: { [id: string]: boolean } = {};
    const result: StructureLink[] = [];
    for (const link of links) {
        if (seen[link.id]) { continue; }
        seen[link.id] = true;
        result.push(link);
    }
    return result;
}

function spawnEnergyRatio(context: RoomControllerContext): number {
    let used = 0, total = 0;
    for (const s of [...context.structures.spawns, ...context.structures.extensions]) {
        used += s.store.getUsedCapacity(RESOURCE_ENERGY);
        total += s.store.getCapacity(RESOURCE_ENERGY);
    }
    return total > 0 ? used / total : 1;
}

function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
}

function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }
    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }
    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }
    return 0;
}

function roomHasEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0 || refillTowerTargets(context).length > 0;
}

function roomHasSpawnEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0;
}

function roomNeedsCriticalEnergyRecovery(context: RoomControllerContext): boolean {
    const roomMemory = context.room.memory;
    const wasActive = roomMemory.energyRecoveryActive === true;

    const spawnRatio = spawnEnergyRatio(context);
    const hasLowTower = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_ENTER_TOWER_RATIO);
    const towersRecovered = context.structures.towers.every((tower) => towerEnergyRatio(tower) >= ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    const shouldEnter = spawnRatio < ENERGY_RECOVERY_ENTER_SPAWN_RATIO || hasLowTower;
    const shouldExit = spawnRatio >= ENERGY_RECOVERY_EXIT_SPAWN_RATIO && towersRecovered;

    if (wasActive) {
        if (shouldExit) {
            roomMemory.energyRecoveryActive = false;
        }
    } else if (shouldEnter) {
        roomMemory.energyRecoveryActive = true;
    }

    roomMemory.energyRecoveryReason = energyRecoveryReason(context, roomMemory.energyRecoveryActive === true);
    return roomMemory.energyRecoveryActive === true;
}

function energyRecoveryReason(context: RoomControllerContext, active: boolean): EnergyRecoveryReason {
    if (!active) { return 'none'; }

    const spawnHeld = spawnEnergyRatio(context) < ENERGY_RECOVERY_EXIT_SPAWN_RATIO;
    const towerHeld = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    if (spawnHeld && towerHeld) { return 'spawn+tower'; }
    if (spawnHeld) { return 'spawn'; }
    if (towerHeld) { return 'tower'; }
    return 'hysteresis';
}

function terminalWithdrawableEnergy(
    context: RoomControllerContext,
    reservations: JobReservations,
    allowReserveBreak: boolean
): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }
    const reserved = reservations.resources[terminal.id] ?? 0;
    const available = terminal.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
    if (available <= 0) { return 0; }
    if (allowReserveBreak) { return available; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    return Math.max(0, available - reserveTarget);
}

function terminalEnergyReserveDeficit(context: RoomControllerContext, reservations: JobReservations): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    if (reserveTarget <= 0) { return 0; }

    const incomingReserved = reservations.energySinks[terminal.id] ?? 0;
    const projectedEnergy = terminal.store.getUsedCapacity(RESOURCE_ENERGY) + incomingReserved;
    return Math.max(0, reserveTarget - projectedEnergy);
}

// ─── Group D: Planning & Targeting (full) ───

function buildSourcePlans(sources: Source[], structures: RoomStructureCache): SourcePlan[] {
    return sources.map((source) => {
        const container = closestByRange(source, structures.containers.filter((structure) => structure.pos.getRangeTo(source) <= 1));
        const link = closestByRange(source, structures.links.source.filter((structure) => structure.pos.getRangeTo(source) <= 2));
        return {
            source,
            container,
            link,
            requiredWork: sourceWorkDemand(source),
            assignedWork: 0,
            staticMining: container !== null && link === null
        };
    });
}

function buildMineralPlan(mineral: Mineral, structures: RoomStructureCache): MineralPlan {
    let container = closestByRange(mineral, structures.containers.filter((structure) => structure.pos.getRangeTo(mineral) <= 1));
    if (!container && mineral.room) {
        const allContainers = mineral.room.find(FIND_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
        container = closestByRange(mineral, allContainers.filter((c) => c.pos.getRangeTo(mineral) <= 1));
    }
    const link = closestByRange(mineral, [...structures.links.hub, ...structures.links.other].filter((structure) => structure.pos.getRangeTo(mineral) <= 2));
    return {
        mineral,
        extractor: structures.extractor,
        container,
        link,
        requiredWork: MINERAL_WORK_DEMAND,
        assignedWork: 0,
        staticMining: container !== null
    };
}

function totalSourcePlanWorkDemand(sourcePlans: SourcePlan[]): number {
    let demand = 0;
    for (const sourcePlan of sourcePlans) {
        demand += sourcePlan.requiredWork;
    }
    return demand;
}

function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

function sourceSpawnDeficit(context: RoomControllerContext, pendingSourceIds: Set<string> = new Set()): SourcePlan | null {
    for (const plan of context.sourcePlans) {
        if (pendingSourceIds.has(plan.source.id)) { continue; }
        const assignedMiners = assignedSourceMinerCount(context.creeps, plan.source.id);
        if (assignedMiners === 0) {
            return plan;
        }
    }
    return null;
}

function activeMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

function assignedSourceMinerCount(creeps: Creep[], sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

function assignedSourceWork(creeps: Creep[], sourceId: string): number {
    let work = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        work += getCreepCapabilities(creep).harvest;
    }
    return work;
}

function assignedSourcePlan(
    creep: Creep,
    sourcePlans: SourcePlan[],
    reservations: JobReservations
): SourcePlan | null {
    if (sourcePlans.length === 0) { return null; }

    const assignedId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (assignedId) {
        const current = sourcePlans.find((plan) => plan.source.id === assignedId);
        const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
        if (current && (!uncovered || (reservations.sourceMinerCount[current.source.id] ?? 0) <= 1)) {
            return current;
        }
        if (current && uncovered) {
            reservations.sourceMinerCount[current.source.id] = Math.max(0, (reservations.sourceMinerCount[current.source.id] ?? 1) - 1);
            reservations.sourceWork[current.source.id] = Math.max(0, (reservations.sourceWork[current.source.id] ?? 0) - getCreepCapabilities(creep).harvest);
            reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
            reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
            creep.memory.sourceId = uncovered.source.id;
            creep.memory.assignedSourceId = uncovered.source.id;
            return uncovered;
        }
    }

    const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
    if (uncovered) {
        reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
        reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = uncovered.source.id;
        creep.memory.assignedSourceId = uncovered.source.id;
        return uncovered;
    }

    let best: SourcePlan | null = null;
    let bestDeficit = -Infinity;
    for (const plan of sourcePlans) {
        const reserved = reservations.sourceWork[plan.source.id] ?? 0;
        const deficit = plan.requiredWork - reserved;
        if (deficit > bestDeficit) {
            best = plan;
            bestDeficit = deficit;
        }
    }

    if (best && bestDeficit > 0) {
        reservations.sourceMinerCount[best.source.id] = (reservations.sourceMinerCount[best.source.id] ?? 0) + 1;
        reservations.sourceWork[best.source.id] = (reservations.sourceWork[best.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = best.source.id;
        creep.memory.assignedSourceId = best.source.id;
    } else {
        return null;
    }
    return best;
}

function bestConstructionSite(
    creep: Creep,
    sites: ConstructionSite[],
    reservations: JobReservations,
    workParts: number
): ConstructionSite | null {
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

function repairTargetFor(
    creep: Creep,
    targets: AnyStructure[],
    reservations: JobReservations,
    workParts: number
): AnyStructure | null {
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

function constructionPriority(site: ConstructionSite): number {
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

function remainingConstructionProgress(site: ConstructionSite, reservations: JobReservations): number {
    return site.progressTotal - site.progress - (reservations.constructionProgress[site.id] ?? 0);
}

function remainingRepairProgress(structure: AnyStructure, reservations: JobReservations): number {
    const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
    const repairRcl = structure.room.controller?.level ?? 0;
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
    const cappedRemaining = Math.max(0, maxHits - structure.hits);
    return cappedRemaining - (reservations.repairProgress[structure.id] ?? 0);
}

function reserveConstructionProgress(reservations: JobReservations, site: ConstructionSite, workParts: number): void {
    reservations.constructionProgress[site.id] = (reservations.constructionProgress[site.id] ?? 0) +
        workParts * BUILD_POWER * BUILD_RESERVATION_TICKS;
}

function reserveRepairProgress(reservations: JobReservations, structure: AnyStructure, workParts: number): void {
    reservations.repairProgress[structure.id] = (reservations.repairProgress[structure.id] ?? 0) +
        workParts * REPAIR_POWER * REPAIR_RESERVATION_TICKS;
}

function desiredUpgraderWork(rcl: number): number {
    if (rcl >= 8) { return 1; }
    if (rcl >= 7) { return 10; }
    if (rcl >= 5) { return 5; }
    return 2;
}

function shouldReserveUpgrade(context: RoomControllerContext, reservations: JobReservations): boolean {
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

function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }
    return context.mineralPlan?.container != null;
}

function shouldRepairWithCreeps(context: RoomControllerContext): boolean {
    if (context.constructionSites.length === 0) { return true; }
    if (!context.structures.storage) { return true; }
    return context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 5000;
}

function setStaticHarvestMemory(creep: Creep, sourcePlan: SourcePlan): void {
    creep.memory.sourceId = sourcePlan.source.id;
    creep.memory.assignedSourceId = sourcePlan.source.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForSource(sourcePlan);
    creep.memory.staticMining = sourcePlan.staticMining;
}

function setStaticMineralMemory(creep: Creep, mineralPlan: MineralPlan): void {
    creep.memory.assignedMineralId = mineralPlan.mineral.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForMineral(mineralPlan);
    creep.memory.staticMining = mineralPlan.staticMining;
}

function clearStaticMiningMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.staticMining = undefined;
}

function stationaryTargetIdForSource(sourcePlan: SourcePlan): string {
    return sourcePlan.container?.id ?? sourcePlan.source.id;
}

function stationaryTargetIdForMineral(mineralPlan: MineralPlan): string {
    return mineralPlan.container?.id ?? mineralPlan.mineral.id;
}

function closestSourcePlan(creep: Creep, sourcePlans: SourcePlan[]): SourcePlan | null {
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

function totalStoredTargets(targets: Array<Tombstone | Ruin>): number {
    let total = 0;
    for (const target of targets) {
        total += totalStoredResources(target.store);
    }
    return total;
}

function haulerMiningSiteMinPickup(creep: Creep): number {
    return Math.max(1, Math.ceil(creep.store.getCapacity() * 0.5));
}

function isMiningSiteEnergyTarget(
    context: RoomControllerContext,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink
): boolean {
    if (target.structureType === STRUCTURE_LINK) {
        return context.structures.links.source.some((link) => link.id === target.id);
    }
    if (target.structureType !== STRUCTURE_CONTAINER) { return false; }
    if (context.mineralPlan?.container?.id === target.id) { return true; }
    return context.sourcePlans.some((sourcePlan) => sourcePlan.container?.id === target.id);
}

function storedEnergy(context: RoomControllerContext): number {
    const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    return storageEnergy + terminalEnergy;
}

function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}

// ─── Helpers called from room.controller.ts retained functions ───

function setJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null): void {
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

function setTravelJob(creep: Creep, roomName: string): void {
    if (creep.memory.jobType === 'travelRoom' && creep.memory.jobRoomName === roomName) { return; }
    creep.memory.jobType = 'travelRoom';
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setResourceJob(
    creep: Creep,
    jobType: CreepJobType,
    target: (RoomObject & { id: string }) | undefined | null,
    resource: ResourceConstant | null
): void {
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

function jobTarget<T extends RoomObject>(creep: Creep): T | null {
    const id = creep.memory.jobTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as T | null;
}

function bestHealTarget(creep: Creep, targets: Creep[]): Creep | null {
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

function isEmergencyHealTarget(target: Creep): boolean {
    if (target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO) {
        return true;
    }
    return target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
        filter: isHostile
    }).length > 0;
}

function rememberActiveAsPrimary(creep: Creep): void {
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

function rememberPrimaryJob(
    creep: Creep,
    jobType: CreepJobType,
    target: RoomObject & { id: string },
    resource?: ResourceConstant
): void {
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') { return; }
    if (creep.memory.primaryJobType === jobType && creep.memory.primaryTargetId === target.id) { return; }
    creep.memory.primaryJobType = jobType;
    creep.memory.primaryTargetId = target.id;
    creep.memory.primaryRoomName = target.pos.roomName;
    creep.memory.primaryResourceType = resource;
    creep.memory.primaryAssignedAt = Game.time;
}

function clearPrimaryJob(creep: Creep): void {
    creep.memory.primaryJobType = undefined;
    creep.memory.primaryTargetId = undefined;
    creep.memory.primaryRoomName = undefined;
    creep.memory.primaryResourceType = undefined;
    creep.memory.primaryAssignedAt = undefined;
}

// ─── Exports ───

export {
    assignJobs,
    runSpawnPlanner,
};

// Additional exports — functions accessed from room.controller.ts
export {
    initialiseRoomPlan,
    rememberPlans,
    rememberLoad,
    rememberRcl,
    updatePlanAssignments,
    buildSourcePlans,
    buildMineralPlan,
    storedEnergy,
    sumFreeEnergy,
    totalStoredTargets,
    totalStoredResources,
    firstStoredResource,
    firstStoredNonEnergyResource,
    towerEnergyRatio,
    spawnEnergyRatio,
    spawnEnergyPressure,
    roomHasEnergyDemand,
    roomHasSpawnEnergyDemand,
    roomNeedsCriticalEnergyRecovery,
    energyRecoveryReason,
    terminalEnergyReserveTarget,
    terminalEnergyReserveDeficit,
    terminalWithdrawableEnergy,
    linkReceivers,
    uniqueLinks,
    runLinks,
    refillSpawnTargets,
    refillTowerTargets,
    refillSpawnTarget,
    refillTowerTarget,
    refillTerminalTarget,
    sourceWorkDemand,
    totalSourcePlanWorkDemand,
    activeMinerCount,
    assignedSourceMinerCount,
    assignedSourceWork,
    assignedSourcePlan,
    sourceSpawnDeficit,
    desiredUpgraderWork,
    shouldReserveUpgrade,
    mineralReadyToMine,
    setStaticHarvestMemory,
    setStaticMineralMemory,
    clearStaticMiningMemory,
    stationaryTargetIdForSource,
    stationaryTargetIdForMineral,
    closestSourcePlan,
    haulerMiningSiteMinPickup,
    isMiningSiteEnergyTarget,
    reserveResourceTarget,
    reserveDroppedTarget,
    reserveEnergySink,
    reserveSourceWork,
    reserveSourceIfNeeded,
    createReservations,
    assignmentPriority,
    keepCurrentJob,
    currentJobStillValid,
    shouldInterruptForEmergencyEnergyDelivery,
    reserveCurrentJob,
    shouldInterruptForEnergyRefill,
    assignEmergencyEnergyDelivery,
    canEmergencyDeliverEnergy,
    droppedResourceTarget,
    salvageWithdrawalTarget,
    mineralContainerWithdrawalTarget,
    resourceDepositTarget,
    energyDepositTarget,
    energyWithdrawalTarget,
    hasEnergyToGather,
    assignWorkerPartialEnergyWork,
    assignEnergySpendingJob,
    minCarryForHauler,
    minWorkForWorker,
    minWorkForMiner,
    meetsMinimumBody,
    resumePrimaryEnergyJob,
    isDedicatedRemoteCreep,
    pendingSpawnRequest,
    renewalDemandCreepsForRoom,
    addPendingCapabilities,
    pendingArchetypeCount,
    pendingRemoteArchetypeCount,
    pendingRemoteBodyCapability,
    workerWorkRatio,
    chooseSpawnRequest,
    remoteSpawnRequest,
    isRemoteSpawnRequest,
    isEmergencyRemoteRequest,
    remoteSpawnRecoveryBlockReason,
    remoteSpawnMinimumCost,
    isRouteHealthMaintainerRequest,
    remoteSourcePlanForRequest,
    remoteHaulerCostForCapacity,
    remoteMinerCostForWorkDemand,
    logRemoteSpawnSkip,
    remoteRequestBlockReason,
    remoteRequestUsesRemoteIncome,
    firstEnabledHarvestRemoteName,
    hasRemoteRouteCongestion,
};
