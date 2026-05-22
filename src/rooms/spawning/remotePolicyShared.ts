import { ensureArchetype } from '../../creep.capabilities';
import { REMOTE_HAULER_RETARGET_STUCK_TICKS } from '../remotes/energy';
import { countSourceLessRemoteStandbyMiners } from '../remotes/fleet';
import {
    countRemoteMinersForSource,
    projectedRemoteMinerWork
} from '../remotes/coverage';
import { remoteNeedsRouteHealthMaintainer } from '../remotes/maintenance';
import type { RoomControllerContext, SpawnRequest } from '../controllerTypes';

export function isRemoteSpawnRequest(request: SpawnRequest): boolean {
    return request.archetype === 'remoteMiner' ||
        request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        request.archetype === 'remoteScout' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

export function isEmergencyRemoteRequest(homeFleet: Creep[], request: SpawnRequest): boolean {
    if (request.archetype === 'remoteScout') { return true; }
    if (request.archetype !== 'remoteMiner' || !request.remoteRoom || !request.sourceId) { return false; }
    if (countSourceLessRemoteStandbyMiners(homeFleet, request.remoteRoom) > 0) { return false; }
    return countRemoteMinersForSource(homeFleet, request.remoteRoom, request.sourceId) === 0 &&
        projectedRemoteMinerWork(homeFleet, request.remoteRoom, request.sourceId, 0) === 0;
}

export function isRouteHealthMaintainerRequest(context: RoomControllerContext, request: SpawnRequest): boolean {
    if (request.archetype !== 'remoteMaintainer' || !request.remoteRoom) { return false; }
    const remotePlan = context.room.memory.plan?.remoteRooms?.[request.remoteRoom];
    return remoteNeedsRouteHealthMaintainer(request.remoteRoom, remotePlan);
}

export function remoteSourcePlanForRequest(
    context: RoomControllerContext,
    request: SpawnRequest
): RemoteSourcePlan | undefined {
    if (!request.remoteRoom || !request.sourceId) { return undefined; }
    return context.room.memory.plan?.remoteRooms?.[request.remoteRoom]?.sources?.[request.sourceId];
}

export function remoteRequestUsesRemoteIncome(request: SpawnRequest): boolean {
    return request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

export function firstEnabledHarvestRemoteName(remoteRooms: { [roomName: string]: RemoteRoomPlan }): string | null {
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (remote.enabled && remote.mode === 'harvest') { return roomName; }
    }
    return null;
}

export function hasRemoteRouteCongestion(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.jobType !== 'travelRoom') { continue; }
        if ((creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS) { return true; }
    }
    return false;
}
