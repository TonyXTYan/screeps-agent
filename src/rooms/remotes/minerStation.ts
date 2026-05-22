import { remoteSourceHasStaticStation } from './coverage';
import { remoteSourceRouteDegraded } from './pathing';
import { markRemoteSourceRouteDegraded, markRemoteSourceRouteHealthy } from './remoteRouteHealth';

const REMOTE_MINER_STUCK_REPLAN_TICKS = 8;
const REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS = 18;
const REMOTE_MINER_OSCILLATION_REPLAN_TICKS = 4;

export function primeRemoteMinerTravelStation(creep: Creep, remotePlan: RemoteRoomPlan): void {
    const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!sourceId) { return; }
    const sourcePlan = remotePlan.sources?.[sourceId];
    if (!sourcePlan || sourcePlan.stationX == null || sourcePlan.stationY == null) { return; }
    creep.memory.stationX = sourcePlan.stationX;
    creep.memory.stationY = sourcePlan.stationY;
}

export function updateRemoteMinerStationRoute(
    creep: Creep,
    source: Source,
    sourcePlan: RemoteSourcePlan
): void {
    const wasAlreadyDegraded = remoteSourceRouteDegraded(sourcePlan);
    if (!remoteMinerStationRouteStalled(creep, source, sourcePlan)) { return; }

    markRemoteSourceRouteDegraded(sourcePlan, creep.pos);
    if (!wasAlreadyDegraded) {
        resetRemoteMinerStationProgress(creep);
    }
}

export function remoteMinerShouldPreferDirectSourceApproach(
    creep: Creep,
    sourcePlan: RemoteSourcePlan | undefined
): boolean {
    if (!sourcePlan) { return false; }
    if (!remoteSourceRouteDegraded(sourcePlan)) { return false; }
    return (creep.memory.remoteStationNoProgressTicks ?? 0) >= REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS;
}

function remoteMinerStationRouteStalled(
    creep: Creep,
    source: Source,
    sourcePlan: RemoteSourcePlan
): boolean {
    if (!remoteSourceHasStaticStation(sourcePlan)) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    if (sourcePlan.routeAccessible === false || creep.room.name !== source.pos.roomName) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    const sameHarvestJob = creep.memory.jobType === 'harvestSource' && creep.memory.jobTargetId === source.id;
    if ((sameHarvestJob && creep.memory.lastJobResult === OK) || creep.pos.getRangeTo(source) <= 1) {
        markRemoteSourceRouteHealthy(sourcePlan);
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    if (!sameHarvestJob || creep.memory.lastJobResult !== ERR_NOT_IN_RANGE) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }

    if (creep.fatigue > 0) {
        // Preserve progress counters during fatigue rests between normal moves.
        creep.memory.remoteStationStuckSourceId = source.id;
        creep.memory.remoteStationPrevX = creep.memory.remoteStationLastX;
        creep.memory.remoteStationPrevY = creep.memory.remoteStationLastY;
        creep.memory.remoteStationPrevRoom = creep.memory.remoteStationLastRoom;
        creep.memory.remoteStationLastX = creep.pos.x;
        creep.memory.remoteStationLastY = creep.pos.y;
        creep.memory.remoteStationLastRoom = creep.pos.roomName;
        return false;
    }

    const positionKey = creep.pos.x + ',' + creep.pos.y + ',' + creep.pos.roomName;
    const sameSource = creep.memory.remoteStationStuckSourceId === source.id;
    const lastPositionKey = creep.memory.remoteStationLastX + ',' +
        creep.memory.remoteStationLastY + ',' +
        creep.memory.remoteStationLastRoom;
    const prevPositionKey = creep.memory.remoteStationPrevX + ',' +
        creep.memory.remoteStationPrevY + ',' +
        creep.memory.remoteStationPrevRoom;
    const stalled = sameSource &&
        creep.memory.remoteStationLastX !== undefined &&
        positionKey === lastPositionKey;
    const oscillating = sameSource &&
        !stalled &&
        creep.memory.remoteStationPrevX !== undefined &&
        positionKey === prevPositionKey;

    const rangeToSource = creep.pos.getRangeTo(source);
    const priorBestRange = sameSource
        ? creep.memory.remoteStationBestRange
        : undefined;
    const improvedBestRange = priorBestRange === undefined || rangeToSource < priorBestRange;
    const noProgressTicks = improvedBestRange
        ? 0
        : (sameSource ? (creep.memory.remoteStationNoProgressTicks ?? 0) + 1 : 0);
    const oscillationTicks = oscillating
        ? (creep.memory.remoteStationOscillationTicks ?? 0) + 1
        : 0;
    const stuckSignal = stalled ||
        oscillationTicks >= REMOTE_MINER_OSCILLATION_REPLAN_TICKS ||
        noProgressTicks >= REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS;
    const stuckTicks = stuckSignal
        ? (sameSource ? (creep.memory.remoteStationStuckTicks ?? 0) + 1 : 1)
        : Math.max(0, (sameSource ? (creep.memory.remoteStationStuckTicks ?? 0) : 0) - 1);

    creep.memory.remoteStationStuckSourceId = source.id;
    creep.memory.remoteStationPrevX = creep.memory.remoteStationLastX;
    creep.memory.remoteStationPrevY = creep.memory.remoteStationLastY;
    creep.memory.remoteStationPrevRoom = creep.memory.remoteStationLastRoom;
    creep.memory.remoteStationLastX = creep.pos.x;
    creep.memory.remoteStationLastY = creep.pos.y;
    creep.memory.remoteStationLastRoom = creep.pos.roomName;
    creep.memory.remoteStationBestRange = improvedBestRange
        ? rangeToSource
        : (priorBestRange ?? rangeToSource);
    creep.memory.remoteStationNoProgressTicks = noProgressTicks;
    creep.memory.remoteStationOscillationTicks = oscillationTicks;
    creep.memory.remoteStationStuckTicks = stuckTicks;

    return stuckTicks >= REMOTE_MINER_STUCK_REPLAN_TICKS;
}

function resetRemoteMinerStationProgress(creep: Creep): void {
    creep.memory.remoteStationStuckSourceId = undefined;
    creep.memory.remoteStationPrevX = undefined;
    creep.memory.remoteStationPrevY = undefined;
    creep.memory.remoteStationPrevRoom = undefined;
    creep.memory.remoteStationLastX = undefined;
    creep.memory.remoteStationLastY = undefined;
    creep.memory.remoteStationLastRoom = undefined;
    creep.memory.remoteStationBestRange = undefined;
    creep.memory.remoteStationNoProgressTicks = undefined;
    creep.memory.remoteStationOscillationTicks = undefined;
    creep.memory.remoteStationStuckTicks = undefined;
}
