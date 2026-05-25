// Source and mineral planning: demand calculation, miner assignment, static mining memory.

import { ensureArchetype, getCreepCapabilities } from '../creep/capabilities';
import { MINERAL_WORK_DEMAND } from './constants';
import { RoomControllerContext, SourcePlan, MineralPlan, JobReservations } from './types';
import { RoomStructureCache } from './structures';
import { closestByRange } from './targeting';

export function buildSourcePlans(sources: Source[], structures: RoomStructureCache): SourcePlan[] {
    return sources.map((source) => {
        const container = closestByRange(source, structures.containers.filter((structure) => structure.pos.getRangeTo(source) <= 1));
        const link = closestByRange(source, structures.links.source.filter((structure) => structure.pos.getRangeTo(source) <= 2));
        return {
            source,
            container,
            link,
            requiredWork: sourceWorkDemand(source),
            assignedWork: 0,
            staticMining: container !== null && link === null
        };
    });
}

export function buildMineralPlan(mineral: Mineral, structures: RoomStructureCache): MineralPlan {
    let container = closestByRange(mineral, structures.containers.filter((structure) => structure.pos.getRangeTo(mineral) <= 1));
    if (!container && mineral.room) {
        const allContainers = mineral.room.find(FIND_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
        container = closestByRange(mineral, allContainers.filter((c) => c.pos.getRangeTo(mineral) <= 1));
    }
    const link = closestByRange(mineral, [...structures.links.hub, ...structures.links.other].filter((structure) => structure.pos.getRangeTo(mineral) <= 2));
    return {
        mineral,
        extractor: structures.extractor,
        container,
        link,
        requiredWork: MINERAL_WORK_DEMAND,
        assignedWork: 0,
        staticMining: container !== null
    };
}

export function totalSourcePlanWorkDemand(sourcePlans: SourcePlan[]): number {
    let demand = 0;
    for (const sourcePlan of sourcePlans) {
        demand += sourcePlan.requiredWork;
    }
    return demand;
}

export function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

export function sourceSpawnDeficit(context: RoomControllerContext, pendingSourceIds: Set<string> = new Set()): SourcePlan | null {
    for (const plan of context.sourcePlans) {
        if (pendingSourceIds.has(plan.source.id)) { continue; }
        const assignedMiners = assignedSourceMinerCount(context.creeps, plan.source.id);
        if (assignedMiners === 0) {
            return plan;
        }
    }
    return null;
}

export function activeMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

export function assignedSourceMinerCount(creeps: Creep[], sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

export function assignedSourceWork(creeps: Creep[], sourceId: string): number {
    let work = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        work += getCreepCapabilities(creep).harvest;
    }
    return work;
}

export function assignedSourcePlan(
    creep: Creep,
    sourcePlans: SourcePlan[],
    reservations: JobReservations
): SourcePlan | null {
    if (sourcePlans.length === 0) { return null; }

    const assignedId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (assignedId) {
        const current = sourcePlans.find((plan) => plan.source.id === assignedId);
        const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
        if (current && (!uncovered || (reservations.sourceMinerCount[current.source.id] ?? 0) <= 1)) {
            return current;
        }
        if (current && uncovered) {
            reservations.sourceMinerCount[current.source.id] = Math.max(0, (reservations.sourceMinerCount[current.source.id] ?? 1) - 1);
            reservations.sourceWork[current.source.id] = Math.max(0, (reservations.sourceWork[current.source.id] ?? 0) - getCreepCapabilities(creep).harvest);
            reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
            reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
            creep.memory.sourceId = uncovered.source.id;
            creep.memory.assignedSourceId = uncovered.source.id;
            return uncovered;
        }
    }

    const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
    if (uncovered) {
        reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
        reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = uncovered.source.id;
        creep.memory.assignedSourceId = uncovered.source.id;
        return uncovered;
    }

    let best: SourcePlan | null = null;
    let bestDeficit = -Infinity;
    for (const plan of sourcePlans) {
        const reserved = reservations.sourceWork[plan.source.id] ?? 0;
        const deficit = plan.requiredWork - reserved;
        if (deficit > bestDeficit) {
            best = plan;
            bestDeficit = deficit;
        }
    }

    if (best && bestDeficit > 0) {
        reservations.sourceMinerCount[best.source.id] = (reservations.sourceMinerCount[best.source.id] ?? 0) + 1;
        reservations.sourceWork[best.source.id] = (reservations.sourceWork[best.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = best.source.id;
        creep.memory.assignedSourceId = best.source.id;
    } else {
        return null;
    }
    return best;
}

export function reserveSourceWork(reservations: JobReservations, sourcePlan: SourcePlan, work: number): void {
    reservations.sourceWork[sourcePlan.source.id] = (reservations.sourceWork[sourcePlan.source.id] ?? 0) + work;
}

export function reserveSourceIfNeeded(
    creep: Creep,
    reservations: JobReservations,
    sourcePlan: SourcePlan,
    work: number
): void {
    const alreadyAssigned = (creep.memory.assignedSourceId ?? creep.memory.sourceId) === sourcePlan.source.id;
    if (!alreadyAssigned) {
        reservations.sourceMinerCount[sourcePlan.source.id] = (reservations.sourceMinerCount[sourcePlan.source.id] ?? 0) + 1;
        reserveSourceWork(reservations, sourcePlan, work);
    }
}

export function setStaticHarvestMemory(creep: Creep, sourcePlan: SourcePlan): void {
    creep.memory.sourceId = sourcePlan.source.id;
    creep.memory.assignedSourceId = sourcePlan.source.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForSource(sourcePlan);
    creep.memory.staticMining = sourcePlan.staticMining;
}

export function setStaticMineralMemory(creep: Creep, mineralPlan: MineralPlan): void {
    creep.memory.assignedMineralId = mineralPlan.mineral.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForMineral(mineralPlan);
    creep.memory.staticMining = mineralPlan.staticMining;
}

export function clearStaticMiningMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.staticMining = undefined;
}

export function stationaryTargetIdForSource(sourcePlan: SourcePlan): string {
    return sourcePlan.container?.id ?? sourcePlan.source.id;
}

export function stationaryTargetIdForMineral(mineralPlan: MineralPlan): string {
    return mineralPlan.container?.id ?? mineralPlan.mineral.id;
}

export function closestSourcePlan(creep: Creep, sourcePlans: SourcePlan[]): SourcePlan | null {
    let best: SourcePlan | null = null;
    let bestRange = Infinity;
    for (const plan of sourcePlans) {
        const range = creep.pos.getRangeTo(plan.source);
        if (range < bestRange) {
            best = plan;
            bestRange = range;
        }
    }
    return best;
}
