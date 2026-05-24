export {
    bestRemoteEntryRoute,
    canPlaceContainerSite,
    countOpenTilesAround,
    findStationForSource,
    mirrorExitPositionIntoRoom,
    remoteEntryPositions
} from './pathingStations';

export function sameRoomPosition(a: RoomPosition, b: RoomPosition): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

export function isRemoteExitApproach(pos: RoomPosition): boolean {
    return pos.x <= 2 || pos.y <= 2 || pos.x >= 47 || pos.y >= 47;
}

export function isSwampPathStep(pos: RoomPosition): boolean {
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    return room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP;
}

export function remoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return sourcePlan?.routeHealth === 'degraded';
}

export function serializeRemotePath(path: RoomPosition[]): string {
    return JSON.stringify(path.map((step) => [step.x, step.y, step.roomName]));
}

export function deserializeRemotePath(serialized?: string): RoomPosition[] {
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

export function fallbackRemotePathDistance(homeRoomName: string, remoteRoomName: string, partialPathLength: number): number {
    try {
        const linearDistance = Math.max(1, Game.map.getRoomLinearDistance(homeRoomName, remoteRoomName));
        return Math.max(partialPathLength, linearDistance * 50, 25);
    } catch {
        return Math.max(partialPathLength, 25);
    }
}

export function estimateRemoteDistance(
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
