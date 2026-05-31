// Creep movement: path following, stuck detection, exit navigation, room-edge nudging.

import { requestTrafficYieldForPath } from './traffic';
import { mirrorExitPositionIntoRoom } from '../room/remote/routing';

// Cached per room pair (terrain is static, so this never needs eviction within a shard run).
// Key: "fromRoom=>toRoom". Value: valid exit coordinates (y for LEFT/RIGHT exits, x for TOP/BOTTOM),
// or null if every exit failed the PathFinder check (shouldn't happen; means complete wall).
const _validExitCoordCache = new Map<string, number[] | null>();

function cachedValidExitCoords(
    fromRoom: Room,
    toRoomName: string,
    exitDir: ExitConstant
): number[] | null {
    const key = `${fromRoom.name}=>${toRoomName}`;
    if (_validExitCoordCache.has(key)) { return _validExitCoordCache.get(key)!; }

    const toRoom = Game.rooms[toRoomName];
    if (!toRoom) { return null; } // not visible yet — don't cache, retry next time

    const spawns = toRoom.find(FIND_MY_SPAWNS);
    const center = toRoom.storage?.pos ?? (spawns.length > 0 ? spawns[0].pos : undefined);
    if (!center) { return null; } // no interior target known — don't cache

    // Block all room-edge tiles in the PathFinder. nudgeFromRoomEdge always pushes creeps away
    // from x/y=0/49, so any path that relies on travelling along the room edge is not actually
    // usable — the creep would be bounced back every tick. Blocking the edges here means a pocket
    // reachable only via the edge wall (e.g. x=47 is a wall line, only x=48/49 open) correctly
    // fails the check.
    const blockEdgeTiles = (roomName: string) => {
        if (roomName !== toRoomName) { return false as unknown as CostMatrix; }
        const cm = new PathFinder.CostMatrix();
        for (let i = 0; i <= 49; i++) {
            cm.set(0, i, 255); cm.set(49, i, 255);
            cm.set(i, 0, 255); cm.set(i, 49, 255);
        }
        return cm;
    };

    const allExits = fromRoom.find(exitDir) as RoomPosition[];
    const useY = exitDir === LEFT || exitDir === RIGHT;
    const validCoords: number[] = [];

    for (const exit of allExits) {
        const mirrored = mirrorExitPositionIntoRoom(exit, toRoomName);
        if (!mirrored) { continue; }
        // Step one tile inward from the room edge so PathFinder starts inside the room.
        const innerX = mirrored.x === 49 ? 48 : (mirrored.x === 0 ? 1 : mirrored.x);
        const innerY = mirrored.y === 49 ? 48 : (mirrored.y === 0 ? 1 : mirrored.y);
        const innerPos = new RoomPosition(innerX, innerY, toRoomName);
        const pfResult = PathFinder.search(
            innerPos, { pos: center, range: 1 },
            { maxRooms: 1, roomCallback: blockEdgeTiles }
        );
        if (!pfResult.incomplete) {
            validCoords.push(useY ? exit.y : exit.x);
        }
    }

    const result = validCoords.length > 0 ? validCoords : null;
    _validExitCoordCache.set(key, result);
    console.log(`[EXIT-CACHE] ${fromRoom.name}=>${toRoomName}: ${validCoords.length}/${allExits.length} accessible entry positions cached`);
    return result;
}

const MOVE_STUCK_REPATH_TICKS = 2;
const MOVE_STUCK_RESET_PATH_TICKS = 4;

export function wanderRandomAdjacent(creep: Creep): boolean {
    const dirs: DirectionConstant[] = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    const dxs: number[] = [0, 1, 1, 1, 0, -1, -1, -1];
    const dys: number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
    const seed = (creep.name.charCodeAt(creep.name.length - 1) || 0) + Game.time;
    for (let i = 0; i < 8; i++) {
        const dir = dirs[(seed + i) % 8];
        const nx = creep.pos.x + dxs[(seed + i) % 8];
        const ny = creep.pos.y + dys[(seed + i) % 8];
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) { continue; }
        const room = Game.rooms[creep.room.name];
        if (room && room.getTerrain().get(nx, ny) === TERRAIN_MASK_WALL) { continue; }
        creep.move(dir);
        return true;
    }
    return false;
}

export function clearTravelStuckMemory(creep: Creep): void {
    creep.memory.travelLastX = undefined;
    creep.memory.travelLastY = undefined;
    creep.memory.travelLastRoom = undefined;
    creep.memory.travelStuckTicks = undefined;
}

export function updateTravelStuckMemory(creep: Creep): void {
    if (creep.fatigue > 0) {
        // Creep can't move while fatigued — not stuck, just slow on swamp/non-road terrain.
        // Keep position memory current so the comparison is correct once fatigue clears.
        creep.memory.travelLastX = creep.pos.x;
        creep.memory.travelLastY = creep.pos.y;
        creep.memory.travelLastRoom = creep.room.name;
        return;
    }
    const sameTile = creep.memory.travelLastX === creep.pos.x &&
        creep.memory.travelLastY === creep.pos.y &&
        creep.memory.travelLastRoom === creep.room.name;
    if (sameTile) {
        creep.memory.travelStuckTicks = (creep.memory.travelStuckTicks ?? 0) + 1;
    } else {
        clearTravelStuckMemory(creep);
    }
    creep.memory.travelLastX = creep.pos.x;
    creep.memory.travelLastY = creep.pos.y;
    creep.memory.travelLastRoom = creep.room.name;
}

export function nudgeFromRoomEdge(creep: Creep): boolean {
    if (creep.pos.x === 0 && creep.pos.y === 0) {
        creep.move(BOTTOM_RIGHT);
        return true;
    }
    if (creep.pos.x === 0 && creep.pos.y === 49) {
        creep.move(TOP_RIGHT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 0) {
        creep.move(BOTTOM_LEFT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 49) {
        creep.move(TOP_LEFT);
        return true;
    }

    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return true;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return true;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return true;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
        return true;
    }

    return false;
}

export function isOnRequestedExitEdge(creep: Creep, exitDir: number): boolean {
    if (typeof exitDir !== 'number' || exitDir < TOP || exitDir > LEFT) { return false; }
    if (exitDir === TOP) { return creep.pos.y === 0; }
    if (exitDir === RIGHT) { return creep.pos.x === 49; }
    if (exitDir === BOTTOM) { return creep.pos.y === 49; }
    return creep.pos.x === 0;
}

export function sidestepAlongExitEdge(creep: Creep, exitDir: ExitConstant): boolean {
    const candidates = exitDir === LEFT || exitDir === RIGHT
        ? [TOP, BOTTOM]
        : [LEFT, RIGHT];
    const order = ((Game.time + creep.name.length) % 2 === 0)
        ? candidates
        : [candidates[1], candidates[0]];

    for (const dir of order) {
        if (!canStep(creep, dir)) { continue; }
        const code = creep.move(dir);
        if (code === OK) { return true; }
    }
    return false;
}

function canStep(creep: Creep, dir: DirectionConstant): boolean {
    const [dx, dy] = directionDelta(dir);
    const nx = creep.pos.x + dx;
    const ny = creep.pos.y + dy;
    if (nx < 0 || nx > 49 || ny < 0 || ny > 49) { return false; }

    const room = Game.rooms[creep.room.name];
    if (!room) { return false; }
    if (room.getTerrain().get(nx, ny) === TERRAIN_MASK_WALL) { return false; }

    const target = new RoomPosition(nx, ny, creep.room.name);
    if (target.lookFor(LOOK_CREEPS).some((other) => other.id !== creep.id)) { return false; }
    const blocked = target.lookFor(LOOK_STRUCTURES).some((structure) =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_CONTAINER &&
        structure.structureType !== STRUCTURE_RAMPART);
    return !blocked;
}

function directionDelta(dir: DirectionConstant): [number, number] {
    if (dir === TOP) { return [0, -1]; }
    if (dir === TOP_RIGHT) { return [1, -1]; }
    if (dir === RIGHT) { return [1, 0]; }
    if (dir === BOTTOM_RIGHT) { return [1, 1]; }
    if (dir === BOTTOM) { return [0, 1]; }
    if (dir === BOTTOM_LEFT) { return [-1, 1]; }
    if (dir === LEFT) { return [-1, 0]; }
    return [-1, -1];
}

export function nearestExitTileToRoom(creep: Creep, roomName: string): RoomPosition | null {
    const exitDir = Game.map.findExit(creep.room, roomName);
    if (typeof exitDir !== 'number' || exitDir < TOP || exitDir > LEFT) { return null; }

    const stationExit = exitTileClosestToRemoteStation(creep, roomName, exitDir as ExitConstant);
    if (stationExit) { return stationExit; }

    // Prefer exit tiles whose mirrored entry positions in roomName have a navigable path to the
    // room interior. This prevents routing creeps into terrain pockets at the room edge (e.g. a
    // wall cluster directly behind an exit tile that would trap them on entry). The valid-coord
    // set is computed once per room pair via PathFinder and cached for the shard run.
    const validCoords = cachedValidExitCoords(creep.room, roomName, exitDir as ExitConstant);
    if (validCoords) {
        const useY = exitDir === LEFT || exitDir === RIGHT;
        const allExits = creep.room.find(exitDir as ExitConstant) as RoomPosition[];
        const filtered = allExits.filter(e => validCoords.includes(useY ? e.y : e.x));
        if (filtered.length > 0) {
            let best: RoomPosition | null = null;
            let bestDist = Infinity;
            for (const exit of filtered) {
                const dist = creep.pos.getRangeTo(exit);
                if (dist < bestDist) { bestDist = dist; best = exit; }
            }
            if (best) { return best; }
        }
    }

    const byPath = creep.pos.findClosestByPath(exitDir as ExitConstant, {
        ignoreCreeps: false
    }) as RoomPosition | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByRange(exitDir as ExitConstant) as RoomPosition | null;
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

export function moveToWithdrawTarget(
    creep: Creep,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink,
    stroke: string
): number {
    return moveToJobTarget(creep, target, stroke);
}

export function moveToJobTarget(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    stroke: string,
    extra: MoveToOpts = {}
): number {
    updateTravelStuckMemory(creep);
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const needsDynamicTraffic = stuckTicks >= MOVE_STUCK_REPATH_TICKS;
    const needsCreepBypass = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const needsPathReset = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const targetRange = extra.range ?? 1;

    if (needsDynamicTraffic) {
        requestTrafficYieldForPath(creep, targetPos, targetRange);
    }

    const moveOpts: MoveToOpts = {
        ...extra,
        reusePath: needsPathReset ? 0 : (extra.reusePath ?? 10),
        ignoreCreeps: needsCreepBypass ? true : (extra.ignoreCreeps ?? false),
        visualizePathStyle: {
            ...(extra.visualizePathStyle ?? {}),
            stroke
        }
    };

    if (needsPathReset || extra.reusePath === 0) {
        (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
    }

    const code = creep.moveTo(target, {
        ...moveOpts
    });
    if (code === ERR_NO_PATH || (needsPathReset && creep.fatigue === 0)) {
        if (!nudgeFromRoomEdge(creep) && needsPathReset) {
            if (targetPos && creep.room.name === targetPos.roomName) {
                const pfResult = PathFinder.search(creep.pos, { pos: targetPos, range: targetRange }, { maxRooms: 1 });
                if (pfResult.path.length > 0 && pfResult.path[0].getRangeTo(creep.pos) <= 1) {
                    creep.move(creep.pos.getDirectionTo(pfResult.path[0]));
                    return OK;
                }
            }
            if (Game.time % 25 === 0) {
                console.log('moveToJobTarget: ' + creep.name + ' stuck ' + stuckTicks + 't at ' + creep.pos + ' room=' + creep.room.name);
            }
            wanderRandomAdjacent(creep);
        }
    }
    return code;
}
