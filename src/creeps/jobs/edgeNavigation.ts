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
