import { ensureArchetype } from '../../creep.capabilities';

const REMOTE_SCOUT_CROWD_THRESHOLD = 4;

export function countRemoteScouts(homeRoomName: string, remoteRoom: string): number {
    return remoteScoutPack(homeRoomName, remoteRoom).length;
}

export function hasAssignedNonScoutRemoteCreep(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        if (archetype === 'remoteScout') { continue; }
        if (archetype !== 'remoteMiner' &&
            archetype !== 'remoteHauler' &&
            archetype !== 'remoteMaintainer' &&
            archetype !== 'claimer') {
            continue;
        }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        return true;
    }
    return false;
}

export function remoteScoutPack(homeRoomName: string, remoteRoom: string): string[] {
    const names: string[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (ensureArchetype(creep) !== 'remoteScout') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.homeRoom && creep.memory.homeRoom !== homeRoomName) { continue; }
        names.push(creep.name);
    }
    names.sort();
    return names;
}

export function remoteRoomCrowdedForScout(creep: Creep, homeRoomName: string, remoteRoom: string): boolean {
    const visibleRemote = Game.rooms[remoteRoom];
    if (!visibleRemote) { return false; }

    let others = 0;
    const roomCreeps = visibleRemote.find(FIND_MY_CREEPS);
    for (const other of roomCreeps) {
        if (other.id === creep.id) { continue; }
        if (other.memory.homeRoom && other.memory.homeRoom !== homeRoomName) { continue; }
        others++;
        if (others >= REMOTE_SCOUT_CROWD_THRESHOLD) { return true; }
    }
    return false;
}
