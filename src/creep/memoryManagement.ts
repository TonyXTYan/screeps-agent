import { ensureArchetype } from './capabilities';

export function run(): void {
    migrateLegacyDefenseMemoryEntries();

    const spawningNames = creepsCurrentlySpawning();
    for (const name in Memory.creeps) {
        if (!Game.creeps[name] && !spawningNames[name]) {
            delete Memory.creeps[name];
            console.log('creep.MemoryManagement: Clearing non-existing creep memory:', name);
        }
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        const archetype = ensureArchetype(creep);
        restoreRemoteAssignmentIfSafe(creep, archetype);
        if (creep.memory.role === undefined) {
            creep.memory.role = fallbackRoleForArchetype(archetype);
            console.log('creep.MemoryManagement: ' + name + ' assigned fallback role ' + creep.memory.role);
        }
    }
}

function creepsCurrentlySpawning(): { [name: string]: boolean } {
    const names: { [name: string]: boolean } = {};
    for (const spawnName in Game.spawns) {
        const spawning = Game.spawns[spawnName].spawning;
        if (!spawning) { continue; }
        names[spawning.name] = true;
    }
    return names;
}

function restoreRemoteAssignmentIfSafe(creep: Creep, archetype: CreepArchetype): void {
    if (!isRemoteArchetype(archetype)) { return; }
    if (creep.memory.remoteRoom) { return; }

    const homeRoom = creep.memory.homeRoom;
    if (!homeRoom) { return; }
    const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};

    let soleEnabledRemote: string | null = null;
    for (const roomName in remotes) {
        if (!remotes[roomName].enabled) { continue; }
        if (soleEnabledRemote) { return; } // ambiguous; do nothing.
        soleEnabledRemote = roomName;
    }
    if (!soleEnabledRemote) { return; }

    creep.memory.remoteRoom = soleEnabledRemote;
    const remoteMode = remotes[soleEnabledRemote].mode;
    creep.memory.remoteMode = archetype === 'claimer' && remoteMode === 'harvest' ? 'reserve' : remoteMode;
    console.log('creep.MemoryManagement: restored remote assignment for ' + creep.name + ' -> ' + soleEnabledRemote);
}

function migrateLegacyDefenseMemoryEntries(): void {
    for (const name in Memory.creeps) {
        const memory = Memory.creeps[name];
        if (!memory) { continue; }

        if (memory.role === 'defender' || memory.archetype === 'defender') {
            memory.role = 'patrol';
            memory.archetype = 'patrol';
            memory.attacking = undefined;
            memory.rallySpawnId = undefined;
            continue;
        }

        if (memory.role === 'doctor' || memory.archetype === 'doctor') {
            memory.role = 'builder';
            memory.archetype = 'worker';
        }
    }
}

function isRemoteArchetype(archetype: CreepArchetype): boolean {
    return archetype === 'remoteMiner' ||
        archetype === 'remoteHauler' ||
        archetype === 'remoteMaintainer' ||
        archetype === 'remoteScout' ||
        archetype === 'claimer';
}

function fallbackRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'patrol') { return 'patrol'; }
    if (archetype === 'doctor') { return 'builder'; }
    if (archetype === 'miner' || archetype === 'hauler' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}
