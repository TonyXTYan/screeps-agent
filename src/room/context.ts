import { ensureArchetype, getCreepCapabilities } from "../creep.capabilities";
import { repairStructureFilter } from "../role.doctor";
import { getRoomStructures, RoomStructureCache } from "../room.structures";
import { TOWER_RESERVE_RATIO, ENERGY_RECOVERY_ENTER_TOWER_RATIO, ENERGY_RECOVERY_EXIT_TOWER_RATIO, ENERGY_RECOVERY_ENTER_SPAWN_RATIO, ENERGY_RECOVERY_EXIT_SPAWN_RATIO, MINERAL_WORK_DEMAND, TERMINAL_RESERVE_RCL8, TERMINAL_RESERVE_RCL7, TERMINAL_RESERVE_RCL6 } from "./constants";
import { totalStoredResources, sumFreeEnergy, towerEnergyRatio, mineralReadyToMine, totalStoredTargets, storedEnergy, spawnEnergyRatio, closestByRange, spawnEnergyPressure } from "./jobs";
import { assignedSourceWork, measureCapabilities, totalSourcePlanWorkDemand, desiredHaulerCapacity, desiredWorkerWork, sourceWorkDemand, refillTowerTargets } from "./spawn";
import { RoomControllerContext, SourcePlan, MineralPlan, JobReservations } from "./types";

export function buildContext(room: Room): RoomControllerContext {
    const structures = getRoomStructures(room);
    const sources = room.find(FIND_SOURCES);
    const minerals = room.find(FIND_MINERALS);
    const creeps = room.find(FIND_MY_CREEPS);
    const droppedResources = room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) => resource.amount > 0
            }) as Resource<ResourceConstant>[];
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
            }) as Resource<RESOURCE_ENERGY>[];
    const tombstones = room.find(FIND_TOMBSTONES, {
                filter: (tombstone) => totalStoredResources(tombstone.store) > 0
            });
    const ruins = room.find(FIND_RUINS, {
                filter: (ruin) => totalStoredResources(ruin.store) > 0
            });
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const rcl = room.controller?.level ?? 0;
    const repairTargets = room.find(FIND_STRUCTURES, { filter: (s) => repairStructureFilter(s as AnyStructure, rcl) });
    const injuredCreeps = room.find(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
    const sourcePlans = buildSourcePlans(sources, structures);
    const mineralPlan = minerals[0] ? buildMineralPlan(minerals[0], structures) : null;
    return {
        room,
        structures,
        sources,
        mineral: minerals[0],
        creeps,
        droppedEnergy,
        droppedResources,
        tombstones,
        ruins,
        constructionSites,
        repairTargets,
        injuredCreeps,
        sourcePlans,
        mineralPlan
    };
}

export function initialiseRoomPlan(room: Room): void {
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

export function rememberPlans(context: RoomControllerContext): void {
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

export function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
    }
}

export function updatePlanAssignments(context: RoomControllerContext): void {
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

export function rememberLoad(context: RoomControllerContext): void {
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

export function roomNeedsCriticalEnergyRecovery(context: RoomControllerContext): boolean {
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

export function energyRecoveryReason(context: RoomControllerContext, active: boolean): EnergyRecoveryReason {
    if (!active) { return 'none'; }

    const spawnHeld = spawnEnergyRatio(context) < ENERGY_RECOVERY_EXIT_SPAWN_RATIO;
    const towerHeld = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    if (spawnHeld && towerHeld) { return 'spawn+tower'; }

    if (spawnHeld) { return 'spawn'; }

    if (towerHeld) { return 'tower'; }

    return 'hysteresis';
}

export function reportPassiveInfrastructure(context: RoomControllerContext): void {
    if (Game.time % 100 !== 0) { return; }

    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const labMinerals = context.structures.labs
                .map((lab) => lab.mineralType ? lab.mineralType + ':' + lab.store.getUsedCapacity(lab.mineralType) : 'empty')
                .join(',');
    console.log('room.controller: ' + context.room.name +
    ' RCL ' + (context.room.controller?.level ?? 0) +
    ' stored=' + storedEnergy(context) +
    ' terminalEnergy=' + terminalEnergy +
    ' labs=' + (labMinerals || 'none') +
    ' remotes=' + Object.keys(context.room.memory.plan?.remoteRooms ?? {}).length);
}

export function buildSourcePlans(sources: Source[], structures: RoomStructureCache): SourcePlan[] {
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

export function buildMineralPlan(mineral: Mineral, structures: RoomStructureCache): MineralPlan {
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

export function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }

    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }

    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }

    return 0;
}

export function roomHasEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0 || refillTowerTargets(context).length > 0;
}

export function roomHasSpawnEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0;
}

export function terminalWithdrawableEnergy(context: RoomControllerContext, reservations: JobReservations, allowReserveBreak: boolean): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }

    const reserved = reservations.resources[terminal.id] ?? 0;
    const available = terminal.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
    if (available <= 0) { return 0; }

    if (allowReserveBreak) { return available; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    return Math.max(0, available - reserveTarget);
}

export function terminalEnergyReserveDeficit(context: RoomControllerContext, reservations: JobReservations): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    if (reserveTarget <= 0) { return 0; }

    const incomingReserved = reservations.energySinks[terminal.id] ?? 0;
    const projectedEnergy = terminal.store.getUsedCapacity(RESOURCE_ENERGY) + incomingReserved;
    return Math.max(0, reserveTarget - projectedEnergy);
}
