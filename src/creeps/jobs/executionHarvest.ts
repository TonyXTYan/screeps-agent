import { moveToJobTarget } from './movement';
import {
    offloadEnergyNearby,
    offloadResourceNearby,
    relayAdjacentContainerToLink
} from './sideEffects';
import { atStation, getTarget, stationaryTarget } from './executionTargets';

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
