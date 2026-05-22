import { activeMinerCount } from '../planning/sources';
import {
    creepsForHomeRoom,
    remoteClaimerCount
} from '../remotes/fleet';
import type { PendingSpawnRequest, RoomControllerContext, SpawnRequest } from '../controllerTypes';
import type { RoomFleetCapabilities } from './accounting';
import { remoteHarvestSpawnRequest } from './remoteHarvest';
import { logRemoteSpawnSkip, remoteRequestBlockReason } from './remotePolicy';

export function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: RoomFleetCapabilities,
    pending: PendingSpawnRequest[] = []
): SpawnRequest | null {
    if (activeMinerCount(context.creeps) < context.sourcePlans.length) { return null; }
    if (pending.some(r => !r.remoteRoom)) { return null; }

    const homeFleet = creepsForHomeRoom(context.room.name);
    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.dangerUntil && remote.dangerUntil > Game.time) { continue; }
        if (remote.mode === 'harvest') {
            const request = remoteHarvestSpawnRequest(context, homeFleet, remoteRooms, roomName, remote, pending);
            if (request) { return request; }
            continue;
        }
        if ((remote.mode === 'reserve' || remote.mode === 'claim') &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
            remoteClaimerCount(homeFleet, roomName, remote.mode, remote.mode === 'reserve' ? 2 : 1) === 0) {
            let maxClaimParts: number | undefined;
            if (remote.mode === 'reserve') {
                const reservation = Game.rooms[roomName]?.controller?.reservation;
                maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
            }
            const request: SpawnRequest = {
                archetype: 'claimer',
                reason: 'configured remote ' + remote.mode + ' ' + roomName,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                minClaimParts: remote.mode === 'reserve' ? 2 : undefined,
                maxClaimParts
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }

    return null;
}
