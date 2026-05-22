import { ensureArchetype } from '../../creep.capabilities';
import { remoteSourceRouteDegraded } from './pathing';

export function hasRemoteMaintainer(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.remoteRoom === remoteRoom) { return true; }
    }
    return false;
}

export function remoteNeedsMaintainer(remoteRoom: string): boolean {
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) { return true; }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

export function remoteNeedsRouteHealthMaintainer(remoteRoom: string, remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlanHasDegradedRoute(remotePlan)) { return false; }
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    }).length > 0) {
        return true;
    }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

function remotePlanHasDegradedRoute(remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlan?.sources) { return false; }
    for (const sourceId in remotePlan.sources) {
        if (remoteSourceRouteDegraded(remotePlan.sources[sourceId])) { return true; }
    }
    return false;
}
