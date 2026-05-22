import { setJob, setResourceJob } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    refillSpawnTarget,
    roomHasEnergyDemand,
    roomNeedsCriticalEnergyRecovery,
    terminalEnergyReserveDeficit
} from '../energy';
import {
    reserveDroppedTarget,
    reserveResourceTarget
} from './reservations';
import {
    droppedResourceTarget,
    mineralContainerWithdrawalTarget,
    salvageWithdrawalTarget
} from './targets';
import { energyWithdrawalTarget } from './energyTargets';

export function assignHaulAcquisitionJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    const dropped = droppedResourceTarget(context, creep, reservations);
    if (dropped) {
        reserveDroppedTarget(reservations, dropped.id, Math.min(creep.store.getFreeCapacity(), dropped.amount));
        setResourceJob(creep, 'pickupResource', dropped, dropped.resourceType);
        return true;
    }

    const salvage = salvageWithdrawalTarget(context, creep, reservations);
    if (salvage) {
        reserveResourceTarget(reservations, salvage.target.id, Math.min(creep.store.getFreeCapacity(), salvage.amount));
        setResourceJob(creep, 'withdrawResource', salvage.target, salvage.resource);
        return true;
    }

    if (archetype === 'hauler' && tryAssignMineralContainerWithdrawal(context, creep, archetype, reservations)) {
        return true;
    }

    if ((archetype === 'hauler' || archetype === 'worker') && roomNeedsCriticalEnergyRecovery(context)) {
        const spawnTarget = refillSpawnTarget(context, creep, reservations);
        if (spawnTarget) {
            const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
            if (withdrawalTarget) {
                setJob(creep, 'withdrawEnergy', withdrawalTarget);
                return true;
            }
        }
    }

    if (archetype === 'hauler' &&
        context.structures.storage &&
        terminalEnergyReserveDeficit(context, reservations) > 0 &&
        !roomNeedsCriticalEnergyRecovery(context) &&
        !roomHasEnergyDemand(context)) {
        const storageReserved = reservations.resources[context.structures.storage.id] ?? 0;
        const storageAvailable = context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) - storageReserved;
        if (storageAvailable > 0) {
            setJob(creep, 'withdrawEnergy', context.structures.storage);
            return true;
        }
    }

    const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
    if (withdrawalTarget) {
        setJob(creep, 'withdrawEnergy', withdrawalTarget);
        return true;
    }

    if (archetype === 'worker' && tryAssignMineralContainerWithdrawal(context, creep, archetype, reservations)) {
        return true;
    }

    return false;
}

function tryAssignMineralContainerWithdrawal(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    const mineralContainer = mineralContainerWithdrawalTarget(context, creep, archetype, reservations);
    if (!mineralContainer) { return false; }
    reserveResourceTarget(reservations, mineralContainer.target.id, Math.min(creep.store.getFreeCapacity(), mineralContainer.amount));
    setResourceJob(creep, 'withdrawResource', mineralContainer.target, mineralContainer.resource);
    return true;
}
