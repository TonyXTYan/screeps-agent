export function nearestExitTileToRoom(creep: Creep, roomName: string): RoomPosition | null {
    const exitDir = Game.map.findExit(creep.room, roomName);
    if (typeof exitDir !== 'number' || exitDir < TOP || exitDir > LEFT) { return null; }

    const stationExit = exitTileClosestToRemoteStation(creep, roomName, exitDir as ExitConstant);
    if (stationExit) { return stationExit; }

    const byPath = creep.pos.findClosestByPath(exitDir as ExitConstant, {
        ignoreCreeps: false
    }) as RoomPosition | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByRange(exitDir as ExitConstant) as RoomPosition | null;
}

export function forceStepTowardsRoomExit(
    creep: Creep,
    targetRoomName: string,
    preferredExit: RoomPosition
): number {
    const primaryDir = Game.map.findExit(creep.room, targetRoomName);
    const allGoals: Array<{ pos: RoomPosition; range: number }> = [];

    if (typeof primaryDir === 'number' && primaryDir >= TOP && primaryDir <= LEFT) {
        const primaryTiles = creep.room.find(primaryDir as ExitConstant);
        for (const tile of primaryTiles) {
            allGoals.push({ pos: tile, range: 0 });
        }
    }

    if (allGoals.length === 0) {
        allGoals.push({ pos: preferredExit, range: 0 });
    }

    const direct = PathFinder.search(creep.pos, allGoals, { maxRooms: 1 });
    if (direct.path.length > 0 && direct.path[0].getRangeTo(creep.pos) <= 1) {
        return creep.move(creep.pos.getDirectionTo(direct.path[0]));
    }

    const exits = Game.map.describeExits(creep.room.name);
    if (!exits) { return ERR_NO_PATH; }
    for (const dirKey in exits) {
        const altDir = Number(dirKey) as ExitConstant;
        const tiles = creep.room.find(altDir);
        if (tiles.length === 0) { continue; }
        const alt = PathFinder.search(
            creep.pos,
            tiles.map(tile => ({ pos: tile, range: 0 })),
            { maxRooms: 1 }
        );
        if (alt.path.length > 0 && alt.path[0].getRangeTo(creep.pos) <= 1) {
            return creep.move(creep.pos.getDirectionTo(alt.path[0]));
        }
    }

    return ERR_NO_PATH;
}

function exitTileClosestToRemoteStation(
    creep: Creep,
    roomName: string,
    exitDir: ExitConstant
): RoomPosition | null {
    if (creep.memory.remoteRoom !== roomName) { return null; }
    const stationX = creep.memory.stationX;
    const stationY = creep.memory.stationY;
    if (stationX == null || stationY == null) { return null; }

    const exits = creep.room.find(exitDir) as RoomPosition[];
    if (exits.length === 0) { return null; }

    const station = new RoomPosition(stationX, stationY, roomName);
    let best: RoomPosition | null = null;
    let bestScore = Infinity;
    for (const exit of exits) {
        const entry = mirrorExitPositionIntoRoom(exit, roomName);
        if (!entry) { continue; }
        const score = creep.pos.getRangeTo(exit) + entry.getRangeTo(station);
        if (score < bestScore) {
            bestScore = score;
            best = exit;
        }
    }
    return best;
}

function mirrorExitPositionIntoRoom(exit: RoomPosition, roomName: string): RoomPosition | null {
    if (exit.x === 0) { return new RoomPosition(49, exit.y, roomName); }
    if (exit.x === 49) { return new RoomPosition(0, exit.y, roomName); }
    if (exit.y === 0) { return new RoomPosition(exit.x, 49, roomName); }
    if (exit.y === 49) { return new RoomPosition(exit.x, 0, roomName); }
    return null;
}
