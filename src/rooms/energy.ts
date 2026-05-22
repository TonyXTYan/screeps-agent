import type { JobReservations, RoomControllerContext } from './controllerTypes';
import { closest } from '../utils/selection';

export const TOWER_RESERVE_RATIO = 0.7;
export const TOWER_RECOVERY_RATIO = 0.55;
export const TOWER_HAULER_DEPOSIT_RATIO = 0.9;
const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
// Workers only drop non-hauling work to emergency-refill spawns when critically low
export const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
// Spawn fill ratio at which haulers yield spawn priority to tower refill
export const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;
const TERMINAL_RESERVE_RCL6 = 5000;
const TERMINAL_RESERVE_RCL7 = 10000;
const TERMINAL_RESERVE_RCL8 = 50000;

export function refillSpawnTargets(context: RoomControllerContext): EnergyStructure[] {
    return [...context.structures.spawns, ...context.structures.extensions]
        .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
}

export function refillTowerTargets(context: RoomControllerContext): EnergyStructure[] {
    return context.structures.towers
        .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO);
}

export function refillSpawnTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillSpawnTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

export function refillTowerTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillTowerTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

export function refillTerminalTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): StructureTerminal | null {
    const terminal = context.structures.terminal;
    if (!terminal || terminal.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return null;
    }
    const reserved = reservations.energySinks[terminal.id] ?? 0;
    const deficit = terminalEnergyReserveDeficit(context, reservations);
    return deficit > reserved ? terminal : null;
}

export function spawnEnergyRatio(context: RoomControllerContext): number {
    let used = 0, total = 0;
    for (const s of [...context.structures.spawns, ...context.structures.extensions]) {
        used += s.store.getUsedCapacity(RESOURCE_ENERGY);
        total += s.store.getCapacity(RESOURCE_ENERGY);
    }
    return total > 0 ? used / total : 1;
}

export function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
}

function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }
    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }
    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }
    return 0;
}

export function roomHasEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0 || refillTowerTargets(context).length > 0;
}

export function roomHasSpawnEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0;
}

export function roomNeedsCriticalEnergyRecovery(context: RoomControllerContext): boolean {
    const roomMemory = context.room.memory;
    const wasActive = roomMemory.energyRecoveryActive === true;

    const spawnRatio = spawnEnergyRatio(context);
    const hasLowTower = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_ENTER_TOWER_RATIO);
    const towersRecovered = context.structures.towers.every((tower) => towerEnergyRatio(tower) >= ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    const shouldEnter = spawnRatio < ENERGY_RECOVERY_ENTER_SPAWN_RATIO || hasLowTower;
    const shouldExit = spawnRatio >= ENERGY_RECOVERY_EXIT_SPAWN_RATIO && towersRecovered;

    if (wasActive) {
        if (shouldExit) {
            roomMemory.energyRecoveryActive = false;
        }
    } else if (shouldEnter) {
        roomMemory.energyRecoveryActive = true;
    }

    roomMemory.energyRecoveryReason = energyRecoveryReason(context, roomMemory.energyRecoveryActive === true);
    return roomMemory.energyRecoveryActive === true;
}

function energyRecoveryReason(context: RoomControllerContext, active: boolean): EnergyRecoveryReason {
    if (!active) { return 'none'; }

    const spawnHeld = spawnEnergyRatio(context) < ENERGY_RECOVERY_EXIT_SPAWN_RATIO;
    const towerHeld = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    if (spawnHeld && towerHeld) { return 'spawn+tower'; }
    if (spawnHeld) { return 'spawn'; }
    if (towerHeld) { return 'tower'; }
    return 'hysteresis';
}

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

export function storedEnergy(context: RoomControllerContext): number {
    const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    return storageEnergy + terminalEnergy;
}

export function sumFreeEnergy(structures: EnergyStructure[]): number {
    let total = 0;
    for (const structure of structures) {
        total += structure.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return total;
}

export function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}
