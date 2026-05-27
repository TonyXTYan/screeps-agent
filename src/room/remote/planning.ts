// Remote room plan management: initialise, scout, path, and load recording.

import { findHostiles } from '../../hostileUtils';
import { closestByRange } from '../targeting';
import {
    remoteEntryPositions, findStationForSource, bestRemoteEntryRoute,
    serializeRemotePath, deserializeRemotePath, fallbackRemotePathDistance, canPlaceContainerSite,
} from './routing';
import { placeRemoteRoadSites } from './roads';
import { sourceWorkDemand, assignedSourceWork, totalSourcePlanWorkDemand } from '../source';
import { measureCapabilities, desiredHaulerCapacity, desiredWorkerWork } from '../spawn';
import { sumFreeEnergy, towerEnergyRatio, storedEnergy } from '../energy';
import { mineralReadyToMine, totalStoredTargets } from '../work';
import { ensureArchetype, getCreepCapabilities } from '../../creep/capabilities';
import { RoomControllerContext } from '../types';
import {
    ensureRemoteMaintenancePressure,
    markRemoteMaintenanceRefresh,
    refreshRemoteMaintenancePressureIfNeeded,
    snapshotRemoteMaintainerCount,
} from './maintenance';
import {
    REMOTE_DANGER_TICKS, REMOTE_CONTAINER_REROUTE_FREEZE_TICKS,
    REMOTE_PATH_REFRESH_INTERVAL, REMOTE_INACCESSIBLE_RETRY_TICKS, REMOTE_PATH_INCOMPLETE_RETRY_TICKS,
    REMOTE_PLANNING_LOG_INTERVAL, REMOTE_CONTAINER_BUILD_DISTANCE,
    REMOTE_ROAD_SITES_PER_TICK, REMOTE_MAX_UNFINISHED_ROAD_SITES, REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES,
    TOWER_RESERVE_RATIO, MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE,
} from '../constants';

const PATROL_DANGER_NOTIFY_COOLDOWN = 500;
const REMOTE_THREAT_MEMORY_TTL = 5000;

export function remoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return sourcePlan?.routeHealth === 'degraded';
}

export function remotePlanHasDegradedRoute(remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlan?.sources) { return false; }
    for (const sourceId in remotePlan.sources) {
        if (remoteSourceRouteDegraded(remotePlan.sources[sourceId])) { return true; }
    }
    return false;
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

export function initialiseRoomPlan(room: Room): void {
    if (!room.memory.plan) {
        room.memory.plan = {};
    }
    if (!room.memory.plan.remoteRooms) {
        room.memory.plan.remoteRooms = {};
    }
    if (!room.memory.plan.claimTargets) {
        room.memory.plan.claimTargets = [];
    }
}

export function updateRemoteRoomPlans(homeRoom: Room): void {
    const remotes = homeRoom.memory.plan?.remoteRooms ?? {};
    const myUsername = homeRoom.controller?.owner?.username;
    const patrolCoverage = patrolCoverageForHome(homeRoom.name);
    for (const remoteName in remotes) {
        const remote = remotes[remoteName];
        if (!remote.enabled) { continue; }
        if (remote.reserve === undefined) { remote.reserve = true; }
        if (remote.buildRoads === undefined) { remote.buildRoads = true; }
        if (remote.maintainRoads === undefined) { remote.maintainRoads = true; }
        if (remote.debugPaths === undefined) { remote.debugPaths = false; }
        const maintenance = ensureRemoteMaintenancePressure(remote);
        const maintainerSnapshot = assignedRemoteMaintainerSnapshot(homeRoom.name, remoteName);
        if (maintainerSnapshot.count < maintenance.lastMaintainerCount) {
            markRemoteMaintenanceRefresh(remote, 'maintainerDeath');
        }
        if (maintainerSnapshot.hasTtl500) {
            markRemoteMaintenanceRefresh(remote, 'maintainerTtl500');
        }
        snapshotRemoteMaintainerCount(remote, maintainerSnapshot.count);
        refreshRemoteMaintenancePressureIfNeeded(remote, remoteName);
        if (remote.mode !== 'harvest') { continue; }

        const visible = Game.rooms[remoteName];
        if (!visible) { continue; }

        remote.lastScouted = Game.time;
        const hostiles = findHostiles(visible);
        const hasArmedHostiles = hostiles.length > 0;
        const hostileCore = findHostileInvaderCore(visible);
        const hostileController = hasHostileController(visible, myUsername);
        if (hasArmedHostiles) {
            remote.lastSeenHostiles = Game.time;
        }
        if (hostileCore) {
            remote.lastSeenInvaderCoreAt = Game.time;
        }
        if (hostileController) {
            remote.lastSeenHostileControllerAt = Game.time;
        }
        if (!hostileCore && remote.lastSeenInvaderCoreAt && remote.lastSeenInvaderCoreAt + REMOTE_THREAT_MEMORY_TTL <= Game.time) {
            remote.lastSeenInvaderCoreAt = undefined;
        }
        if (!hostileController && remote.lastSeenHostileControllerAt && remote.lastSeenHostileControllerAt + REMOTE_THREAT_MEMORY_TTL <= Game.time) {
            remote.lastSeenHostileControllerAt = undefined;
        }

        if (hasArmedHostiles && patrolCoverage === 0) {
            const wasAlreadyDanger = remote.skipReason === 'danger';
            remote.dangerUntil = Math.max(remote.dangerUntil ?? 0, Game.time + REMOTE_DANGER_TICKS);
            remote.skipReason = 'danger';
            if (!wasAlreadyDanger) {
                console.log(`[REMOTE-DANGER] t=${Game.time} ${remoteName}: unguarded armedHostiles=${hostiles.length} — dangerUntil=${remote.dangerUntil} (~${REMOTE_DANGER_TICKS}t)`);
            }
            if ((remote.lastPatrolDangerNotifyAt ?? 0) + PATROL_DANGER_NOTIFY_COOLDOWN <= Game.time) {
                Game.notify(`[REMOTE-DANGER] ${homeRoom.name}->${remoteName} has armedHostiles=${hostiles.length} and zero patrol coverage at t=${Game.time}`);
                remote.lastPatrolDangerNotifyAt = Game.time;
            }
            continue;
        }

        if (remote.skipReason === 'danger' || remote.skipReason === 'transit-danger') {
            if (!hasArmedHostiles) {
                remote.skipReason = undefined;
                remote.dangerUntil = undefined;
                console.log(`[REMOTE-DANGER] t=${Game.time} ${remoteName}: cleared`);
            } else {
                remote.dangerUntil = Math.max(remote.dangerUntil ?? 0, Game.time + REMOTE_DANGER_TICKS);
                continue;
            }
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
            const blockedApproach = (existing.blockedApproachX != null && existing.blockedApproachY != null && existing.blockedApproachRoom != null && existing.blockedApproachRoom === remoteName)
                ? new RoomPosition(existing.blockedApproachX, existing.blockedApproachY, existing.blockedApproachRoom)
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

export function patrolCoverageForHome(homeRoomName: string): number {
    let coverage = 0;
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if ((creep.memory.homeRoom ?? creep.room.name) !== homeRoomName) { continue; }
        if (ensureArchetype(creep) !== 'patrol') { continue; }
        coverage++;
    }
    return coverage;
}

export function remoteArmedFailsafeActive(
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan | undefined,
    patrolCoverage: number = patrolCoverageForHome(homeRoomName)
): boolean {
    if (!remotePlan || remotePlan.skipReason !== 'danger') { return false; }
    if (!remotePlan.dangerUntil || remotePlan.dangerUntil <= Game.time) { return false; }
    if (patrolCoverage > 0) { return false; }
    const room = Game.rooms[remoteRoomName];
    if (!room) { return true; }
    return findHostiles(room).length > 0;
}

function findHostileInvaderCore(room: Room): StructureInvaderCore | null {
    const cores = room.find(FIND_HOSTILE_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_INVADER_CORE
    }) as StructureInvaderCore[];
    return cores[0] ?? null;
}

function hasHostileController(room: Room, myUsername?: string): boolean {
    const controller = room.controller;
    if (!controller) { return false; }
    if (controller.owner && controller.owner.username !== myUsername) { return true; }
    if (controller.reservation && controller.reservation.username !== myUsername) { return true; }
    return false;
}

function assignedRemoteMaintainerSnapshot(
    homeRoomName: string,
    remoteRoomName: string
): { count: number; hasTtl500: boolean } {
    let count = 0;
    let hasTtl500 = false;
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.homeRoom !== homeRoomName) { continue; }
        if (creep.memory.remoteRoom !== remoteRoomName) { continue; }
        count++;
        if (creep.ticksToLive === 500) {
            hasTtl500 = true;
        }
    }
    return { count, hasTtl500 };
}

export function rememberPlans(context: RoomControllerContext): void {
    if (!context.room.memory.plan) { return; }

    context.room.memory.plan.sources = {};
    for (const plan of context.sourcePlans) {
        context.room.memory.plan.sources[plan.source.id] = {
            sourceId: plan.source.id,
            containerId: plan.container?.id,
            linkId: plan.link?.id,
            requiredWork: plan.requiredWork,
            assignedWork: plan.assignedWork,
            staticMining: plan.staticMining
        };
    }

    if (context.mineralPlan) {
        context.room.memory.plan.mineral = {
            mineralId: context.mineralPlan.mineral.id,
            extractorId: context.mineralPlan.extractor?.id,
            containerId: context.mineralPlan.container?.id,
            linkId: context.mineralPlan.link?.id,
            requiredWork: context.mineralPlan.requiredWork,
            assignedWork: context.mineralPlan.assignedWork,
            staticMining: context.mineralPlan.staticMining
        };
    } else {
        context.room.memory.plan.mineral = undefined;
    }
}

export function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
    }
}

export function updatePlanAssignments(context: RoomControllerContext): void {
    for (const sourcePlan of context.sourcePlans) {
        sourcePlan.assignedWork = assignedSourceWork(context.creeps, sourcePlan.source.id);
    }

    if (context.mineralPlan) {
        let assigned = 0;
        for (const creep of context.creeps) {
            if (creep.spawning) { continue; }
            if (creep.memory.assignedMineralId !== context.mineralPlan.mineral.id) { continue; }
            if (ensureArchetype(creep) !== 'mineralMiner') { continue; }
            assigned += getCreepCapabilities(creep).harvest;
        }
        context.mineralPlan.assignedWork = assigned;
    }
}

export function rememberLoad(context: RoomControllerContext): void {
    const capacities = measureCapabilities(context.creeps);
    const spawnEnergyDeficit = sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
    const towerEnergyDeficit = sumFreeEnergy(context.structures.towers.filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO));
    const mineralReady = mineralReadyToMine(context);
    const salvageResources = totalStoredTargets(context.tombstones) +
        totalStoredTargets(context.ruins) +
        context.droppedResources.reduce((total, resource) => total + resource.amount, 0);

    context.room.memory.load = {
        updatedAt: Game.time,
        rcl: context.room.controller?.level ?? 0,
        energyAvailable: context.room.energyAvailable,
        energyCapacity: context.room.energyCapacityAvailable,
        storedEnergy: storedEnergy(context),
        sourceCount: context.sources.length,
        minerWork: capacities.minerWork,
        minerWorkDemand: totalSourcePlanWorkDemand(context.sourcePlans),
        haulerCapacity: capacities.haulerCapacity,
        haulerCapacityDemand: desiredHaulerCapacity(context).demand,
        workerWork: capacities.workerWork,
        workerWorkDemand: desiredWorkerWork(context),
        spawnEnergyDeficit,
        towerEnergyDeficit,
        constructionSites: context.constructionSites.length,
        repairTargets: context.repairTargets.length,
        mineralReady,
        salvageResources,
        mineralMinerWork: capacities.mineralMinerWork,
        mineralMinerWorkDemand: mineralReady && context.mineralPlan ? context.mineralPlan.requiredWork : 0
    };
}
