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
        if (jobType !== 'heal') {
            opportunisticHealNearby(creep);
        }
        return true;
    }

    return false;
}

const MOVE_STUCK_REPATH_TICKS = 2;
const MOVE_STUCK_RESET_PATH_TICKS = 4;
const TRAFFIC_YIELD_TTL = 2;

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
        const stuckTicks = creep.memory.travelStuckTicks ?? 0;
        const stuckFallback = isPositionTarget && stuckTicks >= MOVE_STUCK_REPATH_TICKS;
        const effectiveTarget = stuckFallback ? source : station;
        const range = station instanceof StructureContainer ? 0 : (stuckFallback || !isPositionTarget ? 1 : 0);
        moveToJobTarget(creep, effectiveTarget, '#3d2a22', { range });
        return ERR_NOT_IN_RANGE;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 && creep.store.getCapacity(RESOURCE_ENERGY) > 0) {
        if (offloadEnergyNearby(creep)) { return OK; }
        return creep.drop(RESOURCE_ENERGY);
    }

    const code = creep.harvest(source);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, source, '#3d2a22');
    } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // harvest (work) + transfer (carry) are independent intent categories — both fire this tick
        offloadEnergyNearby(creep);
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
    if (!target || target.hits >= target.hitsMax) { return ERR_INVALID_TARGET; }

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
    const needsDynamicTraffic = stuckTicks >= MOVE_STUCK_REPATH_TICKS;
    const needsPathReset = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
        requestTrafficYieldForPath(creep, new RoomPosition(25, 25, roomName), 1);
    }

    if (stuckTicks >= 2) {
        const nudged = nudgeFromRoomEdge(creep);
        if (nudged) { return ERR_NOT_IN_RANGE; }
    }

    if (needsPathReset) {
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
    }

    const centerCode = creep.moveTo(new RoomPosition(25, 25, roomName), {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: needsPathReset ? 0 : 5,
        ignoreCreeps: true
    });
    if (centerCode !== ERR_NO_PATH) {
        return ERR_NOT_IN_RANGE;
    }

    const exitDir = Game.map.findExit(creep.room, roomName);
    if (typeof exitDir === 'number' && exitDir >= TOP && exitDir <= LEFT) {
        const closestExit = creep.pos.findClosestByRange(exitDir as ExitConstant);
        if (closestExit) {
            const exitCode = creep.moveTo(closestExit, {
                visualizePathStyle: { stroke: '#ffffff' },
                reusePath: needsPathReset ? 0 : 5,
                ignoreCreeps: true
            });
            if (exitCode !== ERR_NO_PATH) {
                return ERR_NOT_IN_RANGE;
            }
        }
    }

    if (stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS) {
        if (nudgeFromRoomEdge(creep)) { return ERR_NOT_IN_RANGE; }

        if (typeof exitDir === 'number' && exitDir >= TOP && exitDir <= LEFT) {
            const exitTiles = creep.room.find(exitDir as ExitConstant);
            if (exitTiles.length > 0) {
                const pfResult = PathFinder.search(
                    creep.pos,
                    exitTiles.map(p => ({ pos: p, range: 0 })),
                    { maxRooms: 1 }
                );
                if (pfResult.path.length > 0 && pfResult.path[0].getRangeTo(creep.pos) <= 1) {
                    creep.move(creep.pos.getDirectionTo(pfResult.path[0]));
                    return ERR_NOT_IN_RANGE;
                }
            }
        }

        if (typeof exitDir === 'number') {
            const allExits = Game.map.describeExits(creep.room.name);
            if (allExits) {
                for (const dirKey in allExits) {
                    const altDir = Number(dirKey) as ExitConstant;
                    if (altDir === exitDir) { continue; }
                    const altTiles = creep.room.find(altDir);
                    if (altTiles.length === 0) { continue; }
                    const pfResult = PathFinder.search(
                        creep.pos,
                        altTiles.map(p => ({ pos: p, range: 0 })),
                        { maxRooms: 1 }
                    );
                    if (pfResult.path.length > 0 && pfResult.path[0].getRangeTo(creep.pos) <= 1) {
                        creep.move(creep.pos.getDirectionTo(pfResult.path[0]));
                        return ERR_NOT_IN_RANGE;
                    }
                }
            }
        }

        if (Game.time % 25 === 0) {
            console.log('travelRoom: ' + creep.name + ' stuck ' + stuckTicks + 't at ' + creep.pos + ' room=' + creep.room.name + ' job=' + roomName);
        }

        wanderRandomAdjacent(creep);
    }

    return ERR_NOT_IN_RANGE;
}

function idle(creep: Creep): number {
    const assigned = getTarget<RoomObject>(creep);
    const target = assigned ?? creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0];
    if (target && creep.pos.getRangeTo(target) > 3) {
        moveToJobTarget(creep, target, '#777777');
    }
    return OK;
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

    if (jobType === 'reserveController' || jobType === 'claimController' || jobType === 'travelRoom') {
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

function nudgeFromRoomEdge(creep: Creep): boolean {
    if (creep.pos.x === 0 && creep.pos.y === 0) {
        creep.move(BOTTOM_RIGHT);
        return true;
    }
    if (creep.pos.x === 0 && creep.pos.y === 49) {
        creep.move(TOP_RIGHT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 0) {
        creep.move(BOTTOM_LEFT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 49) {
        creep.move(TOP_LEFT);
        return true;
    }

    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return true;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return true;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return true;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
        return true;
    }

    return false;
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
    if (creep.memory.archetype === 'remoteHauler' && target.structureType === STRUCTURE_CONTAINER) {
        const access = containerAccessPosition(creep, target as StructureContainer);
        if (access) {
            return moveToJobTarget(creep, access, stroke, { range: 0 });
        }
    }

    return moveToJobTarget(creep, target, stroke);
}

function containerAccessPosition(creep: Creep, container: StructureContainer): RoomPosition | null {
    const room = Game.rooms[container.pos.roomName];
    if (!room) { return null; }

    const terrain = room.getTerrain();
    const candidates: RoomPosition[] = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = container.pos.x + dx;
            const y = container.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
            const pos = new RoomPosition(x, y, container.pos.roomName);
            if (pos.lookFor(LOOK_SOURCES).length > 0) { continue; }
            if (pos.lookFor(LOOK_MINERALS).length > 0) { continue; }
            if (pos.lookFor(LOOK_CREEPS).some(other => other.id !== creep.id)) { continue; }
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            candidates.push(pos);
        }
    }

    if (candidates.length === 0) { return null; }
    const byPath = creep.pos.findClosestByPath(candidates, { ignoreCreeps: false }) as RoomPosition | null;
    return byPath ?? closestPositionByRange(creep.pos, candidates);
}

function closestPositionByRange(origin: RoomPosition, positions: RoomPosition[]): RoomPosition | null {
    if (positions.length === 0) { return null; }

    let best = positions[0];
    let bestRange = origin.getRangeTo(best);
    for (const pos of positions) {
        const range = origin.getRangeTo(pos);
        if (range < bestRange) {
            best = pos;
            bestRange = range;
        }
    }
    return best;
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
    const needsPathReset = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const targetRange = extra.range ?? 1;

    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
        requestTrafficYieldForPath(creep, targetPos, targetRange);
    }

    const moveOpts: MoveToOpts = {
        ...extra,
        reusePath: needsPathReset ? 0 : (extra.reusePath ?? 10),
        ignoreCreeps: needsDynamicTraffic ? true : (extra.ignoreCreeps ?? false),
        visualizePathStyle: {
            ...(extra.visualizePathStyle ?? {}),
            stroke
        }
    };

    if (needsPathReset) {
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
    }

    const code = creep.moveTo(target, {
        ...moveOpts
    });
    if (code === ERR_NO_PATH || (needsPathReset && creep.fatigue === 0)) {
        if (!nudgeFromRoomEdge(creep) && needsPathReset) {
            if (targetPos && creep.room.name === targetPos.roomName) {
                const pfResult = PathFinder.search(creep.pos, { pos: targetPos, range: 1 }, { maxRooms: 1 });
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
