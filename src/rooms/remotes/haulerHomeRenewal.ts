import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { acquireRenewSpawn, nearestSpawn } from '../../spawn.renewal';

export const REMOTE_HAULER_POST_TRIP_RENEW_START_TTL = 1000;
export const REMOTE_HAULER_RENEW_START_TTL = 500;
export const REMOTE_HAULER_RENEW_STOP_TTL = 1400;
const REMOTE_HAULER_RENEW_CRITICAL_TTL = 80;

export function manageRemoteHaulerRenewal(creep: Creep, homeRoomName: string, forceRenew: boolean): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    const alreadyRenewing = creep.memory.remoteRenewing === true;

    const homeRoom = Game.rooms[homeRoomName];
    if (!alreadyRenewing && homeRoom && shouldDeferRemoteHaulerRenewal(homeRoom, ttl)) {
        // Home room still needs energy: defer starting a new renew cycle so haulers
        // resume hauling/refill work. Once started, finish the cycle to avoid
        // one-tick renew bounces at the spawn.
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.memory.remoteRenewing && (forceRenew || ttl <= REMOTE_HAULER_RENEW_START_TTL)) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl > REMOTE_HAULER_RENEW_STOP_TTL) {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = acquireRenewSpawn(creep, homeRoom);
    if (!spawn) {
        const waitTarget = nearestSpawn(creep, homeRoom);
        if (waitTarget) {
            if (!creep.pos.isNearTo(waitTarget)) {
                creep.moveTo(waitTarget, { visualizePathStyle: { stroke: '#f5f57a' } });
            }
            setJob(creep, 'idle', waitTarget);
            return true;
        }
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#f5f57a' } });
        setJob(creep, 'idle', spawn);
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        setJob(creep, 'idle', spawn);
        return true;
    }

    creep.memory.remoteRenewing = false;
    return false;
}

function shouldDeferRemoteHaulerRenewal(homeRoom: Room, ttl: number): boolean {
    if (ttl <= REMOTE_HAULER_RENEW_CRITICAL_TTL) { return false; }
    if (homeRoom.memory.energyRecoveryActive === true) { return true; }
    return homeRoom.energyAvailable < homeRoom.energyCapacityAvailable;
}
