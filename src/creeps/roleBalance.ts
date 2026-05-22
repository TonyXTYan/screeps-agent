import * as roleHarvester from '../creeps/roles/harvester';

export const specification: { [role: string]: number[] } = {
    harvester: [1, 1, 1, 0, 0, 0, 0, 0],
    builder:   [1, 1, 1, 0, 0, 0, 0, 0],
    upgrader:  [1, 1, 1, 0, 0, 0, 0, 0],
    doctor:    [2, 1, 1, 0, 0, 1, 0, 0],
    defender:  [1, 0, 0, 1, 1, 0, 0, 2]
};

export function trySpawn(spawn: StructureSpawn): void {
    if (spawn.memory.full === undefined) { spawn.memory.full = -1; }

    const result = countEnergy(spawn);
    const totalEnergyAvailable = result.available;
    const totalEnergyCapacity = result.capacity;

    if (totalEnergyAvailable === totalEnergyCapacity) {
        if (spawn.memory.full < 0) { spawn.memory.full = Game.time; }

        const waitTicks = Object.keys(Game.creeps).length * 10 + 50;

        if (spawn.memory.full! + waitTicks < Game.time) {
            const body = balanceSpec([1, 1, 1, 0, 0, 0, 0, 0], totalEnergyCapacity);
            const spawnResult = spawn.spawnCreep(body, 'Creep' + Game.time);
            console.log('creep.roleBalane: Spawn was ' + spawnResult);
            spawn.memory.full = -1;
        } else {
            console.log('creep.roleBalane: 👍🏻Ready to spawn a new Creep in ' + (spawn.memory.full! + waitTicks - Game.time) + ' ticks');
        }
    } else {
        console.log('creep.roleBalane: Have energy of ' + totalEnergyAvailable + ' out of ' + totalEnergyCapacity);
        spawn.memory.full = -1;
    }
}

export function countEnergy(spawn: StructureSpawn): { available: number; capacity: number } {
    const extensions = spawn.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_EXTENSION
    }) as StructureExtension[];

    let totalEnergyAvailable = spawn.store.getUsedCapacity(RESOURCE_ENERGY);
    let totalEnergyCapacity = 300;

    for (const ext of extensions) {
        totalEnergyAvailable += ext.store.getUsedCapacity(RESOURCE_ENERGY);
        totalEnergyCapacity += ext.store.getCapacity(RESOURCE_ENERGY) ?? 0;
    }

    return { available: totalEnergyAvailable, capacity: totalEnergyCapacity };
}

export function balanceSpec(spec: number[], energy: number): BodyPartConstant[] {
    const bodyPartName: BodyPartConstant[] = [MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH];
    const bodyPartCost =                     [50,   100,  50,    80,     150,           250,  600,   10  ];

    const weighted: number[] = [];
    let weightedSum = 0;
    for (let i = 0; i < spec.length; i++) {
        const c = spec[i] * bodyPartCost[i];
        weighted[i] = c;
        weightedSum += c;
    }

    const scale = energy / weightedSum;
    const parts: BodyPartConstant[] = [];
    for (let i = 0; i < spec.length; i++) {
        const count = Math.floor(weighted[i] * scale / bodyPartCost[i]);
        for (let j = 0; j < count; j++) {
            parts.push(bodyPartName[i]);
        }
    }
    return parts;
}

export function creepsType(_room: Room): { harvester: string[]; builder: string[]; upgrader: string[]; doctor: string[] } {
    const harvester: string[] = [];
    const builder: string[] = [];
    const upgrader: string[] = [];
    const doctor: string[] = [];

    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (!role) { continue; }
        if (role === 'harvester') { harvester.push(name); }
        else if (role === 'builder') { builder.push(name); }
        else if (role === 'upgrader') { upgrader.push(name); }
        else if (role === 'doctor') { doctor.push(name); }
    }

    return { harvester, builder, upgrader, doctor };
}

export function balanceBuilderUpgrader(room: Room): void {
    const types = creepsType(room);
    const builder = types.builder;
    const upgrader = types.upgrader;
    const targets = room.find(FIND_CONSTRUCTION_SITES);

    if ((builder.length > targets.length && builder.length > 1) || (builder.length > 2 && upgrader.length === 0)) {
        console.log('creep.roleBalane: Too much builder (more than one per construction), changing one to upgrader');
        const creep = Game.creeps[builder[0]];
        creep.say('♿️');
        creep.memory.role = 'upgrader';
    } else if (builder.length < targets.length && upgrader.length > 1) {
        console.log('creep.roleBalane: Too much upgrader (need more builder on constructions), changing one to builder');
        const creep = Game.creeps[upgrader[0]];
        creep.say('♿️');
        creep.memory.role = 'builder';
    }
}

export function balanceUpgraderHarvester(room: Room): void {
    const types = creepsType(room);
    const harvester = types.harvester;
    const upgrader = types.upgrader;

    if (harvester.length > 0) {
        const creep = Game.creeps[harvester[0]];
        const harvesterTarget = roleHarvester.energyTargets(creep);

        let usedCapacity = 0;
        let totalCapacity = 0;
        for (const target of harvesterTarget) {
            const s = target as EnergyStructure;
            usedCapacity += s.store.getUsedCapacity(RESOURCE_ENERGY);
            totalCapacity += s.store.getCapacity(RESOURCE_ENERGY) ?? 0;
        }

        const ratio = usedCapacity / totalCapacity;
        console.log('creep.roleBalane: filled: ' + usedCapacity + ', total: ' + totalCapacity + ', Eratio: ' + ratio);

        if (ratio < 0.5 && upgrader.length > 1 && (upgrader.length / harvester.length) > (ratio * 1.1)) {
            const c = Game.creeps[upgrader[0]];
            console.log('creep.roleBalane: Too much upgrader (need more harvester), changing ' + c.name + ' one to harvester');
            c.say('♿️');
            c.memory.role = 'harvester';
        } else if (ratio > 0.95 && harvester.length > 3) {
            const c = Game.creeps[harvester[0]];
            console.log('creep.roleBalane: Too much harvester (need more upgrader), changing ' + c.name + ' to upgrader');
            c.say('♿️');
            c.memory.role = 'upgrader';
        }
    } else {
        console.log('creep.roleBalane: creep.roleBalance: thisi is bad');
    }
}
