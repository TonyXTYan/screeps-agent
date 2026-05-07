export function run(creep: Creep): boolean {
    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    let result: number | undefined;

    if (jobType === 'harvestSource') { result = harvestSource(creep); }
    else if (jobType === 'withdrawEnergy') { result = withdrawEnergy(creep); }
    else if (jobType === 'pickupEnergy') { result = pickupEnergy(creep); }
    else if (jobType === 'depositEnergy') { result = depositEnergy(creep); }
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
        if (shouldClearJob(result)) {
            clearJob(creep);
        }
        return true;
    }

    return false;
}

export function clearJob(creep: Creep): void {
    creep.memory.jobType = undefined;
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = undefined;
    creep.memory.jobAssignedAt = undefined;
}

function harvestSource(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 && creep.store.getCapacity(RESOURCE_ENERGY) > 0) {
        if (offloadEnergyNearby(creep)) { return OK; }
        return creep.drop(RESOURCE_ENERGY);
    }

    const source = getTarget<Source>(creep);
    if (!source) { return ERR_INVALID_TARGET; }

    const code = creep.harvest(source);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: '#3d2a22' } });
    }
    return code;
}

function withdrawEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<StructureContainer | StructureStorage | StructureTerminal | StructureLink>(creep);
    if (!target || target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.withdraw(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#875641' } });
    }
    return code;
}

function pickupEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<Resource<RESOURCE_ENERGY>>(creep);
    if (!target || target.amount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.pickup(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#875641' } });
    }
    return code;
}

function depositEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    return transferEnergy(creep);
}

function transferEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<EnergyStructure>(creep);
    if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return ERR_FULL; }

    const code = creep.transfer(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return code;
}

function build(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<ConstructionSite>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const code = creep.build(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffb752' } });
    }
    return code;
}

function repair(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<AnyStructure>(creep);
    if (!target || target.hits >= target.hitsMax) { return ERR_INVALID_TARGET; }

    const code = creep.repair(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#b0f566' } });
    }
    return code;
}

function upgrade(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.upgradeController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller, { visualizePathStyle: { stroke: '#d9d9d9' } });
    }
    return code;
}

function heal(creep: Creep): number {
    const target = getTarget<Creep>(creep);
    if (!target || target.hits >= target.hitsMax) { return ERR_INVALID_TARGET; }

    const code = creep.heal(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#65fd62' } });
    }
    return code;
}

function mineMineral(creep: Creep): number {
    if (creep.store.getFreeCapacity() === 0 && creep.store.getCapacity() > 0) {
        return ERR_FULL;
    }

    const mineral = getTarget<Mineral>(creep);
    if (!mineral || mineral.mineralAmount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.harvest(mineral);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(mineral, { visualizePathStyle: { stroke: '#41a7a7' } });
    }
    return code;
}

function depositMineral(creep: Creep): number {
    const target = getTarget<StructureStorage | StructureTerminal>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    for (const resourceName in creep.store) {
        const resource = resourceName as ResourceConstant;
        if (creep.store.getUsedCapacity(resource) > 0) {
            const code = creep.transfer(target, resource);
            if (code === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#41a7a7' } });
            }
            return code;
        }
    }

    return ERR_NOT_ENOUGH_RESOURCES;
}

function reserveController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.reserveController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return code;
}

function claimController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.claimController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return code;
}

function travelRoom(creep: Creep): number {
    const roomName = creep.memory.jobRoomName;
    if (!roomName) { return ERR_INVALID_TARGET; }
    if (creep.room.name === roomName) { return OK; }

    creep.moveTo(new RoomPosition(25, 25, roomName), { visualizePathStyle: { stroke: '#ffffff' } });
    return ERR_NOT_IN_RANGE;
}

function idle(creep: Creep): number {
    const target = creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0];
    if (target && creep.pos.getRangeTo(target) > 3) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#777777' } });
    }
    return OK;
}

function offloadEnergyNearby(creep: Creep): boolean {
    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
             structure.structureType === STRUCTURE_LINK ||
             structure.structureType === STRUCTURE_STORAGE) &&
            (structure as EnergyStructure).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as EnergyStructure[];

    if (targets.length === 0) { return false; }
    return creep.transfer(targets[0], RESOURCE_ENERGY) === OK;
}

function shouldClearJob(result: number): boolean {
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
