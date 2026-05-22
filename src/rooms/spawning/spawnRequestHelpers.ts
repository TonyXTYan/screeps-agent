import type { PendingSpawnRequest, SpawnRequest } from '../controllerTypes';
import { pendingSpawnRequest } from './accounting';
import { legacyRoleForArchetype } from './bodyPolicy';

export function collectPendingSpawningRequests(spawns: StructureSpawn[]): PendingSpawnRequest[] {
    const pending: PendingSpawnRequest[] = [];

    for (const spawn of spawns) {
        if (!spawn.spawning) { continue; }
        const memory = Memory.creeps[spawn.spawning.name];
        if (!memory || !memory.archetype) { continue; }
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

    return pending;
}

export function spawnRequestName(
    request: SpawnRequest,
    spawnName: string,
    pendingCount: number
): string {
    return request.archetype + '-' + spawnName + '-' + Game.time + (pendingCount > 0 ? '-' + pendingCount : '');
}

export function spawnRequestMemory(homeRoomName: string, request: SpawnRequest): CreepMemory {
    return {
        archetype: request.archetype,
        role: legacyRoleForArchetype(request.archetype),
        sourceId: request.sourceId,
        assignedSourceId: request.sourceId,
        assignedMineralId: request.mineralId,
        stationaryTargetId: request.stationaryTargetId,
        staticMining: request.staticMining,
        homeRoom: homeRoomName,
        remoteRoom: request.remoteRoom,
        remoteMode: request.remoteMode,
        remoteStandby: request.remoteStandby
    };
}
