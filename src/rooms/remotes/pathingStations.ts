export function countOpenTilesAround(terrain: RoomTerrain, x: number, y: number): number {
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

export function remoteEntryPositions(homeRoom: Room, remoteRoomName: string): RoomPosition[] {
    const exitDirFromHome = Game.map.findExit(homeRoom.name, remoteRoomName);
    if (typeof exitDirFromHome !== 'number' || exitDirFromHome <= 0) { return []; }

    const entries: RoomPosition[] = [];
    for (const homeExit of homeRoom.find(exitDirFromHome as ExitConstant) as RoomPosition[]) {
        const mirrored = mirrorExitPositionIntoRoom(homeExit, remoteRoomName);
        if (mirrored) { entries.push(mirrored); }
    }
    return entries;
}

export function mirrorExitPositionIntoRoom(exit: RoomPosition, roomName: string): RoomPosition | null {
    if (exit.x === 0) { return new RoomPosition(49, exit.y, roomName); }
    if (exit.x === 49) { return new RoomPosition(0, exit.y, roomName); }
    if (exit.y === 0) { return new RoomPosition(exit.x, 49, roomName); }
    if (exit.y === 49) { return new RoomPosition(exit.x, 0, roomName); }
    return null;
}

export function bestRemoteEntryRoute(entries: RoomPosition[], station: RoomPosition, blockedPos?: RoomPosition): PathFinderPath | null {
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

export function findStationForSource(room: Room, source: Source, entries: RoomPosition[] = [], blockedPos?: RoomPosition): RoomPosition | null {
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

export function canPlaceContainerSite(position: RoomPosition): boolean {
    if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    const blockingStructure = position.lookFor(LOOK_STRUCTURES).some((s) =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_RAMPART);
    return !blockingStructure;
}
