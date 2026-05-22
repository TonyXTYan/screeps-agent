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

export function mirrorExitPositionIntoRoom(exit: RoomPosition, roomName: string): RoomPosition | null {
    if (exit.x === 0) { return new RoomPosition(49, exit.y, roomName); }
    if (exit.x === 49) { return new RoomPosition(0, exit.y, roomName); }
    if (exit.y === 0) { return new RoomPosition(exit.x, 49, roomName); }
    if (exit.y === 49) { return new RoomPosition(exit.x, 0, roomName); }
    return null;
}
