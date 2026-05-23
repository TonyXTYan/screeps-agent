import { nudgeFromRoomEdge } from '../utils/path';
import { requestTrafficYieldForPath } from './traffic';

const MOVE_STUCK_REPATH_TICKS = 2;
const MOVE_STUCK_RESET_PATH_TICKS = 4;

function updateTravelStuckMemory(creep: Creep): void {
    const sameTile = creep.memory.travelLastX === creep.pos.x &&
        creep.memory.travelLastY === creep.pos.y &&
        creep.memory.travelLastRoom === creep.room.name;
    if (sameTile) {
        creep.memory.travelStuckTicks = (creep.memory.travelStuckTicks ?? 0) + 1;
    } else {
        creep.memory.travelLastX = undefined;
        creep.memory.travelLastY = undefined;
        creep.memory.travelLastRoom = undefined;
        creep.memory.travelStuckTicks = undefined;
    }
    creep.memory.travelLastX = creep.pos.x;
    creep.memory.travelLastY = creep.pos.y;
    creep.memory.travelLastRoom = creep.room.name;
}

export function getTarget<T extends RoomObject>(creep: Creep): T | null {
    const id = creep.memory.jobTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as T | null;
}

export function stationaryTarget(creep: Creep): RoomPosition | RoomObject | null {
    const x = creep.memory.stationX;
    const y = creep.memory.stationY;
    if (x != null && y != null) {
        return new RoomPosition(x, y, creep.room.name);
    }
    const id = creep.memory.stationaryTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as RoomObject | null;
}

export function atStation(creep: Creep, station: RoomPosition | RoomObject): boolean {
    if (station instanceof RoomPosition) {
        return creep.pos.isEqualTo(station);
    }
    if (station instanceof StructureContainer) {
        return creep.pos.isEqualTo(station.pos);
    }
    return creep.pos.isNearTo(station);
}

function wanderRandomAdjacent(creep: Creep): boolean {
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

export function moveToJobTarget(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    stroke: string,
    extra: MoveToOpts = {}
): number {
    updateTravelStuckMemory(creep);
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const needsPathReset = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
    const needsCreepBypass = stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS;
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

export function moveToWithdrawTarget(
    creep: Creep,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink,
    stroke: string
): number {
    return moveToJobTarget(creep, target, stroke);
}

export function mineralDepleted(creep: Creep): boolean {
    const id = creep.memory.jobTargetId;
    if (!id) { return true; }
    const mineral = Game.getObjectById(id as Id<Mineral>);
    return !mineral || mineral.mineralAmount === 0;
}
