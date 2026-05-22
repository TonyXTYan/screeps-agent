import { wallRampartRepairCap } from '../creeps/roles/doctor';
import { nudgeFromRoomEdge, mirrorExitPositionIntoRoom } from '../utils/path';
import { mostCriticalCreep, firstStoredResource } from '../utils/creep';

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
        return true;
    }

    return false;
}

const MOVE_STUCK_REPATH_TICKS = 2;
const MOVE_STUCK_RESET_PATH_TICKS = 4;
const MOVE_STUCK_FORCED_STEP_TICKS = 6;
const MOVE_STUCK_ESCAPE_TICKS = 12;
const TRAFFIC_YIELD_TTL = 2;
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
    const adjacentTarget = mostCriticalCreep(creep, adjacent);
    if (adjacentTarget) {
        creep.heal(adjacentTarget);
        return;
    }

    const ranged = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
        filter: c => c.hits < c.hitsMax
    });
    const rangedTarget = mostCriticalCreep(creep, ranged);
    if (rangedTarget) {
        creep.rangedHeal(rangedTarget);
    }
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

function wanderRandomAdjacent(creep: Creep): boolean {
    const dirs: DirectionConstant[] = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    const dxs: number[] = [0, 1, 1, 1, 0, -1, -1, -1];
    const dys: number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
    const seed = (creep.name.charCodeAt(creep.name.length - 1) || 0) + Game.time;
    for (let i = 0; i < 8; i++) {
        const dir = dirs[(seed + i) % 8];
        const nx = creep.pos.x + dxs[(seed + i) % 8];
        const ny = creep.pos.y + dys[(seed + i) % 8];
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) { continue; }
        const room = Game.rooms[creep.room.name];
        if (room && room.getTerrain().get(nx, ny) === TERRAIN_MASK_WALL) { continue; }
        creep.move(dir);
        return true;
    }
    return false;
}

function mineralDepleted(creep: Creep): boolean {
    const id = creep.memory.jobTargetId;
    if (!id) { return true; }
    const mineral = Game.getObjectById(id as Id<Mineral>);
    return !mineral || mineral.mineralAmount === 0;
}

function clearTravelStuckMemory(creep: Creep): void {
    creep.memory.travelLastX = undefined;
    creep.memory.travelLastY = undefined;
    creep.memory.travelLastRoom = undefined;
    creep.memory.travelStuckTicks = undefined;
}

function updateTravelStuckMemory(creep: Creep): void {
    const sameTile = creep.memory.travelLastX === creep.pos.x &&
        creep.memory.travelLastY === creep.pos.y &&
        creep.memory.travelLastRoom === creep.room.name;
    if (sameTile) {
        creep.memory.travelStuckTicks = (creep.memory.travelStuckTicks ?? 0) + 1;
    } else {
        clearTravelStuckMemory(creep);
    }
    creep.memory.travelLastX = creep.pos.x;
    creep.memory.travelLastY = creep.pos.y;
    creep.memory.travelLastRoom = creep.room.name;
}

function isOnRequestedExitEdge(creep: Creep, exitDir: number): boolean {
    if (typeof exitDir !== 'number' || exitDir < TOP || exitDir > LEFT) { return false; }
    if (exitDir === TOP) { return creep.pos.y === 0; }
    if (exitDir === RIGHT) { return creep.pos.x === 49; }
    if (exitDir === BOTTOM) { return creep.pos.y === 49; }
    return creep.pos.x === 0;
}

function sidestepAlongExitEdge(creep: Creep, exitDir: ExitConstant): boolean {
    const candidates = exitDir === LEFT || exitDir === RIGHT
        ? [TOP, BOTTOM]
        : [LEFT, RIGHT];
    const order = ((Game.time + creep.name.length) % 2 === 0)
        ? candidates
        : [candidates[1], candidates[0]];

    for (const dir of order) {
        if (!canStep(creep, dir)) { continue; }
        const code = creep.move(dir);
        if (code === OK) { return true; }
    }
    return false;
}

function canStep(creep: Creep, dir: DirectionConstant): boolean {
    const [dx, dy] = directionDelta(dir);
    const nx = creep.pos.x + dx;
    const ny = creep.pos.y + dy;
    if (nx < 0 || nx > 49 || ny < 0 || ny > 49) { return false; }

    const room = Game.rooms[creep.room.name];
    if (!room) { return false; }
    if (room.getTerrain().get(nx, ny) === TERRAIN_MASK_WALL) { return false; }

    const target = new RoomPosition(nx, ny, creep.room.name);
    if (target.lookFor(LOOK_CREEPS).some((other) => other.id !== creep.id)) { return false; }
    const blocked = target.lookFor(LOOK_STRUCTURES).some((structure) =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_CONTAINER &&
        structure.structureType !== STRUCTURE_RAMPART);
    return !blocked;
}

function directionDelta(dir: DirectionConstant): [number, number] {
    if (dir === TOP) { return [0, -1]; }
    if (dir === TOP_RIGHT) { return [1, -1]; }
    if (dir === RIGHT) { return [1, 0]; }
    if (dir === BOTTOM_RIGHT) { return [1, 1]; }
    if (dir === BOTTOM) { return [0, 1]; }
    if (dir === BOTTOM_LEFT) { return [-1, 1]; }
    if (dir === LEFT) { return [-1, 0]; }
    return [-1, -1];
}

function nearestExitTileToRoom(creep: Creep, roomName: string): RoomPosition | null {
    const exitDir = Game.map.findExit(creep.room, roomName);
    if (typeof exitDir !== 'number' || exitDir < TOP || exitDir > LEFT) { return null; }

    const stationExit = exitTileClosestToRemoteStation(creep, roomName, exitDir as ExitConstant);
    if (stationExit) { return stationExit; }

    const byPath = creep.pos.findClosestByPath(exitDir as ExitConstant, {
        ignoreCreeps: false
    }) as RoomPosition | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByRange(exitDir as ExitConstant) as RoomPosition | null;
}

function exitTileClosestToRemoteStation(
    creep: Creep,
    roomName: string,
    exitDir: ExitConstant
): RoomPosition | null {
    if (creep.memory.remoteRoom !== roomName) { return null; }
    const stationX = creep.memory.stationX;
    const stationY = creep.memory.stationY;
    if (stationX == null || stationY == null) { return null; }

    const exits = creep.room.find(exitDir) as RoomPosition[];
    if (exits.length === 0) { return null; }

    const station = new RoomPosition(stationX, stationY, roomName);
    let best: RoomPosition | null = null;
    let bestScore = Infinity;
    for (const exit of exits) {
        const entry = mirrorExitPositionIntoRoom(exit, roomName);
        if (!entry) { continue; }
        const score = creep.pos.getRangeTo(exit) + entry.getRangeTo(station);
        if (score < bestScore) {
            bestScore = score;
            best = exit;
        }
    }
    return best;
}

function forceStepTowardsRoomExit(
    creep: Creep,
    targetRoomName: string,
    preferredExit: RoomPosition
): number {
    const primaryDir = Game.map.findExit(creep.room, targetRoomName);
    const allGoals: Array<{ pos: RoomPosition; range: number }> = [];

    if (typeof primaryDir === 'number' && primaryDir >= TOP && primaryDir <= LEFT) {
        const primaryTiles = creep.room.find(primaryDir as ExitConstant);
        for (const tile of primaryTiles) {
            allGoals.push({ pos: tile, range: 0 });
        }
    }

    if (allGoals.length === 0) {
        allGoals.push({ pos: preferredExit, range: 0 });
    }

    const direct = PathFinder.search(creep.pos, allGoals, { maxRooms: 1 });
    if (direct.path.length > 0 && direct.path[0].getRangeTo(creep.pos) <= 1) {
        return creep.move(creep.pos.getDirectionTo(direct.path[0]));
    }

    const exits = Game.map.describeExits(creep.room.name);
    if (!exits) { return ERR_NO_PATH; }
    for (const dirKey in exits) {
        const altDir = Number(dirKey) as ExitConstant;
        const tiles = creep.room.find(altDir);
        if (tiles.length === 0) { continue; }
        const alt = PathFinder.search(
            creep.pos,
            tiles.map(tile => ({ pos: tile, range: 0 })),
            { maxRooms: 1 }
        );
        if (alt.path.length > 0 && alt.path[0].getRangeTo(creep.pos) <= 1) {
            return creep.move(creep.pos.getDirectionTo(alt.path[0]));
        }
    }

    return ERR_NO_PATH;
}

function honorTrafficYieldRequest(creep: Creep): boolean {
    const until = creep.memory.trafficYieldUntil;
    const roomName = creep.memory.trafficYieldRoom;
    const x = creep.memory.trafficYieldX;
    const y = creep.memory.trafficYieldY;
    if (until == null || roomName == null || x == null || y == null) {
        clearTrafficYieldRequest(creep);
        return false;
    }
    if (until < Game.time) {
        clearTrafficYieldRequest(creep);
        return false;
    }
    if (creep.room.name !== roomName || creep.fatigue > 0) { return false; }

    const target = new RoomPosition(x, y, roomName);
    if (creep.pos.isEqualTo(target)) {
        clearTrafficYieldRequest(creep);
        return false;
    }

    const code = creep.moveTo(target, {
        range: 0,
        reusePath: 0,
        ignoreCreeps: false
    });
    if (code !== ERR_NO_PATH) { return true; }

    clearTrafficYieldRequest(creep);
    return false;
}

function clearTrafficYieldRequest(creep: Creep): void {
    creep.memory.trafficYieldX = undefined;
    creep.memory.trafficYieldY = undefined;
    creep.memory.trafficYieldRoom = undefined;
    creep.memory.trafficYieldUntil = undefined;
}

function requestTrafficYieldForPath(creep: Creep, targetPos: RoomPosition, targetRange: number): boolean {
    if (creep.fatigue > 0) { return false; }
    if (creep.room.name !== targetPos.roomName) { return false; }

    const nextStep = nextStepTowards(creep, targetPos, targetRange);
    if (!nextStep || nextStep.getRangeTo(creep.pos) > 1) { return false; }

    const blockers = nextStep.lookFor(LOOK_CREEPS).filter((other) => other.my && other.id !== creep.id);
    let yielded = false;
    for (const blocker of blockers) {
        if (!shouldYieldForTraffic(blocker, creep)) { continue; }
        if (!assignYieldPosition(blocker, creep, targetPos)) { continue; }
        yielded = true;
    }
    return yielded;
}

function nextStepTowards(creep: Creep, targetPos: RoomPosition, targetRange: number): RoomPosition | null {
    if (creep.room.name === targetPos.roomName) {
        const localPath = creep.pos.findPathTo(targetPos, {
            range: Math.max(0, targetRange),
            ignoreCreeps: false,
            maxRooms: 1,
            maxOps: 2000
        });
        if (localPath.length > 0) {
            return new RoomPosition(localPath[0].x, localPath[0].y, creep.room.name);
        }
    }

    const route = PathFinder.search(creep.pos, { pos: targetPos, range: Math.max(0, targetRange) }, {
        maxRooms: 1
    });
    if (route.path.length === 0) { return null; }
    return route.path[0];
}

function shouldYieldForTraffic(blocker: Creep, requester: Creep): boolean {
    if (!blocker.my || blocker.spawning) { return false; }
    if (blocker.fatigue > 0 || blocker.getActiveBodyparts(MOVE) <= 0) { return false; }
    if (isStationaryMinerOnContainer(blocker)) { return false; }
    return trafficPriority(blocker) <= trafficPriority(requester);
}

function isStationaryMinerOnContainer(creep: Creep): boolean {
    if (!creep.memory.staticMining) { return false; }
    const archetype = creep.memory.archetype;
    if (archetype !== 'miner' && archetype !== 'remoteMiner') { return false; }
    const stationId = creep.memory.stationaryTargetId;
    if (!stationId) { return false; }
    const station = Game.getObjectById(stationId as Id<any>);
    if (!(station instanceof StructureContainer)) { return false; }
    return creep.pos.isEqualTo(station.pos);
}

function trafficPriority(creep: Creep): number {
    const archetype = creep.memory.archetype;
    const job = creep.memory.jobType;
    if (archetype === 'defender' || job === 'heal') { return 100; }
    if (archetype === 'remoteHauler' || archetype === 'hauler') { return 80; }
    if (job === 'travelRoom') { return 60; }
    if (job === 'idle') { return 10; }
    return 40;
}

function assignYieldPosition(blocker: Creep, requester: Creep, requesterTarget: RoomPosition): boolean {
    const room = Game.rooms[blocker.room.name];
    if (!room) { return false; }
    const terrain = room.getTerrain();

    let best: RoomPosition | null = null;
    let bestScore = -Infinity;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = blocker.pos.x + dx;
            const y = blocker.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const candidate = new RoomPosition(x, y, blocker.room.name);
            if (candidate.isEqualTo(requester.pos)) { continue; }
            if (candidate.lookFor(LOOK_CREEPS).some((other) => other.id !== blocker.id && other.id !== requester.id)) { continue; }
            const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }

            const score = candidate.getRangeTo(requesterTarget) - candidate.getRangeTo(requester.pos) * 0.5;
            if (!best || score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
    }

    if (!best) { return false; }
    blocker.memory.trafficYieldX = best.x;
    blocker.memory.trafficYieldY = best.y;
    blocker.memory.trafficYieldRoom = best.roomName;
    blocker.memory.trafficYieldUntil = Game.time + TRAFFIC_YIELD_TTL;
    return true;
}

function moveToWithdrawTarget(
    creep: Creep,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink,
    stroke: string
): number {
    return moveToJobTarget(creep, target, stroke);
}

function moveToJobTarget(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    stroke: string,
    extra: MoveToOpts = {}
): number {
    updateTravelStuckMemory(creep);
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const needsDynamicTraffic = stuckTicks >= MOVE_STUCK_REPATH_TICKS;
    const needsCreepBypass = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const needsPathReset = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const targetRange = extra.range ?? 1;

    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
        requestTrafficYieldForPath(creep, targetPos, targetRange);
    }

    const moveOpts: MoveToOpts = {
        ...extra,
        reusePath: needsPathReset ? 0 : (extra.reusePath ?? 10),
        ignoreCreeps: needsCreepBypass ? true : (extra.ignoreCreeps ?? false),
        visualizePathStyle: {
            ...(extra.visualizePathStyle ?? {}),
            stroke
        }
    };

    if (needsPathReset || extra.reusePath === 0) {
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
    }

    const code = creep.moveTo(target, {
        ...moveOpts
    });
    if (code === ERR_NO_PATH || (needsPathReset && creep.fatigue === 0)) {
        if (!nudgeFromRoomEdge(creep) && needsPathReset) {
            if (targetPos && creep.room.name === targetPos.roomName) {
                const pfResult = PathFinder.search(creep.pos, { pos: targetPos, range: targetRange }, { maxRooms: 1 });
                if (pfResult.path.length > 0 && pfResult.path[0].getRangeTo(creep.pos) <= 1) {
                    creep.move(creep.pos.getDirectionTo(pfResult.path[0]));
                    return OK;
                }
            }
            if (Game.time % 25 === 0) {
                console.log('moveToJobTarget: ' + creep.name + ' stuck ' + stuckTicks + 't at ' + creep.pos + ' room=' + creep.room.name);
            }
            wanderRandomAdjacent(creep);
        }
    }
    return code;
}
