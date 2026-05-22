import { wallRampartRepairCap } from '../../repairs/policy';
import { firstStoredResource } from '../../resources/store';

export function opportunisticRemoteHaulerWork(creep: Creep, jobType: CreepJobType): void {
    if (creep.memory.archetype !== 'remoteHauler') { return; }
    if (creep.getActiveBodyparts(WORK) <= 0) { return; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return; }
    if (jobType === 'harvestSource' || jobType === 'mineMineral' || jobType === 'upgrade') { return; }

    const site = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)[0];
    if (site) {
        creep.build(site);
        return;
    }

    const rcl = creep.room.controller?.level ?? 0;
    const repairs = creep.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (structure) => {
            const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
            const cap = isDefense ? Math.min(wallRampartRepairCap(rcl), structure.hitsMax) : structure.hitsMax;
            return structure.hits < cap;
        }
    }) as AnyStructure[];
    if (repairs.length === 0) { return; }

    let best = repairs[0];
    const capFor = (s: AnyStructure) => {
        const isDefense = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
        return isDefense ? Math.min(wallRampartRepairCap(rcl), s.hitsMax) : s.hitsMax;
    };
    let bestRatio = best.hits / Math.max(1, capFor(best));
    let bestRange = creep.pos.getRangeTo(best);
    for (const candidate of repairs) {
        const ratio = candidate.hits / Math.max(1, capFor(candidate));
        const range = creep.pos.getRangeTo(candidate);
        if (ratio < bestRatio || (ratio === bestRatio && range < bestRange)) {
            best = candidate;
            bestRatio = ratio;
            bestRange = range;
        }
    }

    creep.repair(best);
}

export function opportunisticHealNearby(creep: Creep): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return; }

    const adjacent = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: c => c.hits < c.hitsMax
    });
    const adjacentTarget = mostCriticalByRatio(creep, adjacent);
    if (adjacentTarget) {
        creep.heal(adjacentTarget);
        return;
    }

    const ranged = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
        filter: c => c.hits < c.hitsMax
    });
    const rangedTarget = mostCriticalByRatio(creep, ranged);
    if (rangedTarget) {
        creep.rangedHeal(rangedTarget);
    }
}

export function offloadEnergyNearby(creep: Creep): boolean {
    const links = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            structure.structureType === STRUCTURE_LINK &&
            (structure as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureLink[];
    if (links.length > 0) {
        return creep.transfer(links[0], RESOURCE_ENERGY) === OK;
    }

    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
             structure.structureType === STRUCTURE_STORAGE) &&
            (structure as EnergyStructure).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as EnergyStructure[];

    if (targets.length === 0) { return false; }
    return creep.transfer(targets[0], RESOURCE_ENERGY) === OK;
}

export function relayAdjacentContainerToLink(creep: Creep): void {
    const links = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_LINK &&
            (s as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureLink[];
    if (links.length === 0) { return; }

    const containers = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER &&
            (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
    }) as StructureContainer[];
    if (containers.length === 0) { return; }

    creep.withdraw(containers[0], RESOURCE_ENERGY);
}

export function offloadResourceNearby(creep: Creep): boolean {
    const resource = firstStoredResource(creep.store);
    if (!resource) { return false; }

    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
             structure.structureType === STRUCTURE_STORAGE ||
             structure.structureType === STRUCTURE_TERMINAL) &&
            (structure as StructureContainer | StructureStorage | StructureTerminal).store.getFreeCapacity(resource) > 0
    }) as Array<StructureContainer | StructureStorage | StructureTerminal>;

    if (targets.length === 0) { return false; }
    return creep.transfer(targets[0], resource) === OK;
}

function mostCriticalByRatio(creep: Creep, targets: Creep[]): Creep | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio ||
            (ratio === bestRatio && missing > bestMissing) ||
            (ratio === bestRatio && missing === bestMissing && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestMissing = missing;
            bestRange = range;
        }
    }
    return best;
}
