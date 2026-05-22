import { ensureArchetype, getBodyCapabilities, getCreepCapabilities } from '../../creep.capabilities';
import { planBodyForArchetype } from '../../creeps/bodyPlans';
import type { RoomControllerContext } from '../controllerTypes';
import { remoteSourceHasContainerStation } from './remoteSourceStations';

const REMOTE_REPLACEMENT_BUFFER_TICKS = 60;

export function countRemoteMinersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

export function countRemoteHaulersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

export function assignedRemoteMinerWork(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).harvest;
    }
    return total;
}

export function assignedRemoteHaulerCapacity(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).haul;
    }
    return total;
}

export function projectedRemoteMinerWork(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map((part) => part.type))
            : getCreepCapabilities(creep);
        total += caps.harvest;
    }
    return total;
}

export function projectedRemoteHaulerCapacity(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map((part) => part.type))
            : getCreepCapabilities(creep);
        total += caps.haul;
    }
    return total;
}

export function remoteSourceReplacementHorizon(
    context: RoomControllerContext,
    sourcePlan: RemoteSourcePlan,
    archetype: 'remoteMiner' | 'remoteHauler'
): number {
    const oneWayDistance = Math.max(1, sourcePlan.pathDistance ?? 25);
    const spawnBody = archetype === 'remoteMiner'
        ? planBodyForArchetype('remoteMiner', context.room.energyCapacityAvailable, {
            staticMining: true,
            hasContainer: remoteSourceHasContainerStation(sourcePlan)
        })
        : planBodyForArchetype('remoteHauler', context.room.energyCapacityAvailable);
    const spawnTime = Math.max(1, spawnBody.length * CREEP_SPAWN_TIME);
    return oneWayDistance + spawnTime + REMOTE_REPLACEMENT_BUFFER_TICKS;
}

export function hasIdleRemoteHauler(creeps: Creep[], remoteRoom: string, sourceId?: string): boolean {
    const room = Game.rooms[remoteRoom];
    let foundIdleHauler = false;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && (creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (creep.store.getUsedCapacity() > 0) { continue; }
        if (room && creep.room.name === remoteRoom) { foundIdleHauler = true; break; }
        if (!room && creep.room.name === creep.memory.homeRoom && !creep.spawning) { foundIdleHauler = true; break; }
    }
    if (!foundIdleHauler) { return false; }
    if (room) {
        const containersWithEnergy = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER &&
                (structure as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containersWithEnergy.length > 0) { return true; }
    }
    return foundIdleHauler;
}
