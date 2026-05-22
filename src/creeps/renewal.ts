import { bodyCost } from '../creep.capabilities';
import { acquireRenewSpawn, nearestSpawn } from '../spawn.renewal';

const HOME_RENEW_MIN_BODY_COST = 1000;
const HOME_RENEW_START_TTL = 250;
const HOME_RENEW_STOP_TTL = 1300;
const HOME_RENEW_CRITICAL_TTL = 120;
const STANDBY_MINER_PARK_MIN_RANGE = 2;
const STANDBY_MINER_PARK_MAX_RANGE = 4;

export function tryRenewHomeCreep(creep: Creep): boolean {
    if (creep.memory.remoteRoom) { return false; }
    if (creep.memory.role === 'defender') { return false; }

    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }

    if (creep.body.some(b => b.type === CLAIM)) { return false; }
    if (bodyCost(creep.body.map(b => b.type)) < HOME_RENEW_MIN_BODY_COST) { return false; }

    const homeRoomName = creep.memory.homeRoom ?? creep.room.name;
    if (creep.room.name !== homeRoomName) { return false; }
    const room = Game.rooms[homeRoomName];
    if (!room) { return false; }

    const renewBlockedByEconomy =
        room.memory.energyRecoveryActive === true ||
        room.energyAvailable < Math.floor(room.energyCapacityAvailable * 0.9);

    // Only block starting a new renew cycle when economy is stressed.
    // If already renewing, let the cycle complete to avoid spawn-bounce.
    if (renewBlockedByEconomy && !creep.memory.renewing && ttl > HOME_RENEW_CRITICAL_TTL) {
        return false;
    }

    if (!creep.memory.renewing && ttl <= HOME_RENEW_START_TTL) {
        creep.memory.renewing = true;
    }
    if (creep.memory.renewing && ttl >= HOME_RENEW_STOP_TTL) {
        creep.memory.renewing = false;
    }
    if (!creep.memory.renewing) { return false; }

    const spawn = acquireRenewSpawn(creep, room);

    if (!spawn) {
        if (ttl <= HOME_RENEW_CRITICAL_TTL) {
            const anySpawn = nearestSpawn(creep, room);
            if (anySpawn && !creep.pos.isNearTo(anySpawn)) {
                creep.moveTo(anySpawn, { range: 1, visualizePathStyle: { stroke: '#f5f57a' } });
            }
            return true;
        }
        creep.memory.renewing = false;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { range: 1, visualizePathStyle: { stroke: '#f5f57a' } });
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        return true;
    }

    creep.memory.renewing = false;
    return false;
}

export function tryRenewStandbyMiner(creep: Creep): void {
    if (!creep.memory.remoteStandby) { return; }
    if (creep.memory.assignedSourceId || creep.memory.sourceId) { return; }

    const homeSpawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS) as StructureSpawn | null;
    if (!homeSpawn) { return; }
    parkStandbyMinerAwayFromSpawn(creep, homeSpawn);
}

function parkStandbyMinerAwayFromSpawn(creep: Creep, spawn: StructureSpawn): void {
    const range = creep.pos.getRangeTo(spawn);
    if (range >= STANDBY_MINER_PARK_MIN_RANGE && range <= STANDBY_MINER_PARK_MAX_RANGE) { return; }

    const park = standbyMinerParkingTarget(creep, spawn);
    if (!park) { return; }
    creep.moveTo(park, { reusePath: 6, visualizePathStyle: { stroke: '#d1d5db' } });
}

function standbyMinerParkingTarget(creep: Creep, spawn: StructureSpawn): RoomPosition | null {
    const terrain = creep.room.getTerrain();
    let best: RoomPosition | null = null;
    let bestRange = Infinity;

    for (let dx = -STANDBY_MINER_PARK_MAX_RANGE; dx <= STANDBY_MINER_PARK_MAX_RANGE; dx++) {
        for (let dy = -STANDBY_MINER_PARK_MAX_RANGE; dy <= STANDBY_MINER_PARK_MAX_RANGE; dy++) {
            const x = spawn.pos.x + dx;
            const y = spawn.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }

            const rangeFromSpawn = Math.max(Math.abs(dx), Math.abs(dy));
            if (rangeFromSpawn < STANDBY_MINER_PARK_MIN_RANGE || rangeFromSpawn > STANDBY_MINER_PARK_MAX_RANGE) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const pos = new RoomPosition(x, y, creep.room.name);
            if (pos.lookFor(LOOK_CREEPS).some((other) => other.id !== creep.id)) { continue; }
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }

            const rangeFromCreep = creep.pos.getRangeTo(pos);
            if (rangeFromCreep < bestRange) {
                best = pos;
                bestRange = rangeFromCreep;
            }
        }
    }

    return best;
}
