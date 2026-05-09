import { ensureArchetype } from './creep.capabilities';

export function run(): void {
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('creep.MemoryManagement: Clearing non-existing creep memory:', name);
        }
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        const archetype = ensureArchetype(creep);
        if (creep.memory.role === undefined) {
            creep.memory.role = fallbackRoleForArchetype(archetype);
            console.log('creep.MemoryManagement: ' + name + ' assigned fallback role ' + creep.memory.role);
        }
    }
}

function fallbackRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'miner' || archetype === 'hauler' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}
