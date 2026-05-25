// Remote miner station management: travel priming, stall detection, route health, standby logic, renewal.

import {
    creepsForHomeRoom, findDyingRemoteMiner, sourceNeedingBlankStandbyMiner,
    hasActiveRemoteMinerForSource, remoteSourceHasStaticStation,
} from './room.remote.fleet';
import { estimateRemoteDistance } from './room.remote.routing';
import { setJob, setTravelJob } from './room.jobMemory';
import { acquireRenewSpawn, nearestSpawn } from './spawn.renewal';
import { getCreepCapabilities } from './creep.capabilities';
import {
    REMOTE_STANDBY_PARK_RANGE_MIN, REMOTE_STANDBY_PARK_RANGE_TARGET, REMOTE_STANDBY_PARK_RANGE_MAX,
    REMOTE_STANDBY_BOUNDARY_STUCK_TICKS,
    REMOTE_MINER_STUCK_REPLAN_TICKS, REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS, REMOTE_MINER_OSCILLATION_REPLAN_TICKS,
    REMOTE_MAX_STATION_STALLS, REMOTE_MAX_STATION_FAILURES,
    REMOTE_RENEW_MIN_TTL, REMOTE_RENEW_BUFFER_TICKS, REMOTE_RENEW_HYSTERESIS,
} from './room.constants';

export function primeRemoteMinerTravelStation(creep: Creep, remotePlan: RemoteRoomPlan): void {
    const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!sourceId) { return; }
    const sourcePlan = remotePlan.sources?.[sourceId];
    if (!sourcePlan || sourcePlan.stationX == null || sourcePlan.stationY == null) { return; }
    creep.memory.stationX = sourcePlan.stationX;
    creep.memory.stationY = sourcePlan.stationY;
}

export function remoteMinerStationRouteStalled(
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
        // Update position history without resetting stuck counters.
        // Without this, the 3 resting ticks between plain-terrain moves would
        // clear all tracking state and prevent noProgressTicks from accumulating.
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

export function resetRemoteMinerStationProgress(creep: Creep): void {
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

export function clearRemoteMinerStationMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.stationX = undefined;
    creep.memory.stationY = undefined;
    resetRemoteMinerStationProgress(creep);
    creep.memory.standbyParkStuckTicks = undefined;
    creep.memory.standbyParkLastX = undefined;
    creep.memory.standbyParkLastY = undefined;
}

export function markRemoteSourceRouteHealthy(sourcePlan: RemoteSourcePlan): void {
    sourcePlan.routeHealth = 'healthy';
    sourcePlan.stallCount = 0;
    sourcePlan.lastHarvestedAt = Game.time;
    sourcePlan.stationFailures = 0;
    sourcePlan.blockedApproachX = undefined;
    sourcePlan.blockedApproachY = undefined;
    sourcePlan.blockedApproachRoom = undefined;
    sourcePlan.containerClearedAt = undefined;
}

export function markRemoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan, pos: RoomPosition): void {
    sourcePlan.routeHealth = 'degraded';
    sourcePlan.lastStallAt = Game.time;
    sourcePlan.stallCount = (sourcePlan.stallCount ?? 0) + 1;
    sourcePlan.lastStallX = pos.x;
    sourcePlan.lastStallY = pos.y;
    sourcePlan.lastStallRoom = pos.roomName;
    if ((sourcePlan.stallCount ?? 0) >= REMOTE_MAX_STATION_STALLS) {
        sourcePlan.routeAccessible = false;
        // Record the stuck zone for future pathfinding avoidance
        sourcePlan.blockedApproachX = pos.x;
        sourcePlan.blockedApproachY = pos.y;
        sourcePlan.blockedApproachRoom = pos.roomName;
        sourcePlan.stallCount = 0;
        const stationFailures = (sourcePlan.stationFailures ?? 0) + 1;
        sourcePlan.stationFailures = stationFailures;
        if (stationFailures < REMOTE_MAX_STATION_FAILURES) {
            // Clear station to force a new one, re-evaluate immediately
            sourcePlan.stationX = undefined;
            sourcePlan.stationY = undefined;
            sourcePlan.containerId = undefined;
            sourcePlan.containerSiteId = undefined;
            sourcePlan.containerClearedAt = Game.time;
            sourcePlan.pathUpdatedAt = undefined;
            console.log('room.controller: force-clearing station for re-route (failure #' +
                stationFailures + ') source=' + sourcePlan.sourceId +
                ' blocked at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
        } else {
            // Too many station failures: pathStale check uses shorter interval for blocked routes
            sourcePlan.pathUpdatedAt = Game.time;
            console.log('room.controller: permanently inaccessible after ' + stationFailures +
                ' station failures source=' + sourcePlan.sourceId +
                ' at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
        }
    } else {
        sourcePlan.pathUpdatedAt = undefined;
        console.log('room.controller: degraded remote source route source=' + sourcePlan.sourceId +
            ' after miner stall at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
    }
}

export function assignStandbyRemoteMiner(creep: Creep, homeRoom: string, remoteRoom: string, remotePlan: RemoteRoomPlan): boolean {
    const homeFleet = creepsForHomeRoom(homeRoom);
    let standbySourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!standbySourceId) {
        const dyingMiner = findDyingRemoteMiner(homeFleet, remoteRoom);
        standbySourceId = dyingMiner?.memory.assignedSourceId ?? dyingMiner?.memory.sourceId;
    }
    if (!standbySourceId) {
        standbySourceId = sourceNeedingBlankStandbyMiner(homeFleet, remoteRoom, remotePlan, creep.id) ?? undefined;
    }

    if (!standbySourceId) {
        creep.memory.sourceId = undefined;
        creep.memory.assignedSourceId = undefined;
        creep.memory.stationaryTargetId = undefined;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
        setTravelJob(creep, homeRoom);
        return true;
    }

    creep.memory.sourceId = standbySourceId;
    creep.memory.assignedSourceId = standbySourceId;

    const activeMinerAlive = hasActiveRemoteMinerForSource(homeFleet, remoteRoom, standbySourceId, creep.id);
    if (!activeMinerAlive) {
        creep.memory.remoteStandby = undefined;
        if (creep.room.name !== remoteRoom) {
            setTravelJob(creep, remoteRoom);
            return true;
        }

        const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
            creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
            null;
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }

        setTravelJob(creep, remoteRoom);
        return true;
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
        creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
        null;
    if (!source) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const range = creep.pos.getRangeTo(source);
    if (range > REMOTE_STANDBY_PARK_RANGE_MAX || range < REMOTE_STANDBY_PARK_RANGE_MIN) {
        const atBoundary = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
        const samePos = creep.memory.standbyParkLastX === creep.pos.x && creep.memory.standbyParkLastY === creep.pos.y;
        const stuckTicks = samePos ? (creep.memory.standbyParkStuckTicks ?? 0) + 1 : 0;
        creep.memory.standbyParkStuckTicks = stuckTicks;
        creep.memory.standbyParkLastX = creep.pos.x;
        creep.memory.standbyParkLastY = creep.pos.y;

        if (atBoundary && stuckTicks >= REMOTE_STANDBY_BOUNDARY_STUCK_TICKS) {
            // Can't navigate to park position from room entry — go home and wait
            creep.memory.standbyParkStuckTicks = 0;
            setTravelJob(creep, creep.memory.homeRoom!);
            return true;
        }
        creep.moveTo(source, {
            range: REMOTE_STANDBY_PARK_RANGE_TARGET,
            ignoreCreeps: true,
            reusePath: 0,
            visualizePathStyle: { stroke: '#f59e0b' }
        });
    }
    return true;
}

export function manageRemoteRenewal(
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    if (archetype === 'remoteMiner' || archetype === 'remoteMaintainer') {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (capabilities.claim > 0) { return false; } // CLAIM creeps are short-lived and not renewable.

    const oneWayDistance = estimateRemoteDistance(creep, homeRoomName, remoteRoomName, remotePlan);
    const renewStartTtl = Math.max(REMOTE_RENEW_MIN_TTL, oneWayDistance + REMOTE_RENEW_BUFFER_TICKS);
    const renewStopTtl = Math.min(1500, renewStartTtl + REMOTE_RENEW_HYSTERESIS);

    if (!creep.memory.remoteRenewing && ttl <= renewStartTtl) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl >= renewStopTtl) {
        creep.memory.remoteRenewing = false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = acquireRenewSpawn(creep, homeRoom);
    if (!spawn) {
        const waitTarget = nearestSpawn(creep, homeRoom);
        if (waitTarget) {
            if (!creep.pos.isNearTo(waitTarget)) {
                creep.moveTo(waitTarget, { visualizePathStyle: { stroke: '#f5f57a' } });
            }
            setJob(creep, 'idle', waitTarget);
            return true;
        }
        creep.memory.remoteRenewing = false;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#f5f57a' } });
        setJob(creep, 'idle', spawn);
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        setJob(creep, 'idle', spawn);
        return true;
    }

    // If renew is impossible (e.g. boosting restrictions or edge-case code),
    // release the renew lock so the creep can keep working instead of stalling.
    creep.memory.remoteRenewing = false;
    return false;
}
