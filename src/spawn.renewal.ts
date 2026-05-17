let reservationTick = -1;
const reservedSpawnIds: { [spawnId: string]: boolean } = {};
const reservedSpawnOwner: { [spawnId: string]: string } = {};
const renewSpawnByCreepName: { [creepName: string]: string } = {};

export function reserveRenewSpawns(
    creeps: Creep[],
    freeSpawns: StructureSpawn[],
    maxReservations: number = Infinity
): { [spawnId: string]: boolean } {
    refreshRenewReservations();
    const reserved: { [spawnId: string]: boolean } = {};
    if (maxReservations <= 0) { return reserved; }
    let reservedCount = 0;
    for (const creep of creeps) {
        if (reservedCount >= maxReservations) { break; }
        const spawn = acquireRenewSpawnFrom(creep, freeSpawns);
        if (spawn && !reserved[spawn.id]) {
            reserved[spawn.id] = true;
            reservedCount++;
        }
    }
    return reserved;
}

export function acquireRenewSpawn(creep: Creep, room: Room): StructureSpawn | null {
    refreshRenewReservations();
    return acquireRenewSpawnFrom(creep, room.find(FIND_MY_SPAWNS).filter((candidate) => !candidate.spawning));
}

function acquireRenewSpawnFrom(creep: Creep, spawns: StructureSpawn[]): StructureSpawn | null {
    const reservedSpawnId = renewSpawnByCreepName[creep.name];
    if (reservedSpawnId) {
        const reservedSpawn = spawns.find((spawn) => spawn.id === reservedSpawnId && !spawn.spawning);
        if (reservedSpawn && canUseReservedSpawn(creep, reservedSpawn)) {
            reserveSpawnForCreep(creep, reservedSpawn);
            return reservedSpawn;
        }
        delete renewSpawnByCreepName[creep.name];
    }

    const availableSpawns = spawns.filter((candidate) =>
        !candidate.spawning &&
        canUseReservedSpawn(creep, candidate));
    const spawn = creep.pos.findClosestByRange(availableSpawns) as StructureSpawn | null;
    if (spawn) {
        reserveSpawnForCreep(creep, spawn);
    }
    return spawn;
}

function canUseReservedSpawn(creep: Creep, spawn: StructureSpawn): boolean {
    if (!reservedSpawnIds[spawn.id]) { return true; }
    const ownerName = reservedSpawnOwner[spawn.id];
    if (!ownerName || ownerName === creep.name) { return true; }

    const owner = Game.creeps[ownerName];
    if (!owner) { return true; }

    const myRange = creep.pos.getRangeTo(spawn);
    const ownerRange = owner.pos.getRangeTo(spawn);

    // If the current owner is still traveling, let an adjacent creep take over
    // so at least one renew can happen this tick.
    if (myRange <= 1 && ownerRange > 1) { return true; }

    return false;
}

function reserveSpawnForCreep(creep: Creep, spawn: StructureSpawn): void {
    const previousSpawnId = renewSpawnByCreepName[creep.name];
    if (previousSpawnId && previousSpawnId !== spawn.id && reservedSpawnOwner[previousSpawnId] === creep.name) {
        delete reservedSpawnIds[previousSpawnId];
        delete reservedSpawnOwner[previousSpawnId];
    }

    renewSpawnByCreepName[creep.name] = spawn.id;
    reservedSpawnIds[spawn.id] = true;
    reservedSpawnOwner[spawn.id] = creep.name;
}

export function nearestSpawn(creep: Creep, room: Room): StructureSpawn | null {
    return creep.pos.findClosestByRange(room.find(FIND_MY_SPAWNS)) as StructureSpawn | null;
}

function refreshRenewReservations(): void {
    if (reservationTick === Game.time) { return; }
    reservationTick = Game.time;
    for (const id in reservedSpawnIds) {
        delete reservedSpawnIds[id];
    }
    for (const id in reservedSpawnOwner) {
        delete reservedSpawnOwner[id];
    }
    for (const name in renewSpawnByCreepName) {
        delete renewSpawnByCreepName[name];
    }
}
