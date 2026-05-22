import { storedEnergy } from '../energy';
import type { RoomControllerContext, SpawnRequest } from '../controllerTypes';
import {
    firstEnabledHarvestRemoteName,
    hasRemoteRouteCongestion,
    isEmergencyRemoteRequest,
    isRemoteSpawnRequest,
    isRouteHealthMaintainerRequest,
    remoteRequestUsesRemoteIncome
} from './remotePolicyShared';

const REMOTE_HOME_RECOVERY_STORED_ENERGY = 500;
const REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED = 5000;
const REMOTE_THROTTLE_STORED_ENERGY = 1;
const REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5;

export { remoteSpawnMinimumCost } from './remotePolicyCost';

export function remoteRequestBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    request: SpawnRequest
): string | null {
    const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request);
    if (recoveryReason) { return recoveryReason; }

    if (storedEnergy(context) < REMOTE_THROTTLE_STORED_ENERGY && remoteRequestUsesRemoteIncome(request)) {
        const primaryRemote = firstEnabledHarvestRemoteName(remoteRooms);
        if (primaryRemote && roomName !== primaryRemote) {
            return 'remote throttle primary=' + primaryRemote + ' stored<' + REMOTE_THROTTLE_STORED_ENERGY;
        }
    }

    if (request.archetype === 'remoteHauler' && hasRemoteRouteCongestion(homeFleet, roomName)) {
        return 'route congestion';
    }

    return null;
}

export function remoteSpawnRecoveryBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    request: SpawnRequest,
    availableEnergy: number = context.room.energyAvailable
): string | null {
    if (!isRemoteSpawnRequest(request)) { return null; }
    if (isRouteHealthMaintainerRequest(context, request)) { return null; }
    if (isEmergencyRemoteRequest(homeFleet, request)) { return null; }

    const energyCapacity = context.room.energyCapacityAvailable;
    const hasStorage = !!(context.structures.storage || context.structures.terminal);
    if (hasStorage && storedEnergy(context) < REMOTE_HOME_RECOVERY_STORED_ENERGY) {
        return 'home recovery stored<' + REMOTE_HOME_RECOVERY_STORED_ENERGY;
    }
    const stored = hasStorage ? storedEnergy(context) : 0;
    if (energyCapacity > 0 && availableEnergy < energyCapacity * REMOTE_SPAWN_MIN_ENERGY_RATIO &&
        stored < REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED) {
        return 'home recovery energy<' + Math.ceil(REMOTE_SPAWN_MIN_ENERGY_RATIO * 100) + '% remaining=' + availableEnergy;
    }
    return null;
}

export function logRemoteSpawnSkip(context: RoomControllerContext, request: SpawnRequest, reason: string): void {
    if (Game.time % 25 !== 0) { return; }
    console.log('room.controller: skipping ' + request.archetype +
        ' for ' + request.reason +
        ' reason=' + reason +
        ' stored=' + storedEnergy(context) +
        ' energy=' + context.room.energyAvailable + '/' + context.room.energyCapacityAvailable);
}
