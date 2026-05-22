import { MAX_CARRY_CAPACITY, bodyCost } from '../creep.capabilities';

export interface BodyPlanOptions {
    staticMining?: boolean;
    hasContainer?: boolean;
    workRatio?: number;
    minClaimParts?: number;
    maxClaimParts?: number;
}

export function planBodyForArchetype(
    archetype: CreepArchetype,
    energyBudget: number,
    opts?: BodyPlanOptions
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
        const reserved = archetype === 'remoteHauler' ? 150 : 0;
        const maxCarryParts = Math.floor(MAX_CARRY_CAPACITY / CARRY_CAPACITY);
        let carryCount = 0;
        while (body.length + 3 <= 50 && bodyCost(body) + 150 + reserved <= energyBudget && carryCount + 2 <= maxCarryParts) {
            body.push(CARRY, CARRY, MOVE);
            carryCount += 2;
        }
        if (body.length > 0) {
            if (archetype === 'remoteHauler' && body.length + 2 <= 50) {
                body.push(WORK, MOVE);
            } else if (archetype === 'hauler' && bodyCost(body) + 150 <= energyBudget && body.length + 2 <= 50) {
                body.push(WORK, MOVE);
            }
            return body;
        }
        return selectLargestWithinBudget([[CARRY, MOVE]], energyBudget);
    }

    if (archetype === 'remoteMaintainer') {
        return selectLargestWithinBudget([
            [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
            [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
            [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]
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
    // MOVE = WORK: satisfies road-when-loaded (2*MOVE >= WORK+CARRY) and plain-when-empty (2*MOVE >= 2*WORK)
    const moveCount = workRatio;
    const unitParts = workRatio + 1 + moveCount;
    const unitCost = workRatio * 100 + 50 + moveCount * 50;
    const maxCarryParts = Math.floor(MAX_CARRY_CAPACITY / CARRY_CAPACITY);
    let carryCount = 0;
    while (body.length + unitParts <= 50 && bodyCost(body) + unitCost <= energyBudget && carryCount + 1 <= maxCarryParts) {
        for (let i = 0; i < workRatio; i++) { body.push(WORK); }
        body.push(CARRY);
        for (let i = 0; i < moveCount; i++) { body.push(MOVE); }
        carryCount++;
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
