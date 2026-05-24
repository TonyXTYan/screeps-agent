import { reserveRenewSpawns } from '../../spawn.renewal';
import { creepsForHomeRoom } from '../remotes/fleet';
import type { PendingSpawnRequest, RoomControllerContext } from '../controllerTypes';
import {
    pendingSpawnRequest,
    renewalDemandCreepsForRoom
} from './accounting';
import { logRemoteSpawnSkip, remoteSpawnRecoveryBlockReason } from './remotePolicy';
import { collectPendingSpawningRequests } from './spawnRequestHelpers';
import { trySpawnRequest } from './plannerSpawnAttempt';
import { chooseSpawnRequest, desiredHaulerCapacity, desiredWorkerWork } from './requestSelection';

export function runSpawnPlanner(context: RoomControllerContext): void {
    const allFreeSpawns = context.structures.spawns.filter((s) => !s.spawning);
    if (allFreeSpawns.length === 0) { return; }

    // When multiple spawns are free, keep at least one unreserved for spawn planning
    // so long renew queues do not starve replacement/deficit spawns.
    const maxRenewReservations = allFreeSpawns.length > 1 ? allFreeSpawns.length - 1 : allFreeSpawns.length;
    const renewalReservedSpawnIds = reserveRenewSpawns(
        renewalDemandCreepsForRoom(context.room.name),
        allFreeSpawns,
        maxRenewReservations
    );
    const freeSpawns = allFreeSpawns.filter((spawn) => !renewalReservedSpawnIds[spawn.id]);
    if (freeSpawns.length === 0) { return; }

    const pending: PendingSpawnRequest[] = collectPendingSpawningRequests(context.structures.spawns);
    let remainingEnergy = context.room.energyAvailable;

    for (const spawn of freeSpawns) {
        let spawned = false;
        while (!spawned) {
            const request = chooseSpawnRequest(context, pending);
            if (!request) { break; }
            const homeFleet = creepsForHomeRoom(context.room.name);
            const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request, remainingEnergy);
            if (recoveryReason) {
                logRemoteSpawnSkip(context, request, recoveryReason);
                pending.push(pendingSpawnRequest(request));
                continue;
            }

            const attempt = trySpawnRequest(context, spawn, request, pending, remainingEnergy);
            remainingEnergy = attempt.remainingEnergy;
            if (attempt.spawned) {
                spawned = true;
            } else if (attempt.breakLoop) {
                break;
            }
        }
    }
}
export { desiredHaulerCapacity, desiredWorkerWork } from './requestSelection';
