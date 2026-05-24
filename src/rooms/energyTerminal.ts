import type { JobReservations, RoomControllerContext } from './controllerTypes';

const TERMINAL_RESERVE_RCL6 = 5000;
const TERMINAL_RESERVE_RCL7 = 10000;
const TERMINAL_RESERVE_RCL8 = 50000;

export function terminalWithdrawableEnergy(
    context: RoomControllerContext,
    reservations: JobReservations,
    allowReserveBreak: boolean
): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }
    const reserved = reservations.resources[terminal.id] ?? 0;
    const available = terminal.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
    if (available <= 0) { return 0; }
    if (allowReserveBreak) { return available; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    return Math.max(0, available - reserveTarget);
}

export function terminalEnergyReserveDeficit(context: RoomControllerContext, reservations: JobReservations): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    if (reserveTarget <= 0) { return 0; }

    const incomingReserved = reservations.energySinks[terminal.id] ?? 0;
    const projectedEnergy = terminal.store.getUsedCapacity(RESOURCE_ENERGY) + incomingReserved;
    return Math.max(0, reserveTarget - projectedEnergy);
}

function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }
    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }
    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }
    return 0;
}
