const REMOTE_MAX_STATION_STALLS = 3;
const REMOTE_MAX_STATION_FAILURES = 3;

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
        sourcePlan.blockedApproachX = pos.x;
        sourcePlan.blockedApproachY = pos.y;
        sourcePlan.blockedApproachRoom = pos.roomName;
        sourcePlan.stallCount = 0;
        const stationFailures = (sourcePlan.stationFailures ?? 0) + 1;
        sourcePlan.stationFailures = stationFailures;
        if (stationFailures < REMOTE_MAX_STATION_FAILURES) {
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
