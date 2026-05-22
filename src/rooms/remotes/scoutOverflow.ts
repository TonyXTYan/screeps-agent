import { clearJob } from '../../creep.jobRunner';
import { setTravelJob } from '../../creeps/jobs/memory';
import { findHostiles } from '../../hostileUtils';
import { hashString } from '../../utils/hash';

const REMOTE_SCOUT_WANDER_TICKS = 120;

export function assignOverflowRemoteScout(
    creep: Creep,
    homeRoomName: string,
    wanderFallbackRoom: string = homeRoomName
): boolean {
    const hostiles = findHostiles(creep.room);
    if (hostiles.length > 0) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const wanderExpired = !creep.memory.scoutWanderUntil || creep.memory.scoutWanderUntil <= Game.time;
    const reachedWanderRoom = creep.memory.scoutWanderRoom === creep.room.name;
    if (!creep.memory.scoutWanderRoom || wanderExpired || reachedWanderRoom) {
        creep.memory.scoutWanderRoom = chooseWanderRoom(creep, wanderFallbackRoom);
        creep.memory.scoutWanderUntil = Game.time + REMOTE_SCOUT_WANDER_TICKS;
    }

    const targetRoom = creep.memory.scoutWanderRoom ?? wanderFallbackRoom;
    if (creep.room.name !== targetRoom) {
        setTravelJob(creep, targetRoom);
        return true;
    }

    const targetPos = wanderPointInRoom(creep, targetRoom);
    if (!creep.pos.inRangeTo(targetPos, 3)) {
        creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#9ec8ff' } });
    }
    clearJob(creep);
    return true;
}

function chooseWanderRoom(creep: Creep, fallbackRoom: string): string {
    const exits = Game.map.describeExits(creep.room.name);
    const rooms: string[] = [];
    if (exits) {
        for (const key in exits) {
            const roomName = exits[key as unknown as keyof typeof exits];
            if (roomName) { rooms.push(roomName); }
        }
    }
    if (rooms.length === 0) { return fallbackRoom; }
    const seed = hashString(creep.name) + Game.time;
    return rooms[Math.abs(seed) % rooms.length];
}

function wanderPointInRoom(creep: Creep, roomName: string): RoomPosition {
    const visibleRoom = Game.rooms[roomName];
    if (visibleRoom) {
        const terrain = visibleRoom.getTerrain();
        for (let i = 0; i < 12; i++) {
            const seedA = hashString(creep.name + ':x:' + i);
            const seedB = hashString(creep.name + ':y:' + i);
            const x = 3 + (Math.abs(seedA) % 44);
            const y = 3 + (Math.abs(seedB) % 44);
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
            const pos = new RoomPosition(x, y, roomName);
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            return pos;
        }
    }

    const seedA = hashString(creep.name + ':x:fallback');
    const seedB = hashString(creep.name + ':y:fallback');
    const x = 10 + (Math.abs(seedA) % 31);
    const y = 10 + (Math.abs(seedB) % 31);
    return new RoomPosition(x, y, roomName);
}
