export function meetsMinimumBody(body: BodyPartConstant[], archetype: CreepArchetype, rcl: number, fleetCount: number): boolean {
    if (fleetCount === 0) return true;
    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const carry = body.filter(p => p === CARRY).length;
        return carry >= minCarryForHauler(rcl);
    }
    if (archetype === 'worker') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForWorker(rcl);
    }
    if (archetype === 'miner' || archetype === 'remoteMiner' || archetype === 'mineralMiner') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForMiner(rcl);
    }
    return true;
}

export function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}

function minCarryForHauler(rcl: number): number {
    if (rcl >= 7) return 6;
    if (rcl >= 4) return 4;
    return 2;
}

function minWorkForWorker(rcl: number): number {
    if (rcl >= 7) return 3;
    if (rcl >= 4) return 2;
    return 1;
}

function minWorkForMiner(rcl: number): number {
    if (rcl >= 7) return 4;
    if (rcl >= 4) return 3;
    return 1;
}
