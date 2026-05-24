import { closest } from '../utils/selection';
import type { JobReservations, RoomControllerContext } from './controllerTypes';
import { terminalEnergyReserveDeficit } from './energyTerminal';

export const TOWER_RESERVE_RATIO = 0.7;
export const TOWER_RECOVERY_RATIO = 0.55;
export const TOWER_HAULER_DEPOSIT_RATIO = 0.9;
// Workers only drop non-hauling work to emergency-refill spawns when critically low
export const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
// Spawn fill ratio at which haulers yield spawn priority to tower refill
export const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;

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
    _creep: Creep,
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

export function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}
