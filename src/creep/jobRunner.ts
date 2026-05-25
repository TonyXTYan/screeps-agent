import { wallRampartRepairCap } from '../role/doctor';
import { honorTrafficYieldRequest, requestTrafficYieldForPath } from './traffic';
import {
    moveToJobTarget, moveToWithdrawTarget, forceStepTowardsRoomExit,
    clearTravelStuckMemory, updateTravelStuckMemory, nearestExitTileToRoom,
    nudgeFromRoomEdge, wanderRandomAdjacent, isOnRequestedExitEdge, sidestepAlongExitEdge,
} from './movement';

export function run(creep: Creep): boolean {
    if (honorTrafficYieldRequest(creep)) {
        creep.memory.lastJobResult = OK;
        return true;
    }

    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    let result: number | undefined;

    if (jobType === 'harvestSource') { result = harvestSource(creep); }
    else if (jobType === 'withdrawEnergy') { result = withdrawEnergy(creep); }
    else if (jobType === 'withdrawResource') { result = withdrawResource(creep); }
    else if (jobType === 'pickupEnergy') { result = pickupEnergy(creep); }
    else if (jobType === 'pickupResource') { result = pickupResource(creep); }
    else if (jobType === 'depositEnergy') { result = depositEnergy(creep); }
    else if (jobType === 'depositResource') { result = depositResource(creep); }
    else if (jobType === 'refillSpawn') { result = transferEnergy(creep); }
    else if (jobType === 'refillTower') { result = transferEnergy(creep); }
    else if (jobType === 'build') { result = build(creep); }
    else if (jobType === 'repair') { result = repair(creep); }
    else if (jobType === 'upgrade') { result = upgrade(creep); }
    else if (jobType === 'heal') { result = heal(creep); }
    else if (jobType === 'mineMineral') { result = mineMineral(creep); }
    else if (jobType === 'depositMineral') { result = depositMineral(creep); }
    else if (jobType === 'reserveController') { result = reserveController(creep); }
    else if (jobType === 'claimController') { result = claimController(creep); }
    else if (jobType === 'travelRoom') { result = travelRoom(creep); }
    else if (jobType === 'idle') { result = idle(creep); }

    if (result !== undefined) {
        creep.memory.lastJobResult = result;
        if (shouldClearJob(creep, jobType, result)) {
            clearJob(creep);
        }
        if (jobType !== 'build' && jobType !== 'repair') {
            opportunisticRemoteHaulerWork(creep, jobType);
        }
        if (jobType !== 'heal') {
            opportunisticHealNearby(creep);
        }
        opportunisticMaintainerRepair(creep, jobType, result);
        return true;
    }

    return false;
}

const MOVE_STUCK_REPATH_TICKS = 2;
const MOVE_STUCK_RESET_PATH_TICKS = 4;
const MOVE_STUCK_FORCED_STEP_TICKS = 6;
const MOVE_STUCK_ESCAPE_TICKS = 12;
const REMOTE_MINER_AGGRESSIVE_REPATH_TICKS = 6;
const REMOTE_MINER_SOURCE_FALLBACK_TICKS = 14;
const REMOTE_CONTAINER_REPAIR_INTERVAL = 5;
const REMOTE_CONTAINER_REPAIR_THRESHOLD = 0.5;

export function clearJob(creep: Creep): void {
    creep.memory.jobType = undefined;
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = undefined;
    creep.memory.jobAssignedAt = undefined;
    creep.memory.jobResourceType = undefined;
}

function harvestSource(creep: Creep): number {
    const source = getTarget<Source>(creep);
    if (!source) { return ERR_INVALID_TARGET; }

    const station = stationaryTarget(creep);
    if (station && !atStation(creep, station)) {
        const isPositionTarget = station instanceof RoomPosition;
        const range = station instanceof StructureContainer || isPositionTarget ? 0 : 1;
        const moveOptions: MoveToOpts = { range };
        const noProgressTicks = creep.memory.remoteStationNoProgressTicks ?? 0;
        const oscillationTicks = creep.memory.remoteStationOscillationTicks ?? 0;
        const aggressiveRepath = creep.memory.archetype === 'remoteMiner' &&
            (noProgressTicks >= REMOTE_MINER_AGGRESSIVE_REPATH_TICKS || oscillationTicks > 0);

        if (isPositionTarget) {
            moveOptions.maxRooms = 1;
            moveOptions.reusePath = 0;
        } else if (aggressiveRepath) {
            moveOptions.maxRooms = 1;
        }
        if (aggressiveRepath) {
            moveOptions.reusePath = 0;
            moveOptions.ignoreCreeps = true;
        }
        if (creep.memory.archetype === 'remoteMiner' &&
            noProgressTicks >= REMOTE_MINER_SOURCE_FALLBACK_TICKS &&
            creep.room.name === source.pos.roomName) {
            moveToJobTarget(creep, source, '#3d2a22', {
                range: 1,
                maxRooms: 1,
                reusePath: 0,
                ignoreCreeps: true
            });
            return ERR_NOT_IN_RANGE;
        }
        moveToJobTarget(creep, station, '#3d2a22', moveOptions);
        return ERR_NOT_IN_RANGE;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 && creep.store.getCapacity(RESOURCE_ENERGY) > 0) {
        if (offloadEnergyNearby(creep)) { return OK; }
        return creep.drop(RESOURCE_ENERGY);
    }

    // Remote miners repair their mining container when it drops below threshold.
    // Repair (WORK) is mutually exclusive with harvest (WORK), so we skip harvest on repair ticks.
    // We also don't offload this tick to avoid competing with repair for carry energy.
    if (creep.memory.archetype === 'remoteMiner' &&
        Game.time % REMOTE_CONTAINER_REPAIR_INTERVAL === 0 &&
        station instanceof StructureContainer &&
        station.hits < station.hitsMax * REMOTE_CONTAINER_REPAIR_THRESHOLD &&
        creep.store.getUsedCapacity(RESOURCE_ENERGY) >= creep.getActiveBodyparts(WORK)) {
        creep.repair(station);
        return OK;
    }

    const code = creep.harvest(source);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, source, '#3d2a22');
    } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // harvest (work) + transfer (carry) are independent intent categories — both fire this tick
        offloadEnergyNearby(creep);
    } else {
        // carry is empty — relay container backlog into an adjacent link (parallel with harvest)
        relayAdjacentContainerToLink(creep);
    }
    return code;
}

function withdrawEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<StructureContainer | StructureStorage | StructureTerminal | StructureLink>(creep);
    if (!target || target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.withdraw(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        moveToWithdrawTarget(creep, target, '#875641');
    }
    return code;
}

function withdrawResource(creep: Creep): number {
    if (creep.store.getFreeCapacity() === 0) { return OK; }
    const target = getTarget<WithdrawStructure>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const resource = creep.memory.jobResourceType ?? firstStoredResource(target.store);
    if (!resource || target.store.getUsedCapacity(resource) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.withdraw(target, resource);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#875641');
    }
    return code;
}

function pickupEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<Resource<RESOURCE_ENERGY>>(creep);
    if (!target || target.amount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.pickup(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#875641');
    }
    return code;
}

function pickupResource(creep: Creep): number {
    if (creep.store.getFreeCapacity() === 0) { return OK; }
    const target = getTarget<Resource<ResourceConstant>>(creep);
    if (!target || target.amount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.pickup(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#875641');
    }
    return code;
}

function depositEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    return transferEnergy(creep);
}

function depositResource(creep: Creep): number {
    const target = getTarget<StructureStorage | StructureTerminal | StructureContainer>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const resource = creep.memory.jobResourceType ?? firstStoredResource(creep.store);
    if (!resource || creep.store.getUsedCapacity(resource) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    if (target.store.getFreeCapacity(resource) === 0) { return ERR_FULL; }

    const code = creep.transfer(target, resource);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#41a7a7');
    }
    return code;
}

function transferEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<EnergyStructure>(creep);
    if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return ERR_FULL; }

    const code = creep.transfer(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#ffffff');
    }
    return code;
}

function build(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<ConstructionSite>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const code = creep.build(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#ffb752');
    }
    return code;
}

function repair(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<AnyStructure>(creep);
    if (!target) { return ERR_INVALID_TARGET; }
    const rcl = creep.room.controller?.level ?? 0;
    const isDefense = target.structureType === STRUCTURE_WALL || target.structureType === STRUCTURE_RAMPART;
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(rcl), target.hitsMax) : target.hitsMax;
    if (target.hits >= maxHits) { return ERR_INVALID_TARGET; }

    const code = creep.repair(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#b0f566');
    }
    return code;
}

function upgrade(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.upgradeController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#d9d9d9');
    }
    return code;
}

function heal(creep: Creep): number {
    const target = getTarget<Creep>(creep);
    if (!target || target.hits >= target.hitsMax) { return ERR_INVALID_TARGET; }

    const code = creep.heal(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.rangedHeal(target);
        moveToJobTarget(creep, target, '#65fd62');
    }
    return code;
}

function mineMineral(creep: Creep): number {
    const mineral = getTarget<Mineral>(creep);
    if (!mineral || mineral.mineralAmount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const station = stationaryTarget(creep);
    if (station && !atStation(creep, station)) {
        const isPositionTarget = station instanceof RoomPosition;
        const isContainerTarget = station instanceof StructureContainer;
        moveToJobTarget(creep, station, '#41a7a7', { range: (isPositionTarget || isContainerTarget) ? 0 : 1 });
        return ERR_NOT_IN_RANGE;
    }

    if (creep.store.getFreeCapacity() === 0 && creep.store.getCapacity() > 0) {
        if (offloadResourceNearby(creep)) { return OK; }
        return ERR_FULL;
    }

    const code = creep.harvest(mineral);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, mineral, '#41a7a7');
    } else if (creep.store.getUsedCapacity() > 0) {
        offloadResourceNearby(creep);
    }
    return code;
}

function depositMineral(creep: Creep): number {
    const target = getTarget<StructureStorage | StructureTerminal>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const resource = firstStoredResource(creep.store);
    if (resource) {
        const code = creep.transfer(target, resource);
        if (code === ERR_NOT_IN_RANGE) {
            moveToJobTarget(creep, target, '#41a7a7');
        }
        return code;
    }

    return ERR_NOT_ENOUGH_RESOURCES;
}

function reserveController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.reserveController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#ffffff');
    }
    return code;
}

function claimController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.claimController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#ffffff');
    }
    return code;
}

function travelRoom(creep: Creep): number {
    const roomName = creep.memory.jobRoomName;
    if (!roomName) { return ERR_INVALID_TARGET; }
    if (creep.room.name === roomName) {
        clearTravelStuckMemory(creep);
        return OK;
    }

    updateTravelStuckMemory(creep);
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const exitDir = Game.map.findExit(creep.room, roomName);
    const exitTarget = nearestExitTileToRoom(creep, roomName);
    if (!exitTarget) { return ERR_NO_PATH; }

    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
        requestTrafficYieldForPath(creep, exitTarget, 0);
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
    }

    if (stuckTicks >= 2 && (creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49)) {
        if (isOnRequestedExitEdge(creep, exitDir) && creep.fatigue === 0) {
            if (sidestepAlongExitEdge(creep, exitDir as ExitConstant)) {
                return ERR_NOT_IN_RANGE;
            }
        }
        const nudged = nudgeFromRoomEdge(creep);
        if (nudged) { return ERR_NOT_IN_RANGE; }
    }

    const moveCode = creep.moveTo(exitTarget, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: stuckTicks >= MOVE_STUCK_REPATH_TICKS ? 0 : 8,
        ignoreCreeps: stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS,
        maxRooms: 1,
        range: 0
    });
    if (moveCode === OK) {
        if (typeof exitDir === 'number' && exitDir >= TOP && exitDir <= LEFT) {
            const onRequestedEdge = isOnRequestedExitEdge(creep, exitDir);
            if (onRequestedEdge && creep.fatigue === 0) {
                const edgeMove = creep.move(exitDir as DirectionConstant);
                if (edgeMove === ERR_BUSY &&
                    sidestepAlongExitEdge(creep, exitDir as ExitConstant)) {
                    return ERR_NOT_IN_RANGE;
                }
            }
        }
        return ERR_NOT_IN_RANGE;
    }

    if (stuckTicks >= MOVE_STUCK_FORCED_STEP_TICKS && creep.fatigue === 0) {
        const forcedStepCode = forceStepTowardsRoomExit(creep, roomName, exitTarget);
        if (forcedStepCode === OK) {
            return ERR_NOT_IN_RANGE;
        }
        if (forcedStepCode !== ERR_NO_PATH) {
            return forcedStepCode;
        }
    }

    if (stuckTicks >= MOVE_STUCK_ESCAPE_TICKS) {
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
        if (nudgeFromRoomEdge(creep)) { return ERR_NOT_IN_RANGE; }
        wanderRandomAdjacent(creep);
        return ERR_NOT_IN_RANGE;
    }

    if (stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS && Game.time % 25 === 0) {
        console.log('travelRoom: ' + creep.name + ' stuck ' + stuckTicks + 't at ' + creep.pos + ' room=' + creep.room.name + ' job=' + roomName + ' move=' + moveCode);
    }

    return moveCode;
}

function idle(creep: Creep): number {
    const assigned = getTarget<RoomObject>(creep);
    const target = assigned ?? creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0];
    if (target && creep.pos.getRangeTo(target) > 3) {
        moveToJobTarget(creep, target, '#777777');
    }
    return OK;
}

function opportunisticRemoteHaulerWork(creep: Creep, jobType: CreepJobType): void {
    if (creep.memory.archetype !== 'remoteHauler') { return; }
    if (creep.getActiveBodyparts(WORK) <= 0) { return; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return; }
    if (jobType === 'harvestSource' || jobType === 'mineMineral' || jobType === 'upgrade') { return; }
    // Don't build/repair while stationary at an energy source — only opportunistic during transit.
    if (jobType === 'withdrawEnergy' || jobType === 'pickupEnergy') { return; }

    const site = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)[0];
    if (site) {
        creep.build(site);
        return;
    }

    const rcl = creep.room.controller?.level ?? 0;
    const repairs = creep.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (structure) => {
            const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
            const cap = isDefense ? Math.min(wallRampartRepairCap(rcl), structure.hitsMax) : structure.hitsMax;
            return structure.hits < cap;
        }
    }) as AnyStructure[];
    if (repairs.length === 0) { return; }

    let best = repairs[0];
    const capFor = (s: AnyStructure) => {
        const isDefense = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
        return isDefense ? Math.min(wallRampartRepairCap(rcl), s.hitsMax) : s.hitsMax;
    };
    let bestRatio = best.hits / Math.max(1, capFor(best));
    let bestRange = creep.pos.getRangeTo(best);
    for (const candidate of repairs) {
        const ratio = candidate.hits / Math.max(1, capFor(candidate));
        const range = creep.pos.getRangeTo(candidate);
        if (ratio < bestRatio || (ratio === bestRatio && range < bestRange)) {
            best = candidate;
            bestRatio = ratio;
            bestRange = range;
        }
    }

    creep.repair(best);
}

function opportunisticHealNearby(creep: Creep): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return; }

    const adjacent = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: c => c.hits < c.hitsMax
    });
    const adjacentTarget = mostCriticalByRatio(creep, adjacent);
    if (adjacentTarget) {
        creep.heal(adjacentTarget);
        return;
    }

    const ranged = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
        filter: c => c.hits < c.hitsMax
    });
    const rangedTarget = mostCriticalByRatio(creep, ranged);
    if (rangedTarget) {
        creep.rangedHeal(rangedTarget);
    }
}

// Opportunistically repairs the most-degraded nearby road or container while the maintainer
// is in transit to another target. Fires whenever the build/repair action slot is free —
// i.e., the primary job this tick was not a successful build or repair.
function opportunisticMaintainerRepair(creep: Creep, jobType: CreepJobType, result: number): void {
    if (creep.memory.archetype !== 'remoteMaintainer') { return; }
    if (creep.getActiveBodyparts(WORK) <= 0) { return; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return; }
    // Skip if the build/repair action slot was already consumed this tick.
    if ((jobType === 'build' || jobType === 'repair') && result === OK) { return; }

    const repairs = creep.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (s: AnyStructure) => {
            if (s.structureType === STRUCTURE_CONTAINER) { return s.hits < s.hitsMax * 0.9; }
            if (s.structureType === STRUCTURE_ROAD) { return s.hits < s.hitsMax * 0.8; }
            return false;
        }
    }) as AnyStructure[];
    if (repairs.length === 0) { return; }

    // Pick the most degraded structure; use range as tie-breaker.
    let best = repairs[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestRange = creep.pos.getRangeTo(best);
    for (const candidate of repairs) {
        const ratio = candidate.hits / Math.max(1, candidate.hitsMax);
        const range = creep.pos.getRangeTo(candidate);
        if (ratio < bestRatio || (ratio === bestRatio && range < bestRange)) {
            best = candidate;
            bestRatio = ratio;
            bestRange = range;
        }
    }

    creep.repair(best);
}

function mostCriticalByRatio(creep: Creep, targets: Creep[]): Creep | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
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

function offloadEnergyNearby(creep: Creep): boolean {
    const links = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            structure.structureType === STRUCTURE_LINK &&
            (structure as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureLink[];
    if (links.length > 0) {
        return creep.transfer(links[0], RESOURCE_ENERGY) === OK;
    }

    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
             structure.structureType === STRUCTURE_STORAGE) &&
            (structure as EnergyStructure).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as EnergyStructure[];

    if (targets.length === 0) { return false; }
    return creep.transfer(targets[0], RESOURCE_ENERGY) === OK;
}

function relayAdjacentContainerToLink(creep: Creep): void {
    const links = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_LINK &&
            (s as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureLink[];
    if (links.length === 0) { return; }

    const containers = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER &&
            (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
    }) as StructureContainer[];
    if (containers.length === 0) { return; }

    creep.withdraw(containers[0], RESOURCE_ENERGY);
}

function offloadResourceNearby(creep: Creep): boolean {
    const resource = firstStoredResource(creep.store);
    if (!resource) { return false; }

    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
             structure.structureType === STRUCTURE_STORAGE ||
             structure.structureType === STRUCTURE_TERMINAL) &&
            (structure as StructureContainer | StructureStorage | StructureTerminal).store.getFreeCapacity(resource) > 0
    }) as Array<StructureContainer | StructureStorage | StructureTerminal>;

    if (targets.length === 0) { return false; }
    return creep.transfer(targets[0], resource) === OK;
}

function shouldClearJob(creep: Creep, jobType: CreepJobType, result: number): boolean {
    if (jobType === 'harvestSource') {
        return result === ERR_INVALID_TARGET;
    }

    if (jobType === 'mineMineral') {
        return result === ERR_INVALID_TARGET ||
            (result === ERR_NOT_ENOUGH_RESOURCES && mineralDepleted(creep));
    }

    if (jobType === 'build' || jobType === 'repair' || jobType === 'upgrade') {
        return result === ERR_INVALID_TARGET ||
            result === ERR_NOT_ENOUGH_RESOURCES ||
            result === ERR_FULL;
    }

    if (jobType === 'heal') {
        return result === ERR_INVALID_TARGET;
    }

    if (jobType === 'travelRoom') {
        const targetRoom = creep.memory.jobRoomName;
        return result === ERR_INVALID_TARGET ||
            (result === OK && !!targetRoom && creep.room.name === targetRoom);
    }

    if (jobType === 'reserveController' || jobType === 'claimController') {
        return result === OK || result === ERR_INVALID_TARGET;
    }

    return result === OK ||
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_FULL;
}

function getTarget<T extends RoomObject>(creep: Creep): T | null {
    const id = creep.memory.jobTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as T | null;
}

function stationaryTarget(creep: Creep): RoomPosition | RoomObject | null {
    const x = creep.memory.stationX;
    const y = creep.memory.stationY;
    if (x != null && y != null) {
        return new RoomPosition(x, y, creep.room.name);
    }
    const id = creep.memory.stationaryTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as RoomObject | null;
}

function atStation(creep: Creep, station: RoomPosition | RoomObject): boolean {
    if (station instanceof RoomPosition) {
        return creep.pos.isEqualTo(station);
    }
    if (station instanceof StructureContainer) {
        return creep.pos.isEqualTo(station.pos);
    }
    return creep.pos.isNearTo(station);
}
function firstStoredResource(store: StoreDefinition): ResourceConstant | null {
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (store.getUsedCapacity(resource) > 0) {
            return resource;
        }
    }
    return null;
}

function mineralDepleted(creep: Creep): boolean {
    const id = creep.memory.jobTargetId;
    if (!id) { return true; }
    const mineral = Game.getObjectById(id as Id<Mineral>);
    return !mineral || mineral.mineralAmount === 0;
}
