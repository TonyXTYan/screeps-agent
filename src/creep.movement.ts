// Creep movement: path following, stuck detection, exit navigation, room-edge nudging.

import { requestTrafficYieldForPath } from './creep.traffic';
import { mirrorExitPositionIntoRoom } from './room.remote.routing';

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

    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
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
