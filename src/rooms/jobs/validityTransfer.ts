import { ensureArchetype } from '../../creep.capabilities';
import { firstStoredResourcePreferNonEnergy as firstStoredResource } from '../../resources/store';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { roomNeedsCriticalEnergyRecovery, terminalWithdrawableEnergy } from '../energy';
import { haulerMiningSiteMinPickup, isMiningSiteEnergyTarget } from './energyTargets';

export function isWithdrawEnergyJobValid(
    context: RoomControllerContext,
    creep: Creep,
    storeTarget: StructureContainer | StructureStorage | StructureTerminal | StructureLink,
    reservations: JobReservations
): boolean {
    const archetype = ensureArchetype(creep);
    const storage = context.structures.storage;
    if (archetype === 'worker' &&
        storage &&
        storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        storeTarget.id !== storage.id) {
        return false;
    }

    if (storeTarget.structureType === STRUCTURE_TERMINAL) {
        const available = terminalWithdrawableEnergy(context, reservations, roomNeedsCriticalEnergyRecovery(context));
        return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && available > 0;
    }

    const reserved = reservations.resources[storeTarget.id] ?? 0;
    const available = storeTarget.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0 || available <= 0) { return false; }
    if (archetype === 'hauler' &&
        isMiningSiteEnergyTarget(context, storeTarget)) {
        return available >= haulerMiningSiteMinPickup(creep);
    }
    return true;
}

export function isWithdrawResourceJobValid(
    creep: Creep,
    storeTarget: WithdrawStructure,
    reservations: JobReservations
): boolean {
    const resource = creep.memory.jobResourceType ?? firstStoredResource(storeTarget.store);
    if (!resource || creep.store.getFreeCapacity() === 0) { return false; }
    const remaining = (storeTarget.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[storeTarget.id] ?? 0);
    if (remaining <= 0) { return false; }
    const archetype = ensureArchetype(creep);
    if ((archetype === 'hauler' || archetype === 'worker') &&
        resource !== RESOURCE_ENERGY &&
        storeTarget instanceof StructureContainer) {
        return remaining >= haulerMiningSiteMinPickup(creep);
    }
    return true;
}

export function isPickupJobValid(
    creep: Creep,
    resource: Resource<ResourceConstant>,
    reservations: JobReservations
): boolean {
    if (creep.store.getFreeCapacity() === 0 || resource.amount <= 0) { return false; }
    const remaining = resource.amount - (reservations.dropped[resource.id] ?? 0);
    return remaining > 0;
}

export function isDepositEnergyJobValid(
    creep: Creep,
    energyTarget: EnergyStructure,
    reservations: JobReservations
): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        energyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[energyTarget.id] ?? 0);
}

export function isDepositResourceJobValid(
    creep: Creep,
    storeTarget: StructureStorage | StructureTerminal | StructureContainer
): boolean {
    const resource = creep.memory.jobResourceType ?? firstStoredResource(creep.store);
    return Boolean(resource) && storeTarget.store.getFreeCapacity(resource as ResourceConstant) > 0;
}
