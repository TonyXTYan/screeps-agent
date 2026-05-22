export interface CreepCapabilities {
    move: number;
    work: number;
    carry: number;
    attack: number;
    rangedAttack: number;
    heal: number;
    claim: number;
    tough: number;
    carryCapacity: number;
    harvest: number;
    haul: number;
    build: number;
    repair: number;
    upgrade: number;
    reserve: number;
}

export const BODY_BUDGET_RATIO = 0.5;
export const BODY_MIN_BUDGET = 300;
export const MAX_CARRY_CAPACITY = 1000;

const BODY_PART_COST: { [part in BodyPartConstant]: number } = {
    [MOVE]: 50,
    [WORK]: 100,
    [CARRY]: 50,
    [ATTACK]: 80,
    [RANGED_ATTACK]: 150,
    [HEAL]: 250,
    [CLAIM]: 600,
    [TOUGH]: 10
};

export function bodyCost(body: BodyPartConstant[]): number {
    let cost = 0;
    for (const part of body) {
        cost += BODY_PART_COST[part];
    }
    return cost;
}

export function getCreepCapabilities(creep: Creep): CreepCapabilities {
    const parts = creep.body
        .filter((part) => part.hits > 0)
        .map((part) => part.type);
    return getBodyCapabilities(parts);
}

export function getBodyCapabilities(body: BodyPartConstant[]): CreepCapabilities {
    const capabilities: CreepCapabilities = {
        move: 0,
        work: 0,
        carry: 0,
        attack: 0,
        rangedAttack: 0,
        heal: 0,
        claim: 0,
        tough: 0,
        carryCapacity: 0,
        harvest: 0,
        haul: 0,
        build: 0,
        repair: 0,
        upgrade: 0,
        reserve: 0
    };

    for (const part of body) {
        if (part === MOVE) { capabilities.move++; }
        if (part === WORK) { capabilities.work++; }
        if (part === CARRY) { capabilities.carry++; }
        if (part === ATTACK) { capabilities.attack++; }
        if (part === RANGED_ATTACK) { capabilities.rangedAttack++; }
        if (part === HEAL) { capabilities.heal++; }
        if (part === CLAIM) { capabilities.claim++; }
        if (part === TOUGH) { capabilities.tough++; }
    }

    capabilities.carryCapacity = capabilities.carry * CARRY_CAPACITY;
    capabilities.harvest = capabilities.work;
    capabilities.haul = capabilities.carryCapacity;
    capabilities.build = capabilities.work;
    capabilities.repair = capabilities.work;
    capabilities.upgrade = capabilities.work;
    capabilities.reserve = capabilities.claim;

    return capabilities;
}

export function inferArchetype(creep: Creep): CreepArchetype {
    if (creep.memory.archetype) { return creep.memory.archetype; }

    const capabilities = getCreepCapabilities(creep);
    if (capabilities.claim > 0) { return 'claimer'; }
    if (capabilities.heal > 0) { return 'doctor'; }
    if (creep.memory.role === 'manual' && capabilities.work > 0 && capabilities.carry > 0) { return 'remoteMaintainer'; }
    if (capabilities.work > 0 && creep.memory.role === 'harvester') { return 'worker'; }
    if (capabilities.work > 0 && creep.memory.role === 'builder') { return 'worker'; }
    if (capabilities.work > 0 && creep.memory.role === 'upgrader') { return 'worker'; }
    if (capabilities.work > 0 && creep.memory.role === 'doctor') { return 'doctor'; }
    if (capabilities.work > 0 && capabilities.carry > 0) { return 'worker'; }
    if (capabilities.carry > 0) { return 'hauler'; }
    if (creep.memory.role === 'defender') { return 'defender'; }
    return 'worker';
}

export function ensureArchetype(creep: Creep): CreepArchetype {
    const archetype = inferArchetype(creep);
    if (creep.memory.archetype !== archetype) {
        creep.memory.archetype = archetype;
    }
    return archetype;
}
