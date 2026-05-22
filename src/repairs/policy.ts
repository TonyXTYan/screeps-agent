export function wallRampartRepairCap(rcl: number): number {
    if (rcl <= 2) return 20_000;
    if (rcl === 3) return 30_000;
    if (rcl === 4) return 50_000;
    if (rcl === 5) return 75_000;
    if (rcl === 6) return 100_000;
    if (rcl === 7) return 300_000;
    return Infinity;
}

export function repairStructureFilter(structure: AnyStructure, rcl: number): boolean {
    if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
        return structure.hits < Math.min(wallRampartRepairCap(rcl), structure.hitsMax);
    }
    return structure.hits < structure.hitsMax * 0.9;
}
