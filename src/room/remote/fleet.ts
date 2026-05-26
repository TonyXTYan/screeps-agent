// Remote fleet composition: counting, standby management, slot calculations, scout wander.

import { ensureArchetype, getCreepCapabilities, getBodyCapabilities, planBodyForArchetype } from '../../creep/capabilities';
import { findHostiles } from '../../hostileUtils';
import { setTravelJob } from '../jobMemory';
import { clearJob } from '../../creep/jobRunner';
import { RoomControllerContext } from '../types';
import {
    REMOTE_STANDBY_TRIGGER_TTL, REMOTE_SCOUT_CROWD_THRESHOLD, REMOTE_SCOUT_WANDER_TICKS,
    REMOTE_REPLACEMENT_BUFFER_TICKS,
} from '../constants';

// ── Home fleet helpers ────────────────────────────────────────────────────────

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

export function countFleetForArchetype(creeps: Creep[], archetype: CreepArchetype): number {
    let count = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) === archetype) { count++; }
    }
    return count;
}

export function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

// ── Remote miner counts ───────────────────────────────────────────────────────

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

export function countRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { count++; }
    }
    return count;
}

export function countSourceLessRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if (creep.memory.assignedSourceId || creep.memory.sourceId) { continue; }
        count++;
    }
    return count;
}

export function hasRemoteStandbyMinerForSource(creeps: Creep[], remoteRoom: string, sourceId: string, excludeCreepId?: string): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        return true;
    }
    return false;
}

export function countRemoteMinersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

export function findDyingRemoteMiner(
    creeps: Creep[],
    remoteRoom: string
): Creep | null {
    let best: Creep | null = null;
    let lowestTtl = Infinity;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if (!(creep.memory.assignedSourceId ?? creep.memory.sourceId)) { continue; }
        const ttl = creep.ticksToLive;
        if (!ttl || ttl > REMOTE_STANDBY_TRIGGER_TTL) { continue; }
        if (ttl < lowestTtl) {
            best = creep;
            lowestTtl = ttl;
        }
    }
    return best;
}

export function hasActiveRemoteMinerForSource(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    excludeCreepId?: string
): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if ((creep.ticksToLive ?? 0) <= 0) { continue; }
        return true;
    }
    return false;
}

export function sourceNeedingBlankStandbyMiner(
    creeps: Creep[],
    remoteRoom: string,
    remotePlan: RemoteRoomPlan,
    excludeCreepId?: string
): string | null {
    if (!remotePlan.sources) { return null; }

    let bestSourceId: string | null = null;
    let bestDemand = -Infinity;
    for (const sourceId in remotePlan.sources) {
        const sourcePlan = remotePlan.sources[sourceId];
        if (sourcePlan.routeAccessible === false) { continue; }
        if (hasRemoteStandbyMinerForSource(creeps, remoteRoom, sourceId, excludeCreepId)) { continue; }
        if (countRemoteMinersForSource(creeps, remoteRoom, sourceId) > 0) { continue; }
        if (projectedRemoteMinerWork(creeps, remoteRoom, sourceId, 0) > 0) { continue; }

        const demand = sourcePlan.workDemand ?? 0;
        if (!bestSourceId || demand > bestDemand) {
            bestSourceId = sourceId;
            bestDemand = demand;
        }
    }

    return bestSourceId;
}

export function sourceNeedingStandbyReplacement(
    creeps: Creep[],
    remoteRoom: string
): string | null {
    const anyStandby = creeps.some((creep) =>
        ensureArchetype(creep) === 'remoteMiner' &&
        creep.memory.remoteRoom === remoteRoom &&
        creep.memory.remoteStandby);
    if (anyStandby) { return null; }

    const dyingMiner = findDyingRemoteMiner(creeps, remoteRoom);
    if (!dyingMiner) { return null; }

    const sourceId = dyingMiner.memory.assignedSourceId ?? dyingMiner.memory.sourceId;
    return sourceId ?? null;
}

// ── Remote hauler counts ──────────────────────────────────────────────────────

export function countRemoteHaulersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
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

export function hasIdleRemoteHauler(creeps: Creep[], remoteRoom: string, sourceId?: string): boolean {
    const room = Game.rooms[remoteRoom];
    let foundIdleHauler = false;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && (creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (creep.store.getUsedCapacity() > 0) { continue; }
        if (room && creep.room.name === remoteRoom) { foundIdleHauler = true; break; }
        if (!room && creep.room.name === creep.memory.homeRoom && !creep.spawning) { foundIdleHauler = true; break; }
    }
    if (!foundIdleHauler) { return false; }
    if (room) {
        const containersWithEnergy = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containersWithEnergy.length > 0) { return true; }
    }
    return foundIdleHauler;
}

// ── Access slot utility (shared by fleet & energy) ───────────────────────────

export function remoteTargetAccessSlots(pos: RoomPosition): number {
    const room = Game.rooms[pos.roomName];
    if (!room) { return 8; }

    const terrain = room.getTerrain();
    let slots = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const tile = new RoomPosition(x, y, pos.roomName);
            if (tile.lookFor(LOOK_SOURCES).length > 0 || tile.lookFor(LOOK_MINERALS).length > 0) { continue; }
            const blocked = tile.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            slots++;
        }
    }
    return Math.max(1, slots);
}

// ── Miner slot caps & source picking ─────────────────────────────────────────

export function remoteSourceHasContainerStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return !!sourcePlan?.containerId || !!sourcePlan?.containerSiteId;
}

export function remoteSourceHasStaticStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return remoteSourceHasContainerStation(sourcePlan) ||
        (sourcePlan?.stationX != null && sourcePlan?.stationY != null);
}

export function remoteSourceActiveMinerLimit(sourcePlan: RemoteSourcePlan): number {
    if (remoteSourceHasStaticStation(sourcePlan)) { return 1; }
    return 2;
}

export function remoteSourceMinerSlotCap(remotePlan: RemoteRoomPlan, source: Source): number {
    const sourceCfg = remotePlan.sources?.[source.id];
    if (sourceCfg && remoteSourceHasStaticStation(sourceCfg)) { return 1; }
    return Math.max(1, Math.min(2, remoteTargetAccessSlots(source.pos)));
}

export function pickRemoteMinerSource(
    creep: Creep,
    sources: Source[],
    remotePlan: RemoteRoomPlan,
    minerCountBySource: Map<string, number>
): Source | null {
    let bestSource: Source | null = null;
    let bestLoad = Infinity;
    let bestRange = Infinity;
    for (const source of sources) {
        const sourcePlan = remotePlan.sources?.[source.id];
        if (sourcePlan?.routeAccessible === false) { continue; }
        const cap = remoteSourceMinerSlotCap(remotePlan, source);
        const count = minerCountBySource.get(source.id) ?? 0;
        if (count >= cap) { continue; }
        const load = count / cap;
        const range = creep.pos.getRangeTo(source);
        if (!bestSource || load < bestLoad || (load === bestLoad && range < bestRange)) {
            bestSource = source;
            bestLoad = load;
            bestRange = range;
        }
    }
    return bestSource;
}

// ── Capability projections ────────────────────────────────────────────────────

export function assignedRemoteMinerWork(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).harvest;
    }
    return total;
}

export function assignedRemoteHaulerCapacity(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).haul;
    }
    return total;
}

export function projectedRemoteMinerWork(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.harvest;
    }
    return total;
}

export function projectedRemoteHaulerCapacity(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.haul;
    }
    return total;
}

export function remoteSourceReplacementHorizon(
    context: RoomControllerContext,
    sourcePlan: RemoteSourcePlan,
    archetype: 'remoteMiner' | 'remoteHauler'
): number {
    const oneWayDistance = Math.max(1, sourcePlan.pathDistance ?? 25);
    const spawnBody = archetype === 'remoteMiner'
        ? planBodyForArchetype('remoteMiner', context.room.energyCapacityAvailable, {
            staticMining: true,
            hasContainer: remoteSourceHasContainerStation(sourcePlan)
        })
        : planBodyForArchetype('remoteHauler', context.room.energyCapacityAvailable);
    const spawnTime = Math.max(1, spawnBody.length * CREEP_SPAWN_TIME);
    return oneWayDistance + spawnTime + REMOTE_REPLACEMENT_BUFFER_TICKS;
}

// ── Maintainer & claimer ──────────────────────────────────────────────────────

export function hasRemoteMaintainer(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.remoteRoom === remoteRoom) { return true; }
    }
    return false;
}

export function countRemoteMaintainersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        count++;
    }
    return count;
}

export function remoteNeedsMaintainer(remoteRoom: string): boolean {
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) { return true; }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
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

// ── Scout management ──────────────────────────────────────────────────────────

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

export function chooseWanderRoom(creep: Creep, fallbackRoom: string): string {
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

export function wanderPointInRoom(creep: Creep, roomName: string): RoomPosition {
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

export function assignOverflowRemoteScout(
    creep: Creep,
    homeRoomName: string,
    wanderFallbackRoom: string = homeRoomName
): boolean {
    const hostiles = findHostiles(creep.room);
    if (hostiles.length > 0) {
        clearJob(creep);
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
