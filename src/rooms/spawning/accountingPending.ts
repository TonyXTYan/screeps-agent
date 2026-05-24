import { getBodyCapabilities } from '../../creep.capabilities';
import type { PendingSpawnRequest } from '../controllerTypes';

export function pendingArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype === archetype) { count++; }
    }
    return count;
}

export function pendingRemoteArchetypeCount(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId?: string,
    standby?: boolean
): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && request.sourceId !== sourceId) { continue; }
        if (standby !== undefined && !!request.remoteStandby !== standby) { continue; }
        count++;
    }
    return count;
}

export function pendingRemoteBodyCapability(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId: string,
    capability: 'harvest' | 'haul'
): number {
    let total = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (request.sourceId !== sourceId) { continue; }
        if (!request.plannedBody) { continue; }
        const caps = getBodyCapabilities(request.plannedBody);
        total += capability === 'harvest' ? caps.harvest : caps.haul;
    }
    return total;
}
