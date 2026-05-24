import {
    bestRemoteEntryRoute,
    deserializeRemotePath,
    fallbackRemotePathDistance,
    serializeRemotePath
} from './pathing';

const REMOTE_PATH_REFRESH_INTERVAL = 5000;
const REMOTE_INACCESSIBLE_RETRY_TICKS = 500;
const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
const REMOTE_PLANNING_LOG_INTERVAL = 100;

export function refreshRemoteSourcePathing(
    homeRoom: Room,
    visible: Room,
    source: Source,
    existing: RemoteSourcePlan,
    station: RoomPosition | null,
    remoteEntries: RoomPosition[],
    blockedApproach: RoomPosition | undefined
): RoomPosition[] {
    const anchor = homeRoom.storage ?? homeRoom.find(FIND_MY_SPAWNS)[0];
    const pathRetryInterval = existing.routeAccessible === false
        ? REMOTE_INACCESSIBLE_RETRY_TICKS
        : REMOTE_PATH_REFRESH_INTERVAL;
    const pathStale = !existing.pathUpdatedAt || Game.time - existing.pathUpdatedAt > pathRetryInterval;
    const cachedPath = deserializeRemotePath(existing.pathSerialized);
    const hasCachedPath = cachedPath.length > 0;

    if (!anchor || !station || (existing.pathDistance && hasCachedPath && !pathStale && existing.routeAccessible !== undefined)) {
        return !pathStale ? cachedPath : [];
    }

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
            existing.pathDistance = route.path.length;
            existing.pathSerialized = serializeRemotePath(route.path);
            existing.pathUpdatedAt = Game.time;
            return route.path;
        }

        existing.routeAccessible = false;
        existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, visible.name, route.path.length);
        const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
        existing.pathUpdatedAt = Game.time - retryOffset;
        if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
            console.log(
                'room.controller: station not locally reachable ' + homeRoom.name + '->' + visible.name +
                ' source=' + source.id
            );
        }
        return hasCachedPath ? cachedPath : [];
    }

    existing.routeAccessible = false;
    existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, visible.name, route.path.length);
    const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
    existing.pathUpdatedAt = Game.time - retryOffset;
    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
        console.log(
            'room.controller: incomplete remote path ' + homeRoom.name + '->' + visible.name +
            ' source=' + source.id +
            ' partial=' + route.path.length +
            ' fallback=' + existing.pathDistance
        );
    }
    return hasCachedPath ? cachedPath : [];
}
