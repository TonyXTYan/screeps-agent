import {
    countActiveRemoteMinersForRoom,
    countRemoteHaulersForRoom,
    countSourceLessRemoteStandbyMiners,
    hasRemoteStandbyMinerForSource,
    sourceNeedingStandbyReplacement
} from '../remotes/fleet';
import {
    countRemoteHaulersForSource,
    countRemoteMinersForSource,
    hasIdleRemoteHauler,
    projectedRemoteHaulerCapacity,
    projectedRemoteMinerWork,
    remoteSourceActiveMinerLimit,
    remoteSourceHasContainerStation,
    remoteSourceReplacementHorizon
} from '../remotes/coverage';
import type { PendingSpawnRequest, RoomControllerContext, SpawnRequest } from '../controllerTypes';
import {
    pendingRemoteArchetypeCount,
    pendingRemoteBodyCapability
} from './accounting';
import { logRemoteSpawnSkip, remoteRequestBlockReason } from './remotePolicy';

const MAX_REMOTE_HAULERS_PER_SOURCE = 2;

export function remoteHarvestSourceDemandRequest(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    remote: RemoteRoomPlan,
    pending: PendingSpawnRequest[]
): SpawnRequest | null {
    if (!remote.sources) { return null; }

    const numSources = Object.keys(remote.sources).length;
    const totalRoomHaulers = countRemoteHaulersForRoom(homeFleet, roomName) +
        pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName);
    const totalRoomMiners = countActiveRemoteMinersForRoom(homeFleet, roomName) +
        pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, undefined, false);
    const sourceLessStandbyMiners = countSourceLessRemoteStandbyMiners(homeFleet, roomName);
    const standbySourceId = sourceNeedingStandbyReplacement(homeFleet, roomName);
    if (standbySourceId &&
        !pending.some(r =>
            r.archetype === 'remoteMiner' &&
            r.remoteRoom === roomName &&
            r.remoteStandby &&
            r.sourceId === standbySourceId)) {
        const request: SpawnRequest = {
            archetype: 'remoteMiner',
            reason: 'remote standby replacement ' + roomName + ':' + standbySourceId,
            remoteRoom: roomName,
            remoteMode: remote.mode,
            remoteStandby: true,
            sourceId: standbySourceId,
            staticMining: true,
            hasContainer: remoteSourceHasContainerStation(remote.sources[standbySourceId])
        };
        const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
        if (!blockReason) { return request; }
        logRemoteSpawnSkip(context, request, blockReason);
    }

    for (const sourceId in remote.sources) {
        const sourcePlan = remote.sources[sourceId];
        if (sourcePlan.routeAccessible === false) { continue; }

        const targetMinerWork = sourcePlan.workDemand ?? 3;
        const minerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteMiner');
        const minerProjectedWork = projectedRemoteMinerWork(homeFleet, roomName, sourceId, minerCoverageHorizon) +
            pendingRemoteBodyCapability(pending, 'remoteMiner', roomName, sourceId, 'harvest');
        const minerCount = countRemoteMinersForSource(homeFleet, roomName, sourceId) +
            pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, sourceId, false);
        const sourceMinerLimit = remoteSourceActiveMinerLimit(sourcePlan);
        const sourceHasStandby = hasRemoteStandbyMinerForSource(homeFleet, roomName, sourceId) ||
            pending.some(r =>
                r.archetype === 'remoteMiner' &&
                r.remoteRoom === roomName &&
                r.remoteStandby &&
                r.sourceId === sourceId);
        if (minerProjectedWork < targetMinerWork && minerCount < sourceMinerLimit && (minerCount === 0 || minerProjectedWork === 0) &&
            totalRoomMiners <= numSources &&
            sourceLessStandbyMiners === 0 &&
            !sourceHasStandby &&
            !pending.some(r => r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
            const request: SpawnRequest = {
                archetype: 'remoteMiner',
                reason: 'remote source handoff deficit ' + roomName + ':' + sourceId +
                    ' projected=' + minerProjectedWork + '/' + targetMinerWork,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                sourceId,
                staticMining: true,
                hasContainer: remoteSourceHasContainerStation(sourcePlan)
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }

        const targetHaulerCapacity = sourcePlan.haulerCapacityDemand ?? 150;
        const haulerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteHauler');
        const haulerProjectedCapacity = projectedRemoteHaulerCapacity(homeFleet, roomName, sourceId, haulerCoverageHorizon) +
            pendingRemoteBodyCapability(pending, 'remoteHauler', roomName, sourceId, 'haul');
        if (haulerProjectedCapacity < targetHaulerCapacity &&
            totalRoomHaulers < 2 * numSources &&
            countRemoteHaulersForSource(homeFleet, roomName, sourceId) +
                pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName, sourceId) < MAX_REMOTE_HAULERS_PER_SOURCE &&
            !hasIdleRemoteHauler(homeFleet, roomName, sourceId) &&
            !pending.some(r => r.archetype === 'remoteHauler' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
            const request: SpawnRequest = {
                archetype: 'remoteHauler',
                reason: 'remote haul handoff deficit ' + roomName + ':' + sourceId +
                    ' projected=' + haulerProjectedCapacity + '/' + targetHaulerCapacity,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                sourceId
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }

    return null;
}
