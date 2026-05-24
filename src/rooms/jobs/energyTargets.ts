import { closest } from '../../utils/selection';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { energyDepositTarget } from './energyDeposit';
import {
    haulerMiningSiteMinPickup,
    isMiningSiteEnergyTarget,
    miningSiteContainerIds
} from './energyMiningSites';
import {
    roomNeedsCriticalEnergyRecovery,
    terminalWithdrawableEnergy,
} from '../energy';
export { haulerMiningSiteMinPickup, isMiningSiteEnergyTarget } from './energyMiningSites';
export { energyDepositTarget } from './energyDeposit';

export function hasEnergyToGather(context: RoomControllerContext): boolean {
    if (context.droppedEnergy.length > 0) return true;
    if (context.tombstones.length > 0) return true;
    if (context.structures.containers.some(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return true;
    if (context.structures.links.source.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.controller.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.hub.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.sink.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    return false;
}

export function energyWithdrawalTarget(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): StructureContainer | StructureStorage | StructureTerminal | StructureLink | null {
    if (archetype === 'worker' &&
        context.structures.storage &&
        context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    const haulerMinPickup = haulerMiningSiteMinPickup(creep);
    const isHauler = archetype === 'hauler' || archetype === 'remoteHauler';
    const sourceContainerIds = miningSiteContainerIds(context);

    const sourceContainers = context.structures.containers
        .filter((container) => {
            // Threshold of 50 prevents idle stalls when containers dip below 200. Subtract reservations to avoid over-committing.
            const reserved = reservations.resources[container.id] ?? 0;
            const available = container.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
            if (available <= 0) { return false; }

            const baseMin = Math.min(50, creep.store.getFreeCapacity(RESOURCE_ENERGY));
            if (!isHauler) { return available >= baseMin; }
            if (!sourceContainerIds[container.id]) { return available >= baseMin; }
            return available >= haulerMinPickup;
        });
    const sourceLinks = context.structures.links.source
        .filter((link) => {
            const available = link.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[link.id] ?? 0);
            if (available <= 0) { return false; }
            if (!isHauler) { return true; }
            return available >= haulerMinPickup;
        });
    const allowTerminalReserveBreak = roomNeedsCriticalEnergyRecovery(context);
    const terminalAvailable = terminalWithdrawableEnergy(context, reservations, allowTerminalReserveBreak);
    const terminalTarget = context.structures.terminal && terminalAvailable > 0 ? context.structures.terminal : null;

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        // If already at a source site (e.g. picking up dropped energy), top up from the container/link
        // before leaving — but only if it meets the min-pickup threshold, to avoid draining trickles.
        const nearbySourceContainer = context.sourcePlans
            .map(p => p.container)
            .find(c => c &&
                creep.pos.getRangeTo(c) <= 3 &&
                (c.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[c.id] ?? 0)) >= haulerMinPickup);
        if (nearbySourceContainer) { return nearbySourceContainer; }

        const nearbySourceLink = context.structures.links.source.find(l =>
            creep.pos.getRangeTo(l) <= 3 &&
            (l.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[l.id] ?? 0)) >= haulerMinPickup);
        if (nearbySourceLink) { return nearbySourceLink; }

        const sourceIds = new Set(context.structures.links.source.map(l => l.id));
        const demandLinks = [...context.structures.links.hub, ...context.structures.links.controller, ...context.structures.links.sink]
            .filter((link) => !sourceIds.has(link.id) && link.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        // Primary: drain hub/controller/sink links so they always have capacity for incoming transfers.
        // Exclude source links even if dual-classified — they use the min-pickup threshold below.
        // Fallback to source containers/links only when link chain can't keep up (overflow).
        return closest(creep, demandLinks) ??
               terminalTarget ??
               closest(creep, sourceContainers) ??
               closest(creep, sourceLinks);
    }

    const linkWithEnergy = closest(creep, [...context.structures.links.controller, ...context.structures.links.hub, ...sourceLinks]
        .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0));
    if (linkWithEnergy) { return linkWithEnergy; }

    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    return terminalTarget ?? closest(creep, [...sourceContainers, ...sourceLinks]);
}
