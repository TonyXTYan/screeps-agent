import { firstStoredNonEnergyResource, firstStoredResourcePreferNonEnergy as firstStoredResource } from '../../resources/store';
import type { JobReservations, ResourceTarget, RoomControllerContext } from '../controllerTypes';
import { haulerMiningSiteMinPickup } from './energyTargets';

export function droppedResourceTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): Resource<ResourceConstant> | null {
    let best: Resource<ResourceConstant> | null = null;
    let bestRange = Infinity;

    for (const resource of context.droppedResources) {
        const remaining = resource.amount - (reservations.dropped[resource.id] ?? 0);
        if (remaining <= 0) { continue; }

        const range = creep.pos.getRangeTo(resource);
        if (range < bestRange) {
            best = resource;
            bestRange = range;
        }
    }

    return best;
}

export function salvageWithdrawalTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): ResourceTarget | null {
    const targets: WithdrawStructure[] = [...context.tombstones, ...context.ruins];
    let best: ResourceTarget | null = null;
    let bestRange = Infinity;

    for (const target of targets) {
        const resource = firstStoredResource(target.store);
        if (!resource) { continue; }
        const remaining = (target.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[target.id] ?? 0);
        if (remaining <= 0) { continue; }

        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = { target, resource, amount: remaining };
            bestRange = range;
        }
    }

    return best;
}

export function mineralContainerWithdrawalTarget(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): ResourceTarget | null {
    if (archetype !== 'hauler' && archetype !== 'worker') { return null; }
    if (creep.store.getFreeCapacity() <= 0) { return null; }

    const container = context.mineralPlan?.container;
    if (!container) { return null; }

    const resource = firstStoredNonEnergyResource(container.store);
    if (!resource) { return null; }

    const remaining = (container.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[container.id] ?? 0);
    if (remaining <= 0) { return null; }
    if (remaining < haulerMiningSiteMinPickup(creep)) { return null; }

    return { target: container, resource, amount: remaining };
}

export function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}
