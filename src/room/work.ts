// Build, repair, upgrade, and mineral work assignment helpers.

import { wallRampartRepairCap } from '../role/doctor';
import { RoomControllerContext, JobReservations } from './types';
import { BUILD_RESERVATION_TICKS, REPAIR_RESERVATION_TICKS } from './constants';
import { storedEnergy } from './energy';
export { totalStoredTargets, totalStoredResources, firstStoredResource, firstStoredNonEnergyResource, haulerMiningSiteMinPickup } from './storeUtils';

export function bestConstructionSite(
    creep: Creep,
    sites: ConstructionSite[],
    reservations: JobReservations,
    workParts: number
): ConstructionSite | null {
    let best: ConstructionSite | null = null;
    let bestPriority = Infinity;
    let bestRange = Infinity;
    let bestRemaining = 0;

    for (const site of sites) {
        const remaining = remainingConstructionProgress(site, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const priority = constructionPriority(site);
        const range = creep.pos.getRangeTo(site);
        if (!best ||
            priority < bestPriority ||
            (priority === bestPriority && remaining > bestRemaining) ||
            (priority === bestPriority && remaining === bestRemaining && range < bestRange)) {
            best = site;
            bestPriority = priority;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

export function repairTargetFor(
    creep: Creep,
    targets: AnyStructure[],
    reservations: JobReservations,
    workParts: number
): AnyStructure | null {
    let best: AnyStructure | null = null;
    let bestRange = Infinity;
    let bestRemaining = 0;

    for (const target of targets) {
        const remaining = remainingRepairProgress(target, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const range = creep.pos.getRangeTo(target);
        if (!best || remaining > bestRemaining || (remaining === bestRemaining && range < bestRange)) {
            best = target;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

export function remainingConstructionProgress(site: ConstructionSite, reservations: JobReservations): number {
    return site.progressTotal - site.progress - (reservations.constructionProgress[site.id] ?? 0);
}

export function remainingRepairProgress(structure: AnyStructure, reservations: JobReservations): number {
    const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
    const repairRcl = structure.room.controller?.level ?? 0;
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
    const cappedRemaining = Math.max(0, maxHits - structure.hits);
    return cappedRemaining - (reservations.repairProgress[structure.id] ?? 0);
}

export function reserveConstructionProgress(reservations: JobReservations, site: ConstructionSite, workParts: number): void {
    reservations.constructionProgress[site.id] = (reservations.constructionProgress[site.id] ?? 0) +
        workParts * BUILD_POWER * BUILD_RESERVATION_TICKS;
}

export function reserveRepairProgress(reservations: JobReservations, structure: AnyStructure, workParts: number): void {
    reservations.repairProgress[structure.id] = (reservations.repairProgress[structure.id] ?? 0) +
        workParts * REPAIR_POWER * REPAIR_RESERVATION_TICKS;
}

export function constructionPriority(site: ConstructionSite): number {
    if (site.structureType === STRUCTURE_TOWER) { return 1; }
    if (site.structureType === STRUCTURE_SPAWN) { return 2; }
    if (site.structureType === STRUCTURE_EXTENSION) { return 3; }
    if (site.structureType === STRUCTURE_STORAGE) { return 4; }
    if (site.structureType === STRUCTURE_LINK) { return 5; }
    if (site.structureType === STRUCTURE_TERMINAL) { return 6; }
    if (site.structureType === STRUCTURE_LAB) { return 7; }
    if (site.structureType === STRUCTURE_EXTRACTOR) { return 8; }
    if (site.structureType === STRUCTURE_CONTAINER) { return 9; }
    if (site.structureType === STRUCTURE_ROAD) { return 10; }
    if (site.structureType === STRUCTURE_RAMPART) { return 11; }
    if (site.structureType === STRUCTURE_WALL) { return 12; }
    return 20;
}

export function shouldRepairWithCreeps(context: RoomControllerContext): boolean {
    if (context.constructionSites.length === 0) { return true; }
    if (!context.structures.storage) { return true; }
    return context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 5000;
}

export function desiredUpgraderWork(rcl: number): number {
    if (rcl >= 8) { return 1; }
    if (rcl >= 7) { return 10; }
    if (rcl >= 5) { return 5; }
    return 2;
}

export function shouldReserveUpgrade(context: RoomControllerContext, reservations: JobReservations): boolean {
    if (!context.room.controller) { return false; }

    const rcl = context.room.controller.level;
    if (rcl >= 8) {
        const downgradeTimer = context.room.controller.ticksToDowngrade;
        if (downgradeTimer > 100000) { return false; }
    }

    if (reservations.upgraderWork >= desiredUpgraderWork(rcl)) { return false; }
    if (context.room.energyAvailable === 0 && storedEnergy(context) === 0) { return false; }
    return true;
}

export function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }
    return context.mineralPlan?.container != null;
}

export function isMiningSiteEnergyTarget(
    context: RoomControllerContext,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink
): boolean {
    if (target.structureType === STRUCTURE_LINK) {
        return context.structures.links.source.some((link) => link.id === target.id);
    }
    if (target.structureType !== STRUCTURE_CONTAINER) { return false; }
    if (context.mineralPlan?.container?.id === target.id) { return true; }
    return context.sourcePlans.some((sourcePlan) => sourcePlan.container?.id === target.id);
}
