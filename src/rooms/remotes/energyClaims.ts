import { ensureArchetype } from '../../creep.capabilities';

const REMOTE_TARGET_MAX_HAULER_CLAIMS = 2;

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

export function shouldAvoidRemoteEnergyTarget(
    creep: Creep,
    target: RoomObject & { id: string },
    avoidTargetId?: string
): boolean {
    if (avoidTargetId && target.id === avoidTargetId) { return true; }

    const accessSlots = remoteTargetAccessSlots(target.pos);
    const claimCap = Math.max(1, Math.min(REMOTE_TARGET_MAX_HAULER_CLAIMS, accessSlots));
    return remoteEnergyClaimCountForTarget(creep, target.id) >= claimCap;
}

export function isRemoteEnergyTargetReachable(
    creep: Creep,
    target: RoomObject & { id: string }
): boolean {
    if (creep.room.name !== target.pos.roomName) { return true; }

    const strict = creep.pos.findClosestByPath([target], { ignoreCreeps: false }) as RoomObject | null;
    if (strict) { return true; }
    const soft = creep.pos.findClosestByPath([target], { ignoreCreeps: true }) as RoomObject | null;
    return soft !== null;
}

export function remoteEnergyAvailableAfterClaims(
    creep: Creep,
    target: StructureContainer | StructureLink | Resource<RESOURCE_ENERGY>
): number {
    const amount = 'amount' in target
        ? target.amount
        : target.store.getUsedCapacity(RESOURCE_ENERGY);
    return Math.max(0, amount - remoteEnergyClaimsForTarget(creep, target.id));
}

function remoteEnergyClaimCountForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let claims = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        claims++;
    }
    return claims;
}

function remoteEnergyClaimsForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let reserved = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        reserved += other.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return reserved;
}
