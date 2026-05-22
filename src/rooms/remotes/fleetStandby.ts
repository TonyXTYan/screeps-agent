import { ensureArchetype } from '../../creep.capabilities';
import {
    countRemoteMinersForSource,
    projectedRemoteMinerWork
} from './coverage';

const REMOTE_STANDBY_TRIGGER_TTL = 200;

export function countRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { count++; }
    }
    return count;
}

export function countSourceLessRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if (creep.memory.assignedSourceId || creep.memory.sourceId) { continue; }
        count++;
    }
    return count;
}

export function hasRemoteStandbyMinerForSource(creeps: Creep[], remoteRoom: string, sourceId: string, excludeCreepId?: string): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        return true;
    }
    return false;
}

export function sourceNeedingBlankStandbyMiner(
    creeps: Creep[],
    remoteRoom: string,
    remotePlan: RemoteRoomPlan,
    excludeCreepId?: string
): string | null {
    if (!remotePlan.sources) { return null; }

    let bestSourceId: string | null = null;
    let bestDemand = -Infinity;
    for (const sourceId in remotePlan.sources) {
        const sourcePlan = remotePlan.sources[sourceId];
        if (sourcePlan.routeAccessible === false) { continue; }
        if (hasRemoteStandbyMinerForSource(creeps, remoteRoom, sourceId, excludeCreepId)) { continue; }
        if (countRemoteMinersForSource(creeps, remoteRoom, sourceId) > 0) { continue; }
        if (projectedRemoteMinerWork(creeps, remoteRoom, sourceId, 0) > 0) { continue; }

        const demand = sourcePlan.workDemand ?? 0;
        if (!bestSourceId || demand > bestDemand) {
            bestSourceId = sourceId;
            bestDemand = demand;
        }
    }

    return bestSourceId;
}

export function findDyingRemoteMiner(
    creeps: Creep[],
    remoteRoom: string
): Creep | null {
    let best: Creep | null = null;
    let lowestTtl = Infinity;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if (!(creep.memory.assignedSourceId ?? creep.memory.sourceId)) { continue; }
        const ttl = creep.ticksToLive;
        if (!ttl || ttl > REMOTE_STANDBY_TRIGGER_TTL) { continue; }
        if (ttl < lowestTtl) {
            best = creep;
            lowestTtl = ttl;
        }
    }
    return best;
}

export function hasActiveRemoteMinerForSource(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    excludeCreepId?: string
): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if ((creep.ticksToLive ?? 0) <= 0) { continue; }
        return true;
    }
    return false;
}

export function sourceNeedingStandbyReplacement(
    creeps: Creep[],
    remoteRoom: string
): string | null {
    const anyStandby = creeps.some((creep) =>
        ensureArchetype(creep) === 'remoteMiner' &&
        creep.memory.remoteRoom === remoteRoom &&
        creep.memory.remoteStandby);
    if (anyStandby) { return null; }

    const dyingMiner = findDyingRemoteMiner(creeps, remoteRoom);
    if (!dyingMiner) { return null; }

    const sourceId = dyingMiner.memory.assignedSourceId ?? dyingMiner.memory.sourceId;
    return sourceId ?? null;
}
