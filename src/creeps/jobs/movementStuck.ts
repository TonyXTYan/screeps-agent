export const MOVE_STUCK_REPATH_TICKS = 2;
export const MOVE_STUCK_RESET_PATH_TICKS = 4;
export const MOVE_STUCK_FORCED_STEP_TICKS = 6;
export const MOVE_STUCK_ESCAPE_TICKS = 12;

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

export function resetMovePathMemory(creep: Creep): void {
    (creep.memory as CreepMemory & { _move?: unknown })._move = undefined;
}
