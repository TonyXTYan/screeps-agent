import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { acquireRenewSpawn, nearestSpawn } from '../../spawn.renewal';
import { estimateRemoteDistance } from './pathing';

const REMOTE_RENEW_MIN_TTL = 220;
const REMOTE_RENEW_BUFFER_TICKS = 80;
const REMOTE_RENEW_HYSTERESIS = 140;

type RemoteRenewCapabilities = {
    claim: number;
};

export function manageRemoteRenewal(
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: RemoteRenewCapabilities,
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    if (archetype === 'remoteMiner' || archetype === 'remoteMaintainer') {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (capabilities.claim > 0) { return false; } // CLAIM creeps are short-lived and not renewable.

    const oneWayDistance = estimateRemoteDistance(creep, homeRoomName, remoteRoomName, remotePlan);
    const renewStartTtl = Math.max(REMOTE_RENEW_MIN_TTL, oneWayDistance + REMOTE_RENEW_BUFFER_TICKS);
    const renewStopTtl = Math.min(1500, renewStartTtl + REMOTE_RENEW_HYSTERESIS);

    if (!creep.memory.remoteRenewing && ttl <= renewStartTtl) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl >= renewStopTtl) {
        creep.memory.remoteRenewing = false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
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

    // If renew is impossible, release the renew lock so the creep keeps working.
    creep.memory.remoteRenewing = false;
    return false;
}
