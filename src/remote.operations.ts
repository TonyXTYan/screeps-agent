import { ensureArchetype, getBodyCapabilities, getCreepCapabilities, planBodyForArchetype } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures } from './room.structures';
import { findHostiles } from './hostileUtils';
import { acquireRenewSpawn, nearestSpawn } from './spawn.renewal';
import { closest, closestByRange, firstStoredResource } from './utils.shared';

// ─── Constants ──────────────────────────────────────────────────────────────

const REMOTE_DANGER_TICKS = 1500;
const REMOTE_PATH_REFRESH_INTERVAL = 5000;
const REMOTE_INACCESSIBLE_RETRY_TICKS = 500;
const REMOTE_CONTAINER_REROUTE_FREEZE_TICKS = 150;
const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
const REMOTE_MAX_STATION_STALLS = 3;
const REMOTE_MAX_STATION_FAILURES = 3;
const REMOTE_ROAD_SITES_PER_TICK = 4;
const REMOTE_MAX_UNFINISHED_ROAD_SITES = 3;
const REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES = 8;
const REMOTE_CONTAINER_BUILD_DISTANCE = 1;
const REMOTE_SCOUT_KEEP_COUNT = 2;
const REMOTE_SCOUT_WANDER_TICKS = 120;
const REMOTE_SCOUT_CROWD_THRESHOLD = 4;
const REMOTE_PLANNING_LOG_INTERVAL = 100;
const REMOTE_AUX_BUILD_RANGE = 8;
const REMOTE_RENEW_MIN_TTL = 220;
const REMOTE_RENEW_BUFFER_TICKS = 80;
const REMOTE_RENEW_HYSTERESIS = 140;
const REMOTE_REPLACEMENT_BUFFER_TICKS = 60;
const REMOTE_STANDBY_TRIGGER_TTL = 200;
const REMOTE_STANDBY_PARK_RANGE_MIN = 4;
const REMOTE_STANDBY_PARK_RANGE_TARGET = 6;
const REMOTE_STANDBY_PARK_RANGE_MAX = 10;
const REMOTE_STANDBY_BOUNDARY_STUCK_TICKS = 15;
const MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500;
const REMOTE_HAULER_POST_TRIP_RENEW_START_TTL = 1000;
const REMOTE_HAULER_RENEW_START_TTL = 500;
const REMOTE_HAULER_RENEW_STOP_TTL = 1400;
const REMOTE_HAULER_RENEW_CRITICAL_TTL = 80;
const REMOTE_HAULER_IDLE_RECHECK_TICKS = 75;
const REMOTE_HAULER_WANDER_TICKS = 35;
const REMOTE_HAULER_WANDER_MIN_RANGE = 6;
const REMOTE_HAULER_WANDER_MAX_RANGE = 8;
const REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH = 100;
const REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO = 0.75;
const REMOTE_HAULER_RETARGET_STUCK_TICKS = 4;
const REMOTE_TARGET_MAX_HAULER_CLAIMS = 2;
const REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY = 50;
const REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY = 1000;
const REMOTE_MINER_STUCK_REPLAN_TICKS = 8;
const REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS = 18;
const REMOTE_MINER_OSCILLATION_REPLAN_TICKS = 4;
const REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD = 0.25;
const REMOTE_MINER_REPAIR_THRESHOLD = 0.5;
const REMOTE_MINER_REPAIR_RANGE = 3;

// ─── Private helpers ─────────────────────────────────────────────────────────

function setJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null): void {
    if (!target) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType && creep.memory.jobTargetId === target.id) {
        creep.memory.jobRoomName = target.pos.roomName;
        creep.memory.jobResourceType = undefined;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setTravelJob(creep: Creep, roomName: string): void {
    if (creep.memory.jobType === 'travelRoom' && creep.memory.jobRoomName === roomName) { return; }
    creep.memory.jobType = 'travelRoom';
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setResourceJob(
    creep: Creep,
    jobType: CreepJobType,
    target: (RoomObject & { id: string }) | undefined | null,
    resource: ResourceConstant | null
): void {
    if (!target || !resource) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType &&
        creep.memory.jobTargetId === target.id &&
        creep.memory.jobResourceType === resource) {
        creep.memory.jobRoomName = target.pos.roomName;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = resource;
}

function closestReachable<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }
    return creep.pos.findClosestByPath(targets, { ignoreCreeps: false }) as T | null;
}

function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}

function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

// ─── Remote Route Health ────────────────────────────────────────────────────

function primeRemoteMinerTravelStation(creep: Creep, remotePlan: RemoteRoomPlan): void {
    const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!sourceId) { return; }
    const sourcePlan = remotePlan.sources?.[sourceId];
    if (!sourcePlan || sourcePlan.stationX == null || sourcePlan.stationY == null) { return; }
    creep.memory.stationX = sourcePlan.stationX;
    creep.memory.stationY = sourcePlan.stationY;
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

function clearRemoteMinerStationMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.stationX = undefined;
    creep.memory.stationY = undefined;
    resetRemoteMinerStationProgress(creep);
    creep.memory.standbyParkStuckTicks = undefined;
    creep.memory.standbyParkLastX = undefined;
    creep.memory.standbyParkLastY = undefined;
}

function markRemoteSourceRouteHealthy(sourcePlan: RemoteSourcePlan): void {
    sourcePlan.routeHealth = 'healthy';
    sourcePlan.stallCount = 0;
    sourcePlan.lastHarvestedAt = Game.time;
    sourcePlan.stationFailures = 0;
    sourcePlan.blockedApproachX = undefined;
    sourcePlan.blockedApproachY = undefined;
    sourcePlan.blockedApproachRoom = undefined;
    sourcePlan.containerClearedAt = undefined;
}

function markRemoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan, pos: RoomPosition): void {
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

export function remoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return sourcePlan?.routeHealth === 'degraded';
}

export function remoteSourceHasContainerStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return !!sourcePlan?.containerId || !!sourcePlan?.containerSiteId;
}

export function remoteSourceHasStaticStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return remoteSourceHasContainerStation(sourcePlan) ||
        (sourcePlan?.stationX != null && sourcePlan?.stationY != null);
}

export function remoteSourceActiveMinerLimit(sourcePlan: RemoteSourcePlan): number {
    if (remoteSourceHasStaticStation(sourcePlan)) { return 1; }
    return 2;
}

function sameRoomPosition(a: RoomPosition, b: RoomPosition): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

// ─── Standby Miner Management ───────────────────────────────────────────────

function assignStandbyRemoteMiner(creep: Creep, homeRoom: string, remoteRoom: string, remotePlan: RemoteRoomPlan): boolean {
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

// ─── Remote Infrastructure Helpers ──────────────────────────────────────────

function preferredRemoteInfrastructureSite(
    creep: Creep,
    archetype: CreepArchetype,
    selectedSite: ConstructionSite | null
): ConstructionSite | null {
    if (archetype !== 'remoteMaintainer') { return selectedSite; }

    const currentSite = currentRemoteInfrastructureBuildSite(creep);
    if (currentSite) { return currentSite; }
    return selectedSite;
}

function currentRemoteInfrastructureBuildSite(creep: Creep): ConstructionSite | null {
    if (creep.memory.jobType !== 'build') { return null; }
    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return null; }

    const site = Game.getObjectById(targetId as Id<ConstructionSite>);
    if (!site) { return null; }
    if (site.progress >= site.progressTotal) { return null; }
    if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER) { return null; }
    return site;
}

// ─── Remote Hauler Cycle Management ─────────────────────────────────────────

function assignRemoteHaulerCycle(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const totalUsed = creep.store.getUsedCapacity();
    const totalCapacity = creep.store.getCapacity();
    const ttl = creep.ticksToLive ?? 0;
    const loadRatio = totalCapacity > 0 ? totalUsed / totalCapacity : 1;
    const full = creep.store.getFreeCapacity() === 0;

    if (totalUsed > 0) {
        const workParts = creep.getActiveBodyparts(WORK);
        const freeCapacity = creep.store.getFreeCapacity();
        // Skip top-up when free capacity ≤ WORK parts: opportunistic repair burns exactly
        // what the top-up picks up each tick, leaving the creep stuck at that threshold.
        const worthTopping = freeCapacity > 0 && (workParts === 0 || freeCapacity > workParts);
        if (worthTopping && !creep.memory.remoteHaulerReturning && creep.room.name === remoteRoom) {
            const followDroppedTopUp = creep.memory.remoteHaulerLastPickupWasDropped === true &&
                creep.memory.jobType !== 'pickupEnergy';
            const source = findRemoteEnergySource(creep, remotePlan, {
                followDroppedTopUp
            });
            if (source) {
                const pathLength = remoteEnergyTargetPathLength(creep, source.target);
                const isFarPickup = pathLength !== null && pathLength > REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH;
                if (!isFarPickup || loadRatio < REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO) {
                    creep.memory.remoteHaulerIdleUntil = undefined;
                    clearRemoteHaulerWanderMemory(creep);
                    creep.memory.remoteHaulerLastPickupWasDropped = source.fromDropped ? true : undefined;
                    setJob(creep, source.jobType, source.target);
                    return true;
                }
            }
        }

        creep.memory.remoteHaulerReturning = true;
        creep.memory.remoteHaulerLastPickupWasDropped = undefined;
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = ttl < REMOTE_HAULER_POST_TRIP_RENEW_START_TTL ? true : undefined;
        creep.memory.remoteHaulerIdleUntil = undefined;
        clearRemoteHaulerWanderMemory(creep);
        assignRemoteHaulerDelivery(creep, homeRoom);
        return true;
    }

    creep.memory.remoteHaulerReturning = undefined;
    if (creep.memory.remoteHaulerRenewAfterTrip) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, true);
        if ((creep.ticksToLive ?? 0) > REMOTE_HAULER_RENEW_STOP_TTL) {
            creep.memory.remoteHaulerRenewAfterTrip = undefined;
            creep.memory.remoteRenewing = false;
        }
        if (renewing) { return true; }
        if (creep.memory.remoteHaulerRenewAfterTrip) {
            setTravelJob(creep, homeRoom);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        const source = findRemoteEnergySource(creep, remotePlan);
        if (source) {
            creep.memory.remoteHaulerIdleUntil = undefined;
            clearRemoteHaulerWanderMemory(creep);
            setJob(creep, source.jobType, source.target);
            return true;
        }

        creep.memory.remoteHaulerIdleUntil = Game.time + REMOTE_HAULER_IDLE_RECHECK_TICKS;
        clearRemoteHaulerWanderMemory(creep);
        setTravelJob(creep, homeRoom);
        return true;
    }

    if (creep.memory.remoteHaulerIdleUntil && Game.time < creep.memory.remoteHaulerIdleUntil) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, ttl <= REMOTE_HAULER_RENEW_START_TTL);
        if (renewing) { return true; }
        return assignRemoteHaulerHomeIdle(creep, homeRoom);
    }

    if (creep.memory.remoteRenewing) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, false);
        if (renewing) { return true; }
    }

    creep.memory.remoteHaulerIdleUntil = undefined;
    creep.memory.remoteHaulerLastPickupWasDropped = undefined;
    clearRemoteHaulerWanderMemory(creep);
    setTravelJob(creep, remoteRoom);
    return true;
}

function manageRemoteHaulerRenewal(creep: Creep, homeRoomName: string, forceRenew: boolean): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    const alreadyRenewing = creep.memory.remoteRenewing === true;

    const homeRoom = Game.rooms[homeRoomName];
    if (!alreadyRenewing && homeRoom && shouldDeferRemoteHaulerRenewal(homeRoom, ttl)) {
        // Home room still needs energy: defer starting a new renew cycle so haulers
        // resume hauling/refill work. Once started, finish the cycle to avoid
        // one-tick renew bounces at the spawn.
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.memory.remoteRenewing && (forceRenew || ttl <= REMOTE_HAULER_RENEW_START_TTL)) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl > REMOTE_HAULER_RENEW_STOP_TTL) {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

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
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
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

    creep.memory.remoteRenewing = false;
    return false;
}

function shouldDeferRemoteHaulerRenewal(homeRoom: Room, ttl: number): boolean {
    if (ttl <= REMOTE_HAULER_RENEW_CRITICAL_TTL) { return false; }
    if (homeRoom.memory.energyRecoveryActive === true) { return true; }
    return homeRoom.energyAvailable < homeRoom.energyCapacityAvailable;
}

function assignRemoteHaulerHomeIdle(creep: Creep, homeRoomName: string): boolean {
    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = closest(creep, homeRoom.find(FIND_MY_SPAWNS));
    if (!spawn) {
        setJob(creep, 'idle', homeRoom.storage ?? homeRoom.controller);
        return true;
    }

    const target = remoteHaulerWanderTarget(creep, spawn);
    if (!creep.pos.inRangeTo(target, 1)) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#7dd3fc' } });
    }
    setTravelJob(creep, homeRoomName);
    return true;
}

function remoteHaulerWanderTarget(creep: Creep, spawn: StructureSpawn): RoomPosition {
    if (creep.memory.remoteHaulerWanderX != null &&
        creep.memory.remoteHaulerWanderY != null &&
        creep.memory.remoteHaulerWanderUntil &&
        creep.memory.remoteHaulerWanderUntil > Game.time) {
        const current = new RoomPosition(
            creep.memory.remoteHaulerWanderX,
            creep.memory.remoteHaulerWanderY,
            spawn.room.name
        );
        if (current.getRangeTo(spawn.pos) >= REMOTE_HAULER_WANDER_MIN_RANGE) { return current; }
    }

    const terrain = spawn.room.getTerrain();
    const radiusSpread = REMOTE_HAULER_WANDER_MAX_RANGE - REMOTE_HAULER_WANDER_MIN_RANGE + 1;
    const seed = hashString(creep.name) + Game.time;

    for (let i = 0; i < 24; i++) {
        const radius = REMOTE_HAULER_WANDER_MIN_RANGE + ((seed + i) % radiusSpread);
        const angle = ((seed * 31 + i * 67) % 360) * (Math.PI / 180);
        const x = clampRoomCoord(Math.round(spawn.pos.x + Math.cos(angle) * radius));
        const y = clampRoomCoord(Math.round(spawn.pos.y + Math.sin(angle) * radius));
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

        const candidate = new RoomPosition(x, y, spawn.room.name);
        if (candidate.getRangeTo(spawn.pos) < REMOTE_HAULER_WANDER_MIN_RANGE) { continue; }
        const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART);
        if (blocked) { continue; }

        creep.memory.remoteHaulerWanderX = x;
        creep.memory.remoteHaulerWanderY = y;
        creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
        return candidate;
    }

    const fallback = new RoomPosition(
        clampRoomCoord(spawn.pos.x + REMOTE_HAULER_WANDER_MIN_RANGE),
        clampRoomCoord(spawn.pos.y),
        spawn.room.name
    );
    creep.memory.remoteHaulerWanderX = fallback.x;
    creep.memory.remoteHaulerWanderY = fallback.y;
    creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
    return fallback;
}

function clearRemoteHaulerWanderMemory(creep: Creep): void {
    creep.memory.remoteHaulerWanderX = undefined;
    creep.memory.remoteHaulerWanderY = undefined;
    creep.memory.remoteHaulerWanderUntil = undefined;
}

function clampRoomCoord(value: number): number {
    return Math.max(1, Math.min(48, value));
}

function assignRemoteHaulerDelivery(creep: Creep, homeRoom: string): void {
    if (creep.room.name !== homeRoom) {
        setTravelJob(creep, homeRoom);
        return;
    }

    const structures = getRoomStructures(creep.room);
    const resource = firstStoredResource(creep.store);

    if (resource === RESOURCE_ENERGY) {
        const refillTarget = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (refillTarget) {
            setJob(creep, 'refillSpawn', refillTarget);
            return;
        }

        const towerTarget = closest(creep, structures.towers
            .filter((tower) => towerEnergyRatio(tower) < 0.55));
        if (towerTarget) {
            setJob(creep, 'refillTower', towerTarget);
            return;
        }
    }

    const storage = structures.storage;
    if (storage && resource && storage.store.getFreeCapacity(resource) > 0) {
        if (resource === RESOURCE_ENERGY) {
            setJob(creep, 'depositEnergy', storage);
        } else {
            setResourceJob(creep, 'depositResource', storage, resource);
        }
        return;
    }

    if (structures.terminal && resource && structures.terminal.store.getFreeCapacity(resource) > 0) {
        setResourceJob(creep, 'depositResource', structures.terminal, resource);
        return;
    }

    if (resource === RESOURCE_ENERGY) {
        const emergencySink = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (emergencySink) {
            setJob(creep, 'depositEnergy', emergencySink);
            return;
        }
    }

    setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
}

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

// ─── Remote Renewal ─────────────────────────────────────────────────────────

function isRemoteMinerSittingOnContainer(creep: Creep): boolean {
    const stationaryTargetId = creep.memory.stationaryTargetId;
    if (stationaryTargetId) {
        const station = Game.getObjectById(stationaryTargetId as Id<StructureContainer>);
        if (station && station.structureType === STRUCTURE_CONTAINER && creep.pos.isEqualTo(station.pos)) {
            return true;
        }
    }

    return creep.pos.lookFor(LOOK_STRUCTURES).some((structure) => structure.structureType === STRUCTURE_CONTAINER);
}

function manageRemoteRenewal(
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

function estimateRemoteDistance(
    creep: Creep,
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan
): number {
    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (assignedSourceId) {
        const sourcePlan = remotePlan.sources?.[assignedSourceId];
        if (sourcePlan?.pathDistance && sourcePlan.pathDistance > 0) {
            return sourcePlan.pathDistance;
        }
    }

    if (remotePlan.sources) {
        let best = Infinity;
        for (const sourceId in remotePlan.sources) {
            const pathDistance = remotePlan.sources[sourceId]?.pathDistance;
            if (!pathDistance || pathDistance <= 0) { continue; }
            best = Math.min(best, pathDistance);
        }
        if (best < Infinity) { return best; }
    }

    try {
        return Math.max(25, Game.map.getRoomLinearDistance(homeRoomName, remoteRoomName) * 50);
    } catch {
        return 25;
    }
}

function closestRemoteInfrastructureSite(creep: Creep, allowLongRange: boolean): ConstructionSite | null {
    const candidates = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    });
    if (candidates.length === 0) { return null; }

    const nearby = candidates.filter((site) => creep.pos.getRangeTo(site) <= REMOTE_AUX_BUILD_RANGE);
    if (nearby.length === 0 && !allowLongRange) { return null; }

    const pool = nearby.length > 0 ? nearby : candidates;
    const byPath = creep.pos.findClosestByPath(pool, { ignoreCreeps: true }) as ConstructionSite | null;
    if (byPath) { return byPath; }
    return closest(creep, pool);
}

// ─── Remote Room Plan Updates ───────────────────────────────────────────────

function remoteEntryPositions(homeRoom: Room, remoteRoomName: string): RoomPosition[] {
    const exitDirFromHome = Game.map.findExit(homeRoom.name, remoteRoomName);
    if (typeof exitDirFromHome !== 'number' || exitDirFromHome <= 0) { return []; }

    const entries: RoomPosition[] = [];
    for (const homeExit of homeRoom.find(exitDirFromHome as ExitConstant) as RoomPosition[]) {
        const mirrored = mirrorExitPositionIntoRoom(homeExit, remoteRoomName);
        if (mirrored) { entries.push(mirrored); }
    }
    return entries;
}

function mirrorExitPositionIntoRoom(exit: RoomPosition, roomName: string): RoomPosition | null {
    if (exit.x === 0) { return new RoomPosition(49, exit.y, roomName); }
    if (exit.x === 49) { return new RoomPosition(0, exit.y, roomName); }
    if (exit.y === 0) { return new RoomPosition(exit.x, 49, roomName); }
    if (exit.y === 49) { return new RoomPosition(exit.x, 0, roomName); }
    return null;
}

function bestRemoteEntryRoute(entries: RoomPosition[], station: RoomPosition, blockedPos?: RoomPosition): PathFinderPath | null {
    if (entries.length === 0) { return null; }
    const opts: PathFinderOpts = { maxRooms: 1 };
    if (blockedPos && blockedPos.roomName === station.roomName) {
        opts.roomCallback = (roomName) => {
            if (roomName !== station.roomName) { return false; }
            const matrix = new PathFinder.CostMatrix();
            matrix.set(blockedPos.x, blockedPos.y, 255);
            return matrix;
        };
    }
    return PathFinder.search(station, entries.map(pos => ({ pos, range: 0 })), opts);
}

function findStationForSource(room: Room, source: Source, entries: RoomPosition[] = [], blockedPos?: RoomPosition): RoomPosition | null {
    const terrain = room.getTerrain();
    const around = room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
    let best: RoomPosition | null = null;
    let bestScore = -1;
    for (const tile of around) {
        if (tile.x === source.pos.x && tile.y === source.pos.y) { continue; }
        const pos = new RoomPosition(tile.x, tile.y, room.name);
        if (!isRemoteStationTileUsable(pos, tile.terrain)) { continue; }
        const route = entries.length > 0 ? bestRemoteEntryRoute(entries, pos, blockedPos) : null;
        if (entries.length > 0 && (!route || route.incomplete)) { continue; }
        const pathCost = route?.path.length ?? 0;
        const score = countOpenTilesAround(terrain, tile.x, tile.y) * 100 - pathCost;
        if (score > bestScore) {
            bestScore = score;
            best = pos;
        }
    }
    return best;
}

function isRemoteStationTileUsable(pos: RoomPosition, terrain: string): boolean {
    if (terrain === 'wall') { return false; }
    if (pos.lookFor(LOOK_SOURCES).length > 0 || pos.lookFor(LOOK_MINERALS).length > 0) { return false; }
    const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_CONTAINER &&
        structure.structureType !== STRUCTURE_RAMPART);
    if (blocked) { return false; }
    return !pos.lookFor(LOOK_CONSTRUCTION_SITES).some((site) =>
        site.structureType !== STRUCTURE_ROAD &&
        site.structureType !== STRUCTURE_CONTAINER);
}

function countOpenTilesAround(terrain: RoomTerrain, x: number, y: number): number {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) { continue; }
            if (terrain.get(nx, ny) !== TERRAIN_MASK_WALL) { count++; }
        }
    }
    return count;
}

function canPlaceContainerSite(position: RoomPosition): boolean {
    if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    return !position.lookFor(LOOK_STRUCTURES).some((s) =>
        s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD);
}

export function updateRemoteRoomPlans(homeRoom: Room): void {
    const remotes = homeRoom.memory.plan?.remoteRooms ?? {};
    const myUsername = homeRoom.controller?.owner?.username;
    for (const remoteName in remotes) {
        const remote = remotes[remoteName];
        if (!remote.enabled) { continue; }
        if (remote.reserve === undefined) { remote.reserve = true; }
        if (remote.buildRoads === undefined) { remote.buildRoads = true; }
        if (remote.maintainRoads === undefined) { remote.maintainRoads = true; }
        if (remote.debugPaths === undefined) { remote.debugPaths = false; }
        if (remote.mode !== 'harvest') { continue; }

        const visible = Game.rooms[remoteName];
        if (!visible) { continue; }

        remote.lastScouted = Game.time;
        const hostiles = findHostiles(visible);
        const hostileCore = visible.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_INVADER_CORE
        });
        const hostileControl = Boolean(visible.controller?.owner && visible.controller.owner.username !== myUsername) ||
            Boolean(visible.controller?.reservation && visible.controller.reservation.username !== myUsername);
        if (hostiles.length > 0 || hostileCore.length > 0 || hostileControl) {
            remote.lastSeenHostiles = Game.time;
            remote.dangerUntil = Game.time + REMOTE_DANGER_TICKS;
            remote.skipReason = 'danger';
            continue;
        }
        const hadAutoDanger = remote.skipReason === 'danger';
        remote.skipReason = undefined;
        if (hadAutoDanger) {
            remote.dangerUntil = undefined;
        }

        if (!remote.sources) { remote.sources = {}; }
        let roadsPlaced = 0;
        let unfinishedRoadSites = visible.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === STRUCTURE_ROAD
        }).length;
        const remoteEntries = remoteEntryPositions(homeRoom, remoteName);
        for (const source of visible.find(FIND_SOURCES)) {
            const existing = remote.sources[source.id] ?? (remote.sources[source.id] = { sourceId: source.id });
            existing.lastSeen = Game.time;
            const containerFrozen = existing.containerClearedAt !== undefined
                && Game.time - existing.containerClearedAt < REMOTE_CONTAINER_REROUTE_FREEZE_TICKS;
            const container = containerFrozen ? undefined : closestByRange(source, visible.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE
            }) as StructureContainer[]);
            const containerSite = (container || containerFrozen) ? null : closestByRange(source, visible.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: (site) => site.structureType === STRUCTURE_CONTAINER &&
                    site.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE
            }) as ConstructionSite[]);
            const blockedApproach = (existing.blockedApproachX != null && existing.blockedApproachRoom != null && existing.blockedApproachRoom === remoteName)
                ? new RoomPosition(existing.blockedApproachX, existing.blockedApproachY ?? 0, existing.blockedApproachRoom)
                : undefined;
            const station = container?.pos ?? containerSite?.pos ?? findStationForSource(visible, source, remoteEntries, blockedApproach);
            if (station) {
                existing.stationX = station.x;
                existing.stationY = station.y;
            } else {
                existing.stationX = undefined;
                existing.stationY = undefined;
                existing.routeAccessible = false;
                const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                existing.pathUpdatedAt = Game.time - retryOffset;
            }
            if (!containerFrozen) {
                existing.containerId = container?.id;
            }
            if (containerSite) {
                existing.containerSiteId = containerSite.id;
            } else {
                existing.containerSiteId = undefined;
            }
            existing.workDemand = sourceWorkDemand(source);
            const anchor = homeRoom.storage ?? homeRoom.find(FIND_MY_SPAWNS)[0];
            let latestPath: RoomPosition[] = [];
            const pathRetryInterval = existing.routeAccessible === false
                ? REMOTE_INACCESSIBLE_RETRY_TICKS
                : REMOTE_PATH_REFRESH_INTERVAL;
            const pathStale = !existing.pathUpdatedAt || Game.time - existing.pathUpdatedAt > pathRetryInterval;
            const cachedPath = deserializeRemotePath(existing.pathSerialized);
            const hasCachedPath = cachedPath.length > 0;
            if (anchor && station && (!existing.pathDistance || !hasCachedPath || pathStale || existing.routeAccessible === undefined)) {
                const route = PathFinder.search(anchor.pos, { pos: station, range: 0 }, { maxRooms: 8 });
                if (!route.incomplete) {
                    // Simulate the miner's local entry route into the remote room. A complete
                    // cross-room path is not enough if the selected exit enters a separated pocket.
                    const localRoute = bestRemoteEntryRoute(remoteEntries, station, blockedApproach);
                    const locallyReachable = !!localRoute && !localRoute.incomplete;
                    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log('room.controller: local path check ' + homeRoom.name + '->' + remoteName +
                            ' src=' + source.id +
                            ' len=' + (localRoute ? localRoute.path.length : -1) +
                            (!localRoute || localRoute.incomplete ? ' incomplete' : ''));
                    }
                    if (locallyReachable) {
                        existing.routeAccessible = true;
                        existing.stationFailures = 0;
                        existing.blockedApproachX = undefined;
                        existing.blockedApproachY = undefined;
                        existing.blockedApproachRoom = undefined;
                        existing.containerClearedAt = undefined;
                        latestPath = route.path;
                        existing.pathDistance = route.path.length;
                        existing.pathSerialized = serializeRemotePath(route.path);
                        existing.pathUpdatedAt = Game.time;
                    } else {
                        existing.routeAccessible = false;
                        existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, remoteName, route.path.length);
                        const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                        existing.pathUpdatedAt = Game.time - retryOffset;
                        latestPath = hasCachedPath ? cachedPath : [];
                        if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                            console.log(
                                'room.controller: station not locally reachable ' + homeRoom.name + '->' + remoteName +
                                ' source=' + source.id
                            );
                        }
                    }
                } else {
                    existing.routeAccessible = false;
                    existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, remoteName, route.path.length);
                    const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                    existing.pathUpdatedAt = Game.time - retryOffset;
                    latestPath = hasCachedPath ? cachedPath : [];
                    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log(
                            'room.controller: incomplete remote path ' + homeRoom.name + '->' + remoteName +
                            ' source=' + source.id +
                            ' partial=' + route.path.length +
                            ' fallback=' + existing.pathDistance
                        );
                    }
                }
            } else if (!pathStale) {
                latestPath = cachedPath;
            }
            const distance = Math.max(1, existing.pathDistance ?? 25);
            const income = source.energyCapacity / ENERGY_REGEN_TIME;
            existing.haulerCapacityDemand = Math.min(MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE, Math.ceil(income * distance * 2 * 1.2));

            if (station && !container && canPlaceContainerSite(station)) {
                const code = station.createConstructionSite(STRUCTURE_CONTAINER);
                if (code !== OK && code !== ERR_FULL && Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                    console.log('room.controller: failed to place remote container in ' + visible.name + ' at ' + station.x + ',' + station.y + ' code=' + code);
                }
            }
            if (remote.buildRoads && latestPath.length > 0 && roadsPlaced < REMOTE_ROAD_SITES_PER_TICK) {
                const roadSiteLimit = remoteSourceRouteDegraded(existing)
                    ? REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES
                    : REMOTE_MAX_UNFINISHED_ROAD_SITES;
                if (unfinishedRoadSites < roadSiteLimit) {
                    const placed = placeRemoteRoadSites(
                        homeRoom,
                        visible,
                        existing,
                        latestPath,
                        myUsername,
                        roadSiteLimit,
                        REMOTE_ROAD_SITES_PER_TICK - roadsPlaced,
                        unfinishedRoadSites
                    );
                    roadsPlaced += placed;
                    unfinishedRoadSites += placed;
                }
            }
        }
    }
}

// ─── Remote Road Placement ──────────────────────────────────────────────────

function placeRemoteRoadSites(
    homeRoom: Room,
    visibleRemote: Room,
    sourcePlan: RemoteSourcePlan,
    latestPath: RoomPosition[],
    myUsername: string | undefined,
    siteLimit: number,
    maxToPlace: number,
    unfinishedRoadSites: number
): number {
    let placed = 0;
    const steps = prioritizedRemoteRoadSteps(sourcePlan, latestPath);
    for (const step of steps) {
        if (placed >= maxToPlace || unfinishedRoadSites + placed >= siteLimit) { break; }
        if (!canPlaceRemoteRoadSite(homeRoom, visibleRemote, step, myUsername)) { continue; }

        const code = step.createConstructionSite(STRUCTURE_ROAD);
        if (code === OK) {
            placed++;
            sourcePlan.lastRoadPlanAt = Game.time;
            advanceRemoteRoadCursor(sourcePlan, latestPath, step);
        } else if (code === ERR_FULL) {
            break;
        } else if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
            console.log('room.controller: failed to place remote road in ' + step.roomName + ' at ' + step.x + ',' + step.y + ' code=' + code);
        }
    }
    return placed;
}

function prioritizedRemoteRoadSteps(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[]): RoomPosition[] {
    const steps: RoomPosition[] = [];
    const addUnique = (pos: RoomPosition | undefined): void => {
        if (!pos) { return; }
        if (steps.some((step) => sameRoomPosition(step, pos))) { return; }
        steps.push(pos);
    };

    for (const step of latestPath) {
        if (isRemoteExitApproach(step)) { addUnique(step); }
    }
    for (const step of latestPath) {
        if (isSwampPathStep(step)) { addUnique(step); }
    }
    if (sourcePlan.lastStallX !== undefined &&
        sourcePlan.lastStallY !== undefined &&
        sourcePlan.lastStallRoom) {
        addUnique(new RoomPosition(sourcePlan.lastStallX, sourcePlan.lastStallY, sourcePlan.lastStallRoom));
    }

    const start = Math.max(0, sourcePlan.roadCursor ?? 0) % Math.max(1, latestPath.length);
    for (let offset = 0; offset < latestPath.length; offset++) {
        addUnique(latestPath[(start + offset) % latestPath.length]);
    }

    return steps;
}

function canPlaceRemoteRoadSite(
    homeRoom: Room,
    visibleRemote: Room,
    pos: RoomPosition,
    myUsername: string | undefined
): boolean {
    if (pos.x <= 0 || pos.y <= 0 || pos.x >= 49 || pos.y >= 49) { return false; }
    if (pos.roomName !== visibleRemote.name && pos.roomName !== homeRoom.name) { return false; }
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    if (isOwnedByMe(room, myUsername)) { return false; }
    if (room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL) { return false; }

    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (structures.some((s) => s.structureType === STRUCTURE_ROAD)) { return false; }
    if (structures.some((s) => s.structureType !== STRUCTURE_RAMPART)) { return false; }
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    return true;
}

function advanceRemoteRoadCursor(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[], placed: RoomPosition): void {
    const index = latestPath.findIndex((step) => sameRoomPosition(step, placed));
    if (index < 0) { return; }
    sourcePlan.roadCursor = (index + 1) % latestPath.length;
}

function isRemoteExitApproach(pos: RoomPosition): boolean {
    return pos.x <= 2 || pos.y <= 2 || pos.x >= 47 || pos.y >= 47;
}

function isSwampPathStep(pos: RoomPosition): boolean {
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    return room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP;
}

function isOwnedByMe(room: Room, myUsername?: string): boolean {
    if (!myUsername) { return false; }
    return room.controller?.owner?.username === myUsername;
}

function serializeRemotePath(path: RoomPosition[]): string {
    return JSON.stringify(path.map((step) => [step.x, step.y, step.roomName]));
}

function deserializeRemotePath(serialized?: string): RoomPosition[] {
    if (!serialized) { return []; }
    try {
        const raw = JSON.parse(serialized) as Array<[number, number, string]>;
        return raw
            .filter((step) => Array.isArray(step) && typeof step[0] === 'number' && typeof step[1] === 'number' && typeof step[2] === 'string')
            .map((step) => new RoomPosition(step[0], step[1], step[2]));
    } catch {
        return [];
    }
}

function fallbackRemotePathDistance(homeRoomName: string, remoteRoomName: string, partialPathLength: number): number {
    try {
        const linearDistance = Math.max(1, Game.map.getRoomLinearDistance(homeRoomName, remoteRoomName));
        return Math.max(partialPathLength, linearDistance * 50, 25);
    } catch {
        return Math.max(partialPathLength, 25);
    }
}

export function shouldBuildRemoteInfrastructure(
    creep: Creep,
    archetype: CreepArchetype,
    remotePlan: RemoteRoomPlan
): boolean {
    if (remotePlan.buildRoads === false) { return false; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return false; }
    if (creep.getActiveBodyparts(WORK) <= 0) { return false; }
    if (creep.getActiveBodyparts(CARRY) <= 0) { return false; }
    if (archetype === 'remoteMiner' && isRemoteMinerSittingOnContainer(creep)) { return false; }

    if (archetype === 'remoteMaintainer') { return true; }
    if (archetype === 'remoteMiner') { return true; }
    return false;
}

// ─── Main Remote Creep Assignment ───────────────────────────────────────────

export function assignRemoteCreep(creep: Creep): boolean {
    const homeRoom = creep.memory.homeRoom;
    const remoteRoom = creep.memory.remoteRoom;
    if (!homeRoom || !remoteRoom) { return false; }
    const archetype = ensureArchetype(creep);
    const configuredRemotePlan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
    if (configuredRemotePlan && !configuredRemotePlan.enabled) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (configuredRemotePlan?.dangerUntil && configuredRemotePlan.dangerUntil > Game.time) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (!configuredRemotePlan && !(Memory.rooms[homeRoom]?.plan?.claimTargets ?? []).includes(remoteRoom)) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    const remotePlan: RemoteRoomPlan = configuredRemotePlan ?? {
        enabled: true,
        roomName: remoteRoom,
        mode: creep.memory.remoteMode ?? 'claim',
        reserve: false,
        buildRoads: false,
        maintainRoads: false
    };

    const capabilities = getCreepCapabilities(creep);
    if (archetype === 'remoteHauler') {
        return assignRemoteHaulerCycle(creep, homeRoom, remoteRoom, remotePlan);
    }
    if (manageRemoteRenewal(creep, archetype, capabilities, homeRoom, remoteRoom, remotePlan)) {
        return true;
    }

    if (archetype === 'remoteScout') {
        const scoutPack = remoteScoutPack(homeRoom, remoteRoom);
        const scoutRank = scoutPack.indexOf(creep.name);
        if (scoutPack.length > REMOTE_SCOUT_KEEP_COUNT && scoutRank >= REMOTE_SCOUT_KEEP_COUNT) {
            return assignOverflowRemoteScout(creep, homeRoom);
        }
        if (remoteRoomCrowdedForScout(creep, homeRoom, remoteRoom)) {
            return assignOverflowRemoteScout(creep, homeRoom, remoteRoom);
        }

        if (findHostiles(creep.room).length > 0 && creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }

        if (creep.room.name !== remoteRoom) {
            setTravelJob(creep, remoteRoom);
            return true;
        }
        const hold = new RoomPosition(25, 25, remoteRoom);
        if (creep.pos.getRangeTo(hold) > 8) {
            creep.moveTo(hold, { visualizePathStyle: { stroke: '#a0b7ff' } });
        }
        clearJob(creep);
        return true;
    }

    if (archetype === 'remoteMiner' && creep.memory.remoteStandby) {
        return assignStandbyRemoteMiner(creep, homeRoom, remoteRoom, remotePlan);
    }

    if (archetype === 'remoteMiner') {
        primeRemoteMinerTravelStation(creep, remotePlan);
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const remoteBuildSite = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? preferredRemoteInfrastructureSite(creep, archetype, closestRemoteInfrastructureSite(creep, archetype === 'remoteMaintainer'))
        : null;
    if (remoteBuildSite) {
        setJob(creep, 'build', remoteBuildSite);
        return true;
    }

    if (archetype === 'claimer' && creep.room.controller) {
        const jobType: CreepJobType = creep.memory.remoteMode === 'reserve' ? 'reserveController' : 'claimController';
        setJob(creep, jobType, creep.room.controller);
        return true;
    }

    if (archetype === 'remoteMiner') {
        let assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        const sources = creep.room.find(FIND_SOURCES);
        const sourceIds = new Set<string>(sources.map((source) => source.id));
        if (assignedSourceId && !sourceIds.has(assignedSourceId)) {
            assignedSourceId = undefined;
        }

        const minerCountBySource = new Map<string, number>();
        for (const other of creepsForHomeRoom(homeRoom)) {
            if (other.id === creep.id) { continue; }
            if (other.spawning) { continue; }
            if (ensureArchetype(other) !== 'remoteMiner') { continue; }
            if (other.memory.remoteRoom !== remoteRoom) { continue; }
            if (other.memory.remoteStandby) { continue; }
            const sid = other.memory.assignedSourceId ?? other.memory.sourceId;
            if (sid && sourceIds.has(sid)) {
                minerCountBySource.set(sid, (minerCountBySource.get(sid) ?? 0) + 1);
            }
        }

        let selectedSource: Source | null = null;
        if (assignedSourceId) {
            const currentSource = sources.find((source) => source.id === assignedSourceId) ?? null;
            if (currentSource) {
                const currentSourcePlan = remotePlan.sources?.[currentSource.id];
                const currentCount = minerCountBySource.get(currentSource.id) ?? 0;
                const currentCap = remoteSourceMinerSlotCap(remotePlan, currentSource);
                if (currentSourcePlan?.routeAccessible !== false && currentCount < currentCap) {
                    selectedSource = currentSource;
                }
            }
        }

        if (!selectedSource) {
            selectedSource = pickRemoteMinerSource(creep, sources, remotePlan, minerCountBySource);
            assignedSourceId = selectedSource?.id;
        }

        if (!selectedSource || !assignedSourceId) {
            creep.memory.remoteStandby = true;
            creep.memory.sourceId = undefined;
            creep.memory.assignedSourceId = undefined;
            creep.memory.stationaryTargetId = undefined;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
            if (creep.room.name !== homeRoom) {
                setTravelJob(creep, homeRoom);
            } else {
                setJob(creep, 'idle', Game.rooms[homeRoom]?.storage
                    ?? creep.pos.findClosestByRange(FIND_MY_SPAWNS));
            }
            return true;
        }

        const sourceCfg = remotePlan.sources?.[assignedSourceId];
        const wasAlreadyDegraded = !!sourceCfg && remoteSourceRouteDegraded(sourceCfg);
        if (sourceCfg && remoteMinerStationRouteStalled(creep, selectedSource, sourceCfg)) {
            markRemoteSourceRouteDegraded(sourceCfg, creep.pos);
            if (!wasAlreadyDegraded) {
                resetRemoteMinerStationProgress(creep);
            }
        }

        const noProgressTicks = creep.memory.remoteStationNoProgressTicks ?? 0;
        const preferDirectSourceApproach = !!sourceCfg &&
            remoteSourceRouteDegraded(sourceCfg) &&
            noProgressTicks >= REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS;

        let stationaryTargetId: string | undefined;
        if (!preferDirectSourceApproach && sourceCfg?.containerId) {
            stationaryTargetId = sourceCfg.containerId;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
        } else if (!preferDirectSourceApproach && sourceCfg?.stationX != null && sourceCfg?.stationY != null && sourceCfg.routeAccessible !== false) {
            stationaryTargetId = undefined;
            creep.memory.stationX = sourceCfg.stationX;
            creep.memory.stationY = sourceCfg.stationY;
        } else {
            stationaryTargetId = assignedSourceId;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
        }

        creep.memory.remoteStandby = undefined;
        creep.memory.sourceId = selectedSource.id;
        creep.memory.assignedSourceId = selectedSource.id;
        creep.memory.stationaryTargetId = stationaryTargetId ?? selectedSource.id;

        if (selectedSource.energy === 0) {
            const damagedNearby = closest(creep, creep.room.find(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) &&
                             s.hits < s.hitsMax * REMOTE_MINER_REPAIR_THRESHOLD &&
                             creep.pos.getRangeTo(s) <= REMOTE_MINER_REPAIR_RANGE
            }) as AnyStructure[]);
            if (damagedNearby) {
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    setJob(creep, 'repair', damagedNearby);
                    return true;
                }
                const stationContainer = sourceCfg?.containerId
                    ? Game.getObjectById(sourceCfg.containerId as Id<StructureContainer>)
                    : null;
                if (stationContainer && stationContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    setJob(creep, 'withdrawEnergy', stationContainer);
                    return true;
                }
            }
        }

        setJob(creep, 'harvestSource', selectedSource);
        return true;
    }

    if (archetype === 'remoteMaintainer') {
        const criticalContainer = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD
        }) as AnyStructure[]);
        if (criticalContainer && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'repair', criticalContainer);
            return true;
        }
        const site = closestRemoteInfrastructureSite(creep, true) ??
            closest(creep, creep.room.find(FIND_MY_CONSTRUCTION_SITES));
        if (site && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'build', site);
            return true;
        }
        const repair = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.9
        }) as AnyStructure[]);
        if (repair && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'repair', repair);
            return true;
        }
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const remoteEnergy = findRemoteEnergySource(creep, remotePlan, {
                droppedFirst: false,
                droppedMinAmount: 50
            });
            if (remoteEnergy) {
                setJob(creep, remoteEnergy.jobType, remoteEnergy.target);
                return true;
            }

            // Avoid a source we're currently stuck on (mirrors hauler retarget logic).
            // Use path-based selection so terrain-blocked sources are never picked.
            const stuckOnSourceId = (creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS
                && creep.memory.jobType === 'harvestSource'
                ? creep.memory.jobTargetId : undefined;
            const allSources = creep.room.find(FIND_SOURCES);
            const preferred = stuckOnSourceId ? allSources.filter(s => s.id !== stuckOnSourceId) : allSources;
            const sourcePool = preferred.length > 0 ? preferred : allSources;
            const source = (creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: false })
                ?? creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: true })) as Source | null;
            if (source) {
                setJob(creep, 'harvestSource', source);
                return true;
            }
        }
    }

    // Fallback for legacy/misclassified remote creeps that still carry remote assignment.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        const structures = getRoomStructures(creep.room);
        const sink = structures.storage ?? closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
        } else {
            const towerFill = closest(creep, structures.towers.filter(t => t.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
            if (towerFill) {
                setJob(creep, 'refillTower', towerFill);
            } else {
                setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
            }
        }
        return true;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && capabilities.harvest > 0) {
        const source = closestReachable(creep, creep.room.find(FIND_SOURCES));
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        setJob(creep, 'idle', creep.room.controller);
    } else {
        setTravelJob(creep, remoteRoom);
    }
    return true;
}

// ─── Remote Counting/Projection Utilities ───────────────────────────────────

export function creepsForHomeRoom(homeRoomName: string): Creep[] {
    const creeps: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom === homeRoomName) {
            creeps.push(creep);
            continue;
        }
        if (!creep.memory.homeRoom && creep.room.name === homeRoomName) {
            creeps.push(creep);
        }
    }
    return creeps;
}

export function countActiveRemoteMinersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        count++;
    }
    return count;
}

export function countRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { count++; }
    }
    return count;
}

export function countSourceLessRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if (creep.memory.assignedSourceId || creep.memory.sourceId) { continue; }
        count++;
    }
    return count;
}

export function hasRemoteStandbyMinerForSource(creeps: Creep[], remoteRoom: string, sourceId: string, excludeCreepId?: string): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        return true;
    }
    return false;
}

function sourceNeedingBlankStandbyMiner(
    creeps: Creep[],
    remoteRoom: string,
    remotePlan: RemoteRoomPlan,
    excludeCreepId?: string
): string | null {
    if (!remotePlan.sources) { return null; }

    let bestSourceId: string | null = null;
    let bestDemand = -Infinity;
    for (const sourceId in remotePlan.sources) {
        const sourcePlan = remotePlan.sources[sourceId];
        if (sourcePlan.routeAccessible === false) { continue; }
        if (hasRemoteStandbyMinerForSource(creeps, remoteRoom, sourceId, excludeCreepId)) { continue; }
        if (countRemoteMinersForSource(creeps, remoteRoom, sourceId) > 0) { continue; }
        if (projectedRemoteMinerWork(creeps, remoteRoom, sourceId, 0) > 0) { continue; }

        const demand = sourcePlan.workDemand ?? 0;
        if (!bestSourceId || demand > bestDemand) {
            bestSourceId = sourceId;
            bestDemand = demand;
        }
    }

    return bestSourceId;
}

function findDyingRemoteMiner(
    creeps: Creep[],
    remoteRoom: string
): Creep | null {
    let best: Creep | null = null;
    let lowestTtl = Infinity;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if (!(creep.memory.assignedSourceId ?? creep.memory.sourceId)) { continue; }
        const ttl = creep.ticksToLive;
        if (!ttl || ttl > REMOTE_STANDBY_TRIGGER_TTL) { continue; }
        if (ttl < lowestTtl) {
            best = creep;
            lowestTtl = ttl;
        }
    }
    return best;
}

function hasActiveRemoteMinerForSource(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    excludeCreepId?: string
): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if ((creep.ticksToLive ?? 0) <= 0) { continue; }
        return true;
    }
    return false;
}

export function sourceNeedingStandbyReplacement(
    creeps: Creep[],
    remoteRoom: string
): string | null {
    const anyStandby = creeps.some((creep) =>
        ensureArchetype(creep) === 'remoteMiner' &&
        creep.memory.remoteRoom === remoteRoom &&
        creep.memory.remoteStandby);
    if (anyStandby) { return null; }

    const dyingMiner = findDyingRemoteMiner(creeps, remoteRoom);
    if (!dyingMiner) { return null; }

    const sourceId = dyingMiner.memory.assignedSourceId ?? dyingMiner.memory.sourceId;
    return sourceId ?? null;
}

export function countRemoteMinersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

export function countRemoteHaulersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

export function countRemoteHaulersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        count++;
    }
    return count;
}

function remoteSourceMinerSlotCap(remotePlan: RemoteRoomPlan, source: Source): number {
    const sourceCfg = remotePlan.sources?.[source.id];
    if (sourceCfg && remoteSourceHasStaticStation(sourceCfg)) { return 1; }
    return Math.max(1, Math.min(2, remoteTargetAccessSlots(source.pos)));
}

function pickRemoteMinerSource(
    creep: Creep,
    sources: Source[],
    remotePlan: RemoteRoomPlan,
    minerCountBySource: Map<string, number>
): Source | null {
    let bestSource: Source | null = null;
    let bestLoad = Infinity;
    let bestRange = Infinity;
    for (const source of sources) {
        const sourcePlan = remotePlan.sources?.[source.id];
        if (sourcePlan?.routeAccessible === false) { continue; }
        const cap = remoteSourceMinerSlotCap(remotePlan, source);
        const count = minerCountBySource.get(source.id) ?? 0;
        if (count >= cap) { continue; }
        const load = count / cap;
        const range = creep.pos.getRangeTo(source);
        if (!bestSource || load < bestLoad || (load === bestLoad && range < bestRange)) {
            bestSource = source;
            bestLoad = load;
            bestRange = range;
        }
    }
    return bestSource;
}

export function countFleetForArchetype(creeps: Creep[], archetype: CreepArchetype): number {
    let count = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) === archetype) { count++; }
    }
    return count;
}

// ─── Scout Assignment ───────────────────────────────────────────────────────

export function countRemoteScouts(homeRoomName: string, remoteRoom: string): number {
    return remoteScoutPack(homeRoomName, remoteRoom).length;
}

export function hasAssignedNonScoutRemoteCreep(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        if (archetype === 'remoteScout') { continue; }
        if (archetype !== 'remoteMiner' &&
            archetype !== 'remoteHauler' &&
            archetype !== 'remoteMaintainer' &&
            archetype !== 'claimer') {
            continue;
        }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        return true;
    }
    return false;
}

function remoteScoutPack(homeRoomName: string, remoteRoom: string): string[] {
    const names: string[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (ensureArchetype(creep) !== 'remoteScout') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.homeRoom && creep.memory.homeRoom !== homeRoomName) { continue; }
        names.push(creep.name);
    }
    names.sort();
    return names;
}

function remoteRoomCrowdedForScout(creep: Creep, homeRoomName: string, remoteRoom: string): boolean {
    const visibleRemote = Game.rooms[remoteRoom];
    if (!visibleRemote) { return false; }

    let others = 0;
    const roomCreeps = visibleRemote.find(FIND_MY_CREEPS);
    for (const other of roomCreeps) {
        if (other.id === creep.id) { continue; }
        if (other.memory.homeRoom && other.memory.homeRoom !== homeRoomName) { continue; }
        others++;
        if (others >= REMOTE_SCOUT_CROWD_THRESHOLD) { return true; }
    }
    return false;
}

function assignOverflowRemoteScout(
    creep: Creep,
    homeRoomName: string,
    wanderFallbackRoom: string = homeRoomName
): boolean {
    const hostiles = findHostiles(creep.room);
    if (hostiles.length > 0) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const wanderExpired = !creep.memory.scoutWanderUntil || creep.memory.scoutWanderUntil <= Game.time;
    const reachedWanderRoom = creep.memory.scoutWanderRoom === creep.room.name;
    if (!creep.memory.scoutWanderRoom || wanderExpired || reachedWanderRoom) {
        creep.memory.scoutWanderRoom = chooseWanderRoom(creep, wanderFallbackRoom);
        creep.memory.scoutWanderUntil = Game.time + REMOTE_SCOUT_WANDER_TICKS;
    }

    const targetRoom = creep.memory.scoutWanderRoom ?? wanderFallbackRoom;
    if (creep.room.name !== targetRoom) {
        setTravelJob(creep, targetRoom);
        return true;
    }

    const targetPos = wanderPointInRoom(creep, targetRoom);
    if (!creep.pos.inRangeTo(targetPos, 3)) {
        creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#9ec8ff' } });
    }
    clearJob(creep);
    return true;
}

function chooseWanderRoom(creep: Creep, fallbackRoom: string): string {
    const exits = Game.map.describeExits(creep.room.name);
    const rooms: string[] = [];
    if (exits) {
        for (const key in exits) {
            const roomName = exits[key as unknown as keyof typeof exits];
            if (roomName) { rooms.push(roomName); }
        }
    }
    if (rooms.length === 0) { return fallbackRoom; }
    const seed = hashString(creep.name) + Game.time;
    return rooms[Math.abs(seed) % rooms.length];
}

function wanderPointInRoom(creep: Creep, roomName: string): RoomPosition {
    const visibleRoom = Game.rooms[roomName];
    if (visibleRoom) {
        const terrain = visibleRoom.getTerrain();
        for (let i = 0; i < 12; i++) {
            const seedA = hashString(creep.name + ':x:' + i);
            const seedB = hashString(creep.name + ':y:' + i);
            const x = 3 + (Math.abs(seedA) % 44);
            const y = 3 + (Math.abs(seedB) % 44);
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
            const pos = new RoomPosition(x, y, roomName);
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            return pos;
        }
    }

    const seedA = hashString(creep.name + ':x:fallback');
    const seedB = hashString(creep.name + ':y:fallback');
    const x = 10 + (Math.abs(seedA) % 31);
    const y = 10 + (Math.abs(seedB) % 31);
    return new RoomPosition(x, y, roomName);
}

// ─── Remote Claimer/Work/Capacity Counting ──────────────────────────────────

export function remoteClaimerCount(creeps: Creep[], remoteRoom: string, mode: RemoteRoomMode, minClaimParts: number = 1): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'claimer') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteMode !== mode) { continue; }
        if (getCreepCapabilities(creep).claim < minClaimParts) { continue; }
        count++;
    }
    return count;
}

export function assignedRemoteMinerWork(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).harvest;
    }
    return total;
}

export function assignedRemoteHaulerCapacity(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).haul;
    }
    return total;
}

export function projectedRemoteMinerWork(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.harvest;
    }
    return total;
}

export function projectedRemoteHaulerCapacity(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.haul;
    }
    return total;
}

export function remoteSourceReplacementHorizon(
    context: { room: { energyCapacityAvailable: number } },
    sourcePlan: RemoteSourcePlan,
    archetype: 'remoteMiner' | 'remoteHauler'
): number {
    const oneWayDistance = Math.max(1, sourcePlan.pathDistance ?? 25);
    const spawnBody = archetype === 'remoteMiner'
        ? planBodyForArchetype('remoteMiner', context.room.energyCapacityAvailable, {
            staticMining: true,
            hasContainer: remoteSourceHasContainerStation(sourcePlan)
        })
        : planBodyForArchetype('remoteHauler', context.room.energyCapacityAvailable);
    const spawnTime = Math.max(1, spawnBody.length * CREEP_SPAWN_TIME);
    return oneWayDistance + spawnTime + REMOTE_REPLACEMENT_BUFFER_TICKS;
}

// ─── Remote Maintainer Queries ──────────────────────────────────────────────

export function hasRemoteMaintainer(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.remoteRoom === remoteRoom) { return true; }
    }
    return false;
}

export function remoteNeedsMaintainer(remoteRoom: string): boolean {
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) { return true; }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

export function remoteNeedsRouteHealthMaintainer(remoteRoom: string, remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlanHasDegradedRoute(remotePlan)) { return false; }
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    }).length > 0) {
        return true;
    }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

function remotePlanHasDegradedRoute(remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlan?.sources) { return false; }
    for (const sourceId in remotePlan.sources) {
        if (remoteSourceRouteDegraded(remotePlan.sources[sourceId])) { return true; }
    }
    return false;
}

export function hasIdleRemoteHauler(creeps: Creep[], remoteRoom: string, sourceId?: string): boolean {
    const room = Game.rooms[remoteRoom];
    let foundIdleHauler = false;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && (creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (creep.store.getUsedCapacity() > 0) { continue; }
        if (room && creep.room.name === remoteRoom) { foundIdleHauler = true; break; }
        if (!room && creep.room.name === creep.memory.homeRoom && !creep.spawning) { foundIdleHauler = true; break; }
    }
    if (!foundIdleHauler) { return false; }
    if (room) {
        const containersWithEnergy = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containersWithEnergy.length > 0) { return true; }
    }
    return foundIdleHauler;
}

// ─── Remote Energy Target Finding ───────────────────────────────────────────

type RemoteEnergySourceTarget = {
    jobType: 'withdrawEnergy' | 'pickupEnergy';
    target: RoomObject & { id: string };
    fromDropped: boolean;
};

export function findRemoteEnergySource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    opts?: { followDroppedTopUp?: boolean; droppedFirst?: boolean; droppedMinAmount?: number }
): RemoteEnergySourceTarget | null {
    const avoidTargetId = remoteHaulerAvoidTargetId(creep);
    const sourceContainerIds = remoteSourceContainerIds(remotePlan);
    const droppedFirst = opts?.droppedFirst !== false;
    const droppedMinAmount = Math.max(1, opts?.droppedMinAmount ?? 1);
    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    const followDroppedTopUp = opts?.followDroppedTopUp === true;

    if (assignedSourceId && remotePlan.sources?.[assignedSourceId]) {
        const assignedTarget = bestRemoteEnergyTargetForSource(
            creep,
            remotePlan,
            assignedSourceId,
            avoidTargetId,
            droppedMinAmount,
            followDroppedTopUp
        );
        const assignedAvailable = remoteEnergyAvailableForSource(creep, remotePlan, assignedSourceId, droppedMinAmount);
        const assignedIsDry = assignedAvailable < REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY;

        if (assignedTarget && !assignedIsDry) {
            return assignedTarget;
        }

        if (assignedIsDry) {
            const overflowTarget = bestCrossSourceRemoteEnergyTarget(
                creep,
                remotePlan,
                assignedSourceId,
                avoidTargetId,
                REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY
            );
            if (overflowTarget) {
                return overflowTarget;
            }
        }

        if (assignedTarget) {
            return assignedTarget;
        }

        return null;
    }

    const droppedCandidates = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) =>
            resource.resourceType === RESOURCE_ENERGY &&
            resource.amount >= droppedMinAmount &&
            remoteEnergyAvailableAfterClaims(creep, resource as Resource<RESOURCE_ENERGY>) > 0
    }) as Resource<RESOURCE_ENERGY>[];
    const droppedEnergy = pickRemoteEnergyTarget(creep, droppedCandidates, avoidTargetId);

    if (!followDroppedTopUp && droppedFirst && droppedEnergy) {
        return { jobType: 'pickupEnergy', target: droppedEnergy, fromDropped: true };
    }

    if (followDroppedTopUp) {
        const sourceContainers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                sourceContainerIds[structure.id] === true &&
                remoteEnergyAvailableAfterClaims(creep, structure as StructureContainer) > 0
        }) as StructureContainer[];
        const sourceContainer = pickRemoteEnergyTarget(creep, sourceContainers, avoidTargetId);
        if (sourceContainer) {
            return { jobType: 'withdrawEnergy', target: sourceContainer, fromDropped: false };
        }
    }

    const bestContainer = bestRemoteSourceContainer(creep, remotePlan);
    if (bestContainer) {
        return { jobType: 'withdrawEnergy', target: bestContainer, fromDropped: false };
    }

    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) =>
            structure.structureType === STRUCTURE_CONTAINER &&
            remoteEnergyAvailableAfterClaims(creep, structure as StructureContainer) > 0
    }) as StructureContainer[];
    const container = pickRemoteEnergyTarget(creep, containers, avoidTargetId);
    if (container) {
        return { jobType: 'withdrawEnergy', target: container, fromDropped: false };
    }

    const links = creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_LINK &&
            remoteEnergyAvailableAfterClaims(creep, s as StructureLink) > 0
    }) as StructureLink[];
    const link = pickRemoteEnergyTarget(creep, links, avoidTargetId);
    if (link) {
        return { jobType: 'withdrawEnergy', target: link, fromDropped: false };
    }

    if (droppedEnergy) {
        return { jobType: 'pickupEnergy', target: droppedEnergy, fromDropped: true };
    }

    return null;
}

function bestRemoteEnergyTargetForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    avoidTargetId: string | undefined,
    droppedMinAmount: number,
    skipDroppedResources: boolean
): RemoteEnergySourceTarget | null {
    const targets = remoteEnergyTargetsForSource(creep, remotePlan, sourceId, droppedMinAmount, skipDroppedResources)
        .filter((candidate) => !shouldAvoidRemoteEnergyTarget(creep, candidate.target, avoidTargetId));

    return pickRemoteEnergySourceTarget(creep, targets);
}

function bestCrossSourceRemoteEnergyTarget(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    assignedSourceId: string,
    avoidTargetId: string | undefined,
    minEnergy: number
): RemoteEnergySourceTarget | null {
    const candidates: RemoteEnergySourceTarget[] = [];
    if (!remotePlan.sources) { return null; }

    for (const sourceId in remotePlan.sources) {
        if (sourceId === assignedSourceId) { continue; }
        for (const candidate of remoteEnergyTargetsForSource(creep, remotePlan, sourceId, minEnergy, false)) {
            if (remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>) < minEnergy) {
                continue;
            }
            if (shouldAvoidRemoteEnergyTarget(creep, candidate.target, avoidTargetId)) {
                continue;
            }
            candidates.push(candidate);
        }
    }

    return pickRemoteEnergySourceTarget(creep, candidates);
}

function remoteEnergyAvailableForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number
): number {
    return remoteEnergyTargetsForSource(creep, remotePlan, sourceId, droppedMinAmount, false)
        .reduce((total, candidate) =>
            total + remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>), 0);
}

function remoteEnergyTargetsForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number,
    skipDroppedResources: boolean
): RemoteEnergySourceTarget[] {
    const cfg = remotePlan.sources?.[sourceId];
    if (!cfg) { return []; }

    const targets: RemoteEnergySourceTarget[] = [];
    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container &&
            remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
            isRemoteEnergyTargetReachable(creep, container)) {
            targets.push({ jobType: 'withdrawEnergy', target: container, fromDropped: false });
        }
    }

    if (skipDroppedResources) {
        return targets;
    }

    const station = remoteSourceStationPosition(remotePlan, sourceId);
    if (!station || creep.room.name !== station.roomName) {
        return targets;
    }

    const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) =>
            resource.resourceType === RESOURCE_ENERGY &&
            resource.amount >= droppedMinAmount &&
            resource.pos.inRangeTo(station, 1) &&
            remoteEnergyAvailableAfterClaims(creep, resource as Resource<RESOURCE_ENERGY>) > 0
    }) as Resource<RESOURCE_ENERGY>[];

    for (const resource of dropped) {
        targets.push({ jobType: 'pickupEnergy', target: resource, fromDropped: true });
    }

    return targets;
}

function remoteSourceStationPosition(remotePlan: RemoteRoomPlan, sourceId: string): RoomPosition | null {
    const cfg = remotePlan.sources?.[sourceId];
    if (!cfg) { return null; }

    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container) { return container.pos; }
    }

    if (cfg.stationX !== undefined && cfg.stationY !== undefined) {
        return new RoomPosition(cfg.stationX, cfg.stationY, remotePlan.roomName);
    }

    const source = Game.getObjectById(sourceId as Id<Source>);
    return source?.pos ?? null;
}

function pickRemoteEnergySourceTarget(
    creep: Creep,
    targets: RemoteEnergySourceTarget[]
): RemoteEnergySourceTarget | null {
    if (targets.length === 0) { return null; }
    const target = pickRemoteEnergyTarget(creep, targets.map(candidate => candidate.target));
    return targets.find(candidate => candidate.target.id === target?.id) ?? null;
}

function remoteSourceContainerIds(remotePlan: RemoteRoomPlan): { [id: string]: true } {
    const ids: { [id: string]: true } = {};
    if (!remotePlan.sources) { return ids; }
    for (const sourceId in remotePlan.sources) {
        const containerId = remotePlan.sources[sourceId]?.containerId;
        if (!containerId) { continue; }
        ids[containerId] = true;
    }
    return ids;
}

function remoteEnergyTargetPathLength(
    creep: Creep,
    target: RoomObject & { id: string }
): number | null {
    if (creep.room.name !== target.pos.roomName) { return null; }

    if (creep.pos.isEqualTo(target.pos)) { return 0; }

    const strict = creep.pos.findPathTo(target, { ignoreCreeps: false, maxRooms: 1 });
    if (strict.length > 0) { return strict.length; }

    const soft = creep.pos.findPathTo(target, { ignoreCreeps: true, maxRooms: 1 });
    if (soft.length > 0) { return soft.length; }

    return null;
}

function remoteHaulerAvoidTargetId(creep: Creep): string | undefined {
    const jobType = creep.memory.jobType;
    if (jobType !== 'withdrawEnergy' && jobType !== 'pickupEnergy') { return undefined; }
    if ((creep.memory.travelStuckTicks ?? 0) < REMOTE_HAULER_RETARGET_STUCK_TICKS) { return undefined; }
    return creep.memory.jobTargetId;
}

function pickRemoteEnergyTarget<T extends RoomObject & { id: string }>(
    creep: Creep,
    targets: T[],
    avoidTargetId?: string
): T | null {
    if (targets.length === 0) { return null; }

    const preferred = targets.filter((target) =>
        !shouldAvoidRemoteEnergyTarget(creep, target, avoidTargetId));
    const nonAvoided = targets.filter((target) =>
        !avoidTargetId || target.id !== avoidTargetId);
    const pool = preferred.length > 0
        ? preferred
        : (nonAvoided.length > 0 ? nonAvoided : targets);

    const byPath = creep.pos.findClosestByPath(pool, { ignoreCreeps: false }) as T | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByPath(pool, { ignoreCreeps: true }) as T | null;
}

function shouldAvoidRemoteEnergyTarget(
    creep: Creep,
    target: RoomObject & { id: string },
    avoidTargetId?: string
): boolean {
    if (avoidTargetId && target.id === avoidTargetId) { return true; }

    const accessSlots = remoteTargetAccessSlots(target.pos);
    const claimCap = Math.max(1, Math.min(REMOTE_TARGET_MAX_HAULER_CLAIMS, accessSlots));
    return remoteEnergyClaimCountForTarget(creep, target.id) >= claimCap;
}

function isRemoteEnergyTargetReachable(
    creep: Creep,
    target: RoomObject & { id: string }
): boolean {
    if (creep.room.name !== target.pos.roomName) { return true; }

    const strict = creep.pos.findClosestByPath([target], { ignoreCreeps: false }) as RoomObject | null;
    if (strict) { return true; }
    const soft = creep.pos.findClosestByPath([target], { ignoreCreeps: true }) as RoomObject | null;
    return soft !== null;
}

function remoteTargetAccessSlots(pos: RoomPosition): number {
    const room = Game.rooms[pos.roomName];
    if (!room) { return 8; }

    const terrain = room.getTerrain();
    let slots = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const tile = new RoomPosition(x, y, pos.roomName);
            if (tile.lookFor(LOOK_SOURCES).length > 0 || tile.lookFor(LOOK_MINERALS).length > 0) { continue; }
            const blocked = tile.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            slots++;
        }
    }
    return Math.max(1, slots);
}

function remoteEnergyClaimCountForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let claims = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        claims++;
    }
    return claims;
}

function remoteEnergyAvailableAfterClaims(
    creep: Creep,
    target: StructureContainer | StructureLink | Resource<RESOURCE_ENERGY>
): number {
    const amount = 'amount' in target
        ? target.amount
        : target.store.getUsedCapacity(RESOURCE_ENERGY);
    return Math.max(0, amount - remoteEnergyClaimsForTarget(creep, target.id));
}

function remoteEnergyClaimsForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let reserved = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        reserved += other.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return reserved;
}

function bestRemoteSourceContainer(creep: Creep, remotePlan: RemoteRoomPlan): StructureContainer | null {
    if (!remotePlan.sources) { return null; }

    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    const avoidTargetId = remoteHaulerAvoidTargetId(creep);

    if (assignedSourceId) {
        const cfg = remotePlan.sources[assignedSourceId];
        if (cfg?.containerId) {
            const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
            if (container &&
                remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
                !shouldAvoidRemoteEnergyTarget(creep, container, avoidTargetId) &&
                isRemoteEnergyTargetReachable(creep, container)) {
                return container;
            }
        }
    }

    const candidates: StructureContainer[] = [];
    for (const sourceId in remotePlan.sources) {
        if (sourceId === assignedSourceId) { continue; }
        const cfg = remotePlan.sources[sourceId];
        if (!cfg.containerId) { continue; }
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (!container) { continue; }
        const energy = remoteEnergyAvailableAfterClaims(creep, container);
        if (energy > 0) { candidates.push(container); }
    }

    return pickRemoteEnergyTarget(creep, candidates, avoidTargetId);
}

/**
 * Garbage-collects stale memory for disabled remote rooms.
 * Called from room.controller.run() to prevent unbounded memory growth
 * when a room is enabled/disabled repeatedly over many ticks.
 *
 * Looks at room.memory.plan.remoteRooms for entries with enabled=false
 * (set via the `disable` console command), then prunes their block in Memory.rooms.
 */
export function garbageCollectDisabledRemotes(room: Room): void {
    const remotePlans = room.memory.plan?.remoteRooms;
    if (!remotePlans) { return; }

    // Throttle: only run every 500 ticks per room (divisible by home room index for spreading).
    const homeIdx = parseInt(room.name.match(/\d+/)?.[0] ?? '0', 10);
    if (Game.time % 500 !== homeIdx) { return; }

    const gcKeys = ['plan', 'remotePaths', 'sourceDemand'];
    for (const remoteName in remotePlans) {
        const plan = remotePlans[remoteName];
        if (plan.enabled) { continue; }

        const mem = Memory.rooms?.[remoteName];
        if (!mem) { continue; }
        for (const key of gcKeys) { delete mem[key as keyof typeof mem]; }
    }
}
