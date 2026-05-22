import {
    remoteClaimerCount,
} from '../remotes/fleet';
import { hasRemoteMaintainer, remoteNeedsMaintainer } from '../remotes/maintenance';
import { countRemoteScouts, hasAssignedNonScoutRemoteCreep } from '../remotes/scouts';
import type { PendingSpawnRequest, RoomControllerContext, SpawnRequest } from '../controllerTypes';
import { remoteHarvestSourceDemandRequest } from './remoteHarvestSourceDemand';
import { logRemoteSpawnSkip, remoteRequestBlockReason } from './remotePolicy';

export function remoteHarvestSpawnRequest(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    remote: RemoteRoomPlan,
    pending: PendingSpawnRequest[] = []
): SpawnRequest | null {
    if (!remote.sources || Object.keys(remote.sources).length === 0) {
        const scoutRequest = requestRemoteScoutIfNeeded(context, homeFleet, remoteRooms, roomName, remote, pending);
        if (scoutRequest) { return scoutRequest; }
        return null;
    }

    if (remote.reserve !== false) {
        const reservation = Game.rooms[roomName]?.controller?.reservation;
        if ((!reservation || reservation.ticksToEnd < 4000) &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
            remoteClaimerCount(homeFleet, roomName, 'reserve', 2) === 0) {
            const maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
            const request: SpawnRequest = {
                archetype: 'claimer',
                reason: 'remote reserve ' + roomName,
                remoteRoom: roomName,
                remoteMode: 'reserve',
                minClaimParts: 2,
                maxClaimParts
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }

    const sourceDemandRequest = remoteHarvestSourceDemandRequest(
        context,
        homeFleet,
        remoteRooms,
        roomName,
        remote,
        pending
    );
    if (sourceDemandRequest) { return sourceDemandRequest; }

    if (remote.maintainRoads !== false && remoteNeedsMaintainer(roomName) &&
        !hasRemoteMaintainer(homeFleet, roomName) &&
        !pending.some(r => r.archetype === 'remoteMaintainer' && r.remoteRoom === roomName)) {
        const request: SpawnRequest = {
            archetype: 'remoteMaintainer',
            reason: 'remote maintenance ' + roomName,
            remoteRoom: roomName,
            remoteMode: remote.mode
        };
        const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
        if (!blockReason) { return request; }
        logRemoteSpawnSkip(context, request, blockReason);
    }

    return null;
}

function requestRemoteScoutIfNeeded(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    remote: RemoteRoomPlan,
    pending: PendingSpawnRequest[]
): SpawnRequest | null {
    if (countRemoteScouts(context.room.name, roomName) !== 0) { return null; }
    if (pending.some(r => r.archetype === 'remoteScout' && r.remoteRoom === roomName)) { return null; }
    if (hasAssignedNonScoutRemoteCreep(homeFleet, roomName)) { return null; }
    if (pending.some(r => r.remoteRoom === roomName && r.archetype !== 'remoteScout')) { return null; }

    const request: SpawnRequest = {
        archetype: 'remoteScout',
        reason: 'remote scout ' + roomName,
        remoteRoom: roomName,
        remoteMode: remote.mode
    };
    const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
    if (!blockReason) { return request; }
    logRemoteSpawnSkip(context, request, blockReason);
    return null;
}
