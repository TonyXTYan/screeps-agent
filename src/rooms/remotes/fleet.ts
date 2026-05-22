import { ensureArchetype, getCreepCapabilities } from '../../creep.capabilities';
export {
    countRemoteStandbyMiners,
    countSourceLessRemoteStandbyMiners,
    findDyingRemoteMiner,
    hasActiveRemoteMinerForSource,
    hasRemoteStandbyMinerForSource,
    sourceNeedingBlankStandbyMiner,
    sourceNeedingStandbyReplacement
} from './fleetStandby';

export function creepsForHomeRoom(homeRoomName: string): Creep[] {
    const creeps: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom === homeRoomName) {
            creeps.push(creep);
            continue;
        }
        if (!creep.memory.homeRoom && creep.room.name === homeRoomName) {
            creeps.push(creep);
        }
    }
    return creeps;
}

export function countActiveRemoteMinersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        count++;
    }
    return count;
}

export function countRemoteHaulersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        count++;
    }
    return count;
}

export function countFleetForArchetype(creeps: Creep[], archetype: CreepArchetype): number {
    let count = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) === archetype) { count++; }
    }
    return count;
}

export function remoteClaimerCount(creeps: Creep[], remoteRoom: string, mode: RemoteRoomMode, minClaimParts: number = 1): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'claimer') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteMode !== mode) { continue; }
        if (getCreepCapabilities(creep).claim < minClaimParts) { continue; }
        count++;
    }
    return count;
}
