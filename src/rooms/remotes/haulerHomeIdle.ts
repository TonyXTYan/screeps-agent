import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { hashString } from '../../utils/hash';
import { closest } from '../../utils/selection';

const REMOTE_HAULER_WANDER_TICKS = 35;
const REMOTE_HAULER_WANDER_MIN_RANGE = 6;
const REMOTE_HAULER_WANDER_MAX_RANGE = 8;

export function assignRemoteHaulerHomeIdle(creep: Creep, homeRoomName: string): boolean {
    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = closest(creep, homeRoom.find(FIND_MY_SPAWNS));
    if (!spawn) {
        setJob(creep, 'idle', homeRoom.storage ?? homeRoom.controller);
        return true;
    }

    const target = remoteHaulerWanderTarget(creep, spawn);
    if (!creep.pos.inRangeTo(target, 1)) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#7dd3fc' } });
    }
    setTravelJob(creep, homeRoomName);
    return true;
}

export function clearRemoteHaulerWanderMemory(creep: Creep): void {
    creep.memory.remoteHaulerWanderX = undefined;
    creep.memory.remoteHaulerWanderY = undefined;
    creep.memory.remoteHaulerWanderUntil = undefined;
}

function remoteHaulerWanderTarget(creep: Creep, spawn: StructureSpawn): RoomPosition {
    if (creep.memory.remoteHaulerWanderX != null &&
        creep.memory.remoteHaulerWanderY != null &&
        creep.memory.remoteHaulerWanderUntil &&
        creep.memory.remoteHaulerWanderUntil > Game.time) {
        const current = new RoomPosition(
            creep.memory.remoteHaulerWanderX,
            creep.memory.remoteHaulerWanderY,
            spawn.room.name
        );
        if (current.getRangeTo(spawn.pos) >= REMOTE_HAULER_WANDER_MIN_RANGE) { return current; }
    }

    const terrain = spawn.room.getTerrain();
    const radiusSpread = REMOTE_HAULER_WANDER_MAX_RANGE - REMOTE_HAULER_WANDER_MIN_RANGE + 1;
    const seed = hashString(creep.name) + Game.time;

    for (let i = 0; i < 24; i++) {
        const radius = REMOTE_HAULER_WANDER_MIN_RANGE + ((seed + i) % radiusSpread);
        const angle = ((seed * 31 + i * 67) % 360) * (Math.PI / 180);
        const x = clampRoomCoord(Math.round(spawn.pos.x + Math.cos(angle) * radius));
        const y = clampRoomCoord(Math.round(spawn.pos.y + Math.sin(angle) * radius));
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

        const candidate = new RoomPosition(x, y, spawn.room.name);
        if (candidate.getRangeTo(spawn.pos) < REMOTE_HAULER_WANDER_MIN_RANGE) { continue; }
        const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART);
        if (blocked) { continue; }

        creep.memory.remoteHaulerWanderX = x;
        creep.memory.remoteHaulerWanderY = y;
        creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
        return candidate;
    }

    const fallback = new RoomPosition(
        clampRoomCoord(spawn.pos.x + REMOTE_HAULER_WANDER_MIN_RANGE),
        clampRoomCoord(spawn.pos.y),
        spawn.room.name
    );
    creep.memory.remoteHaulerWanderX = fallback.x;
    creep.memory.remoteHaulerWanderY = fallback.y;
    creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
    return fallback;
}

function clampRoomCoord(value: number): number {
    return Math.max(1, Math.min(48, value));
}
