import { bodyCost } from '../creeps/capabilities';
import { acquireRenewSpawn, nearestSpawn } from './spawn';

const HOME_RENEW_MIN_BODY_COST = 1000;
const HOME_RENEW_START_TTL = 250;
const HOME_RENEW_STOP_TTL = 1300;
const HOME_RENEW_CRITICAL_TTL = 120;

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
