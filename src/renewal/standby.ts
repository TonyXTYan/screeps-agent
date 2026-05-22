const STANDBY_MINER_PARK_MIN_RANGE = 2;
const STANDBY_MINER_PARK_MAX_RANGE = 4;

export function tryRenewStandbyMiner(creep: Creep): void {
    if (!creep.memory.remoteStandby) { return; }
    if (creep.memory.assignedSourceId || creep.memory.sourceId) { return; }

    const homeSpawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS) as StructureSpawn | null;
    if (!homeSpawn) { return; }
    parkStandbyMinerAwayFromSpawn(creep, homeSpawn);
}

function parkStandbyMinerAwayFromSpawn(creep: Creep, spawn: StructureSpawn): void {
    const range = creep.pos.getRangeTo(spawn);
    if (range >= STANDBY_MINER_PARK_MIN_RANGE && range <= STANDBY_MINER_PARK_MAX_RANGE) { return; }

    const park = standbyMinerParkingTarget(creep, spawn);
    if (!park) { return; }
    creep.moveTo(park, { reusePath: 6, visualizePathStyle: { stroke: '#d1d5db' } });
}

function standbyMinerParkingTarget(creep: Creep, spawn: StructureSpawn): RoomPosition | null {
    const terrain = creep.room.getTerrain();
    let best: RoomPosition | null = null;
    let bestRange = Infinity;

    for (let dx = -STANDBY_MINER_PARK_MAX_RANGE; dx <= STANDBY_MINER_PARK_MAX_RANGE; dx++) {
        for (let dy = -STANDBY_MINER_PARK_MAX_RANGE; dy <= STANDBY_MINER_PARK_MAX_RANGE; dy++) {
            const x = spawn.pos.x + dx;
            const y = spawn.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }

            const rangeFromSpawn = Math.max(Math.abs(dx), Math.abs(dy));
            if (rangeFromSpawn < STANDBY_MINER_PARK_MIN_RANGE || rangeFromSpawn > STANDBY_MINER_PARK_MAX_RANGE) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const pos = new RoomPosition(x, y, creep.room.name);
            if (pos.lookFor(LOOK_CREEPS).some((other) => other.id !== creep.id)) { continue; }
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }

            const rangeFromCreep = creep.pos.getRangeTo(pos);
            if (rangeFromCreep < bestRange) {
                best = pos;
                bestRange = rangeFromCreep;
            }
        }
    }

    return best;
}
