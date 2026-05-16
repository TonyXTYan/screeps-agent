let reservationTick = -1;
const reservedSpawnIds: { [spawnId: string]: boolean } = {};
const reservedSpawnOwner: { [spawnId: string]: string } = {};
const renewSpawnByCreepName: { [creepName: string]: string } = {};

export function reserveRenewSpawns(creeps: Creep[], freeSpawns: StructureSpawn[]): { [spawnId: string]: boolean } {
    refreshRenewReservations();
    const reserved: { [spawnId: string]: boolean } = {};
    for (const creep of creeps) {
        const spawn = acquireRenewSpawnFrom(creep, freeSpawns);
        if (spawn) {
            reserved[spawn.id] = true;
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
        if (reservedSpawn && (!reservedSpawnIds[reservedSpawn.id] || reservedSpawnOwner[reservedSpawn.id] === creep.name)) {
            reserveSpawnForCreep(creep, reservedSpawn);
            return reservedSpawn;
        }
        delete renewSpawnByCreepName[creep.name];
    }

    const availableSpawns = spawns.filter((candidate) =>
        !candidate.spawning &&
        (!reservedSpawnIds[candidate.id] || reservedSpawnOwner[candidate.id] === creep.name));
    const spawn = creep.pos.findClosestByRange(availableSpawns) as StructureSpawn | null;
    if (spawn) {
        reserveSpawnForCreep(creep, spawn);
    }
    return spawn;
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
