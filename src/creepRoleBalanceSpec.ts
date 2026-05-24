const BODY_PART_NAME: BodyPartConstant[] = [MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH];
const BODY_PART_COST =                     [50,   100,  50,    80,     150,           250,  600,   10  ];

export function balanceBodySpec(spec: number[], energy: number): BodyPartConstant[] {
    const weighted: number[] = [];
    let weightedSum = 0;
    for (let i = 0; i < spec.length; i++) {
        const costWeighted = spec[i] * BODY_PART_COST[i];
        weighted[i] = costWeighted;
        weightedSum += costWeighted;
    }

    const scale = energy / weightedSum;
    const parts: BodyPartConstant[] = [];
    for (let i = 0; i < spec.length; i++) {
        const count = Math.floor(weighted[i] * scale / BODY_PART_COST[i]);
        for (let j = 0; j < count; j++) {
            parts.push(BODY_PART_NAME[i]);
        }
    }
    return parts;
}
