import { closest } from '../../utils/selection';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    TOWER_HAULER_DEPOSIT_RATIO,
    roomHasEnergyDemand,
    terminalEnergyReserveDeficit,
    towerEnergyRatio
} from '../energy';
import { miningSiteContainerIds } from './energyMiningSites';

export function energyDepositTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): StructureStorage | StructureTerminal | StructureContainer | StructureTower | null {
    if (context.structures.terminal &&
        context.structures.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        terminalEnergyReserveDeficit(context, reservations) > 0 &&
        !roomHasEnergyDemand(context)) {
        return context.structures.terminal;
    }

    const towerTarget = closest(creep, context.structures.towers
        .filter(t => towerEnergyRatio(t) < TOWER_HAULER_DEPOSIT_RATIO &&
            t.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[t.id] ?? 0)));
    if (towerTarget) { return towerTarget; }

    if (context.structures.storage && context.structures.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.terminal;
    }

    const sourceContainerIds = miningSiteContainerIds(context);
    const nonSourceContainers = context.structures.containers
        .filter((container) =>
            container.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            !sourceContainerIds[container.id]);
    if (nonSourceContainers.length > 0) {
        return closest(creep, nonSourceContainers);
    }

    return closest(
        creep,
        context.structures.containers.filter((container) => container.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
}
