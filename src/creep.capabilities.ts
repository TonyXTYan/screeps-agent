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

export function planBodyForArchetype(
    archetype: CreepArchetype,
    energyBudget: number,
    opts?: { staticMining?: boolean; hasContainer?: boolean; workRatio?: number; minClaimParts?: number; maxClaimParts?: number }
): BodyPartConstant[] {
    if (archetype === 'remoteMiner' && opts?.staticMining) {
        if (opts?.hasContainer) {
            return selectLargestWithinBudget([
                [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
                [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
                [WORK, WORK, WORK, CARRY, MOVE, MOVE],
                [WORK, WORK, CARRY, MOVE, MOVE],
                [WORK, CARRY, MOVE]
            ], energyBudget);
        }
        return selectLargestWithinBudget([
            [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
            [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
            [WORK, WORK, WORK, CARRY, MOVE, MOVE],
            [WORK, WORK, CARRY, MOVE, MOVE],
            [WORK, CARRY, MOVE]
        ], energyBudget);
    }

    if (archetype === 'mineralMiner') {
        return selectLargestWithinBudget([
            [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE],
            [WORK, WORK, WORK, WORK, CARRY, MOVE],
            [WORK, WORK, WORK, CARRY, MOVE],
            [WORK, WORK, CARRY, MOVE],
            [WORK, CARRY, MOVE]
        ], energyBudget);
    }

    if (archetype === 'miner' || archetype === 'remoteMiner') {
        if (opts?.staticMining) {
            return selectLargestWithinBudget([
                [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE, MOVE],
                [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
                [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
                [WORK, WORK, WORK, CARRY, MOVE],
                [WORK, WORK, CARRY, MOVE],
                [WORK, CARRY, MOVE]
            ], energyBudget);
        }

        return selectLargestWithinBudget([
            [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
            [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
            [WORK, WORK, WORK, CARRY, MOVE, MOVE],
            [WORK, WORK, CARRY, MOVE],
            [WORK, CARRY, MOVE]
        ], energyBudget);
    }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const body: BodyPartConstant[] = [];
        const reserved = archetype === 'remoteHauler' ? 150 : 0; // Reserve WORK+MOVE for remoteHauler
        while (body.length + 3 <= 50 && bodyCost(body) + 150 + reserved <= energyBudget) {
            body.push(CARRY, CARRY, MOVE);
        }
        if (body.length > 0) {
            if (archetype === 'remoteHauler' && body.length + 2 <= 50) {
                body.push(WORK, MOVE); // Always add WORK for remoteHauler
            } else if (archetype === 'hauler' && bodyCost(body) + 150 <= energyBudget && body.length + 2 <= 50) {
                body.push(WORK, MOVE);
            }
            return body;
        }
        return selectLargestWithinBudget([[CARRY, MOVE]], energyBudget);
    }

    if (archetype === 'remoteMaintainer') {
        return selectLargestWithinBudget([
            [WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
            [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
            [WORK, CARRY, MOVE]
        ], energyBudget);
    }

    if (archetype === 'remoteScout') {
        return selectLargestWithinBudget([
            [MOVE, MOVE],
            [MOVE]
        ], energyBudget);
    }

    if (archetype === 'doctor') {
        return selectLargestWithinBudget([
            [WORK, WORK, CARRY, CARRY, MOVE, MOVE, HEAL, MOVE],
            [WORK, CARRY, MOVE, HEAL, MOVE]
        ], energyBudget);
    }

    if (archetype === 'claimer') {
        return buildClaimerBody(energyBudget, opts?.minClaimParts ?? 1, opts?.maxClaimParts);
    }

    return buildWorkerBody(energyBudget, opts?.workRatio ?? 1);
}

function buildClaimerBody(energyBudget: number, minClaimParts: number, maxClaimParts: number = 5): BodyPartConstant[] {
    const claimSegmentCost = bodyCost([CLAIM, MOVE]);
    const body: BodyPartConstant[] = [];
    const maxPairs = Math.min(maxClaimParts, 25);

    for (let i = 0; i < Math.min(minClaimParts, maxPairs); i++) {
        body.push(CLAIM, MOVE);
    }

    if (bodyCost(body) > energyBudget) { return []; }

    while (body.length / 2 < maxPairs && body.length + 2 <= 50 && bodyCost(body) + claimSegmentCost <= energyBudget) {
        body.push(CLAIM, MOVE);
    }

    if (bodyCost(body) <= energyBudget && body.length <= 50) {
        return body;
    }
    return [];
}

function buildWorkerBody(energyBudget: number, workRatio: number = 1): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    // MOVE count = ceil((WORK + CARRY) / 2) for full speed on roads
    const moveCount = Math.ceil((workRatio + 1) / 2);
    const unitParts = workRatio + 1 + moveCount;
    const unitCost = workRatio * 100 + 50 + moveCount * 50;
    while (body.length + unitParts <= 50 && bodyCost(body) + unitCost <= energyBudget) {
        for (let i = 0; i < workRatio; i++) { body.push(WORK); }
        body.push(CARRY);
        for (let i = 0; i < moveCount; i++) { body.push(MOVE); }
    }
    if (body.length > 0) { return body; }
    return selectLargestWithinBudget([[WORK, CARRY, MOVE]], energyBudget);
}

function selectLargestWithinBudget(candidates: BodyPartConstant[][], energyBudget: number): BodyPartConstant[] {
    for (const body of candidates) {
        if (bodyCost(body) <= energyBudget && body.length <= 50) {
            return body;
        }
    }
    return [];
}
