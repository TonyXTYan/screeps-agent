import { closestByRange } from '../../utils/selection';
import { sourceWorkDemand } from '../planning/sources';
import {
    bestRemoteEntryRoute,
    canPlaceContainerSite,
    deserializeRemotePath,
    fallbackRemotePathDistance,
    findStationForSource,
    remoteEntryPositions,
    remoteSourceRouteDegraded,
    serializeRemotePath
} from './pathing';
import { placeRemoteRoadSites } from './roads';

const REMOTE_PATH_REFRESH_INTERVAL = 5000;
const REMOTE_INACCESSIBLE_RETRY_TICKS = 500;
const REMOTE_CONTAINER_REROUTE_FREEZE_TICKS = 150;
const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
const REMOTE_ROAD_SITES_PER_TICK = 4;
const REMOTE_MAX_UNFINISHED_ROAD_SITES = 3;
const REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES = 8;
const REMOTE_CONTAINER_BUILD_DISTANCE = 1;
const REMOTE_PLANNING_LOG_INTERVAL = 100;
const MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500;

export function updateVisibleRemoteSources(
    homeRoom: Room,
    visible: Room,
    remote: RemoteRoomPlan,
    myUsername: string | undefined
): void {
    if (!remote.sources) { remote.sources = {}; }
    let roadsPlaced = 0;
    let unfinishedRoadSites = visible.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_ROAD
    }).length;
    const remoteEntries = remoteEntryPositions(homeRoom, visible.name);

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
        const blockedApproach = (existing.blockedApproachX != null && existing.blockedApproachRoom != null && existing.blockedApproachRoom === visible.name)
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
                const localRoute = bestRemoteEntryRoute(remoteEntries, station, blockedApproach);
                const locallyReachable = !!localRoute && !localRoute.incomplete;
                if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                    console.log('room.controller: local path check ' + homeRoom.name + '->' + visible.name +
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
                    existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, visible.name, route.path.length);
                    const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                    existing.pathUpdatedAt = Game.time - retryOffset;
                    latestPath = hasCachedPath ? cachedPath : [];
                    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log(
                            'room.controller: station not locally reachable ' + homeRoom.name + '->' + visible.name +
                            ' source=' + source.id
                        );
                    }
                }
            } else {
                existing.routeAccessible = false;
                existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, visible.name, route.path.length);
                const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                existing.pathUpdatedAt = Game.time - retryOffset;
                latestPath = hasCachedPath ? cachedPath : [];
                if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                    console.log(
                        'room.controller: incomplete remote path ' + homeRoom.name + '->' + visible.name +
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
                    unfinishedRoadSites,
                    REMOTE_PLANNING_LOG_INTERVAL
                );
                roadsPlaced += placed;
                unfinishedRoadSites += placed;
            }
        }
    }
}
