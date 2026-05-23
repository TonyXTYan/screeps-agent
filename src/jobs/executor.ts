import { wallRampartRepairCap } from '../creeps/roles/doctor';
import { firstStoredResource } from '../utils/creep';
import { offloadEnergyNearby, relayAdjacentContainerToLink, offloadResourceNearby } from './offload';
import { getTarget, stationaryTarget, atStation, moveToJobTarget, moveToWithdrawTarget } from './movement';

const REMOTE_MINER_AGGRESSIVE_REPATH_TICKS = 6;
const REMOTE_MINER_SOURCE_FALLBACK_TICKS = 14;
const REMOTE_CONTAINER_REPAIR_INTERVAL = 5;
const REMOTE_CONTAINER_REPAIR_THRESHOLD = 0.5;

export function harvestSource(creep: Creep): number {
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
        offloadEnergyNearby(creep);
    } else {
        relayAdjacentContainerToLink(creep);
    }
    return code;
}

export function withdrawEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<StructureContainer | StructureStorage | StructureTerminal | StructureLink>(creep);
    if (!target || target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.withdraw(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        moveToWithdrawTarget(creep, target, '#875641');
    }
    return code;
}

export function withdrawResource(creep: Creep): number {
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

export function pickupEnergy(creep: Creep): number {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return OK; }
    const target = getTarget<Resource<RESOURCE_ENERGY>>(creep);
    if (!target || target.amount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.pickup(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#875641');
    }
    return code;
}

export function pickupResource(creep: Creep): number {
    if (creep.store.getFreeCapacity() === 0) { return OK; }
    const target = getTarget<Resource<ResourceConstant>>(creep);
    if (!target || target.amount === 0) { return ERR_NOT_ENOUGH_RESOURCES; }

    const code = creep.pickup(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#875641');
    }
    return code;
}

export function depositEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    return transferEnergy(creep);
}

export function depositResource(creep: Creep): number {
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

export function transferEnergy(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<EnergyStructure>(creep);
    if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) { return ERR_FULL; }

    const code = creep.transfer(target, RESOURCE_ENERGY);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#ffffff');
    }
    return code;
}

export function build(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const target = getTarget<ConstructionSite>(creep);
    if (!target) { return ERR_INVALID_TARGET; }

    const code = creep.build(target);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, target, '#ffb752');
    }
    return code;
}

export function repair(creep: Creep): number {
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

export function upgrade(creep: Creep): number {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return ERR_NOT_ENOUGH_RESOURCES; }
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.upgradeController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#d9d9d9');
    }
    return code;
}

export function heal(creep: Creep): number {
    const target = getTarget<Creep>(creep);
    if (!target || target.hits >= target.hitsMax) { return ERR_INVALID_TARGET; }

    const code = creep.heal(target);
    if (code === ERR_NOT_IN_RANGE) {
        creep.rangedHeal(target);
        moveToJobTarget(creep, target, '#65fd62');
    }
    return code;
}

export function mineMineral(creep: Creep): number {
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

export function depositMineral(creep: Creep): number {
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

export function reserveController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.reserveController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#ffffff');
    }
    return code;
}

export function claimController(creep: Creep): number {
    const controller = getTarget<StructureController>(creep) ?? creep.room.controller;
    if (!controller) { return ERR_INVALID_TARGET; }

    const code = creep.claimController(controller);
    if (code === ERR_NOT_IN_RANGE) {
        moveToJobTarget(creep, controller, '#ffffff');
    }
    return code;
}

export function idle(creep: Creep): number {
    const assigned = getTarget<RoomObject>(creep);
    const target = assigned ?? creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0];
    if (target && creep.pos.getRangeTo(target) > 3) {
        moveToJobTarget(creep, target, '#777777');
    }
    return OK;
}
