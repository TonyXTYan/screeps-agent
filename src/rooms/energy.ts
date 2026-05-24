import type { JobReservations, RoomControllerContext } from './controllerTypes';
import {
    TOWER_HAULER_DEPOSIT_RATIO,
    TOWER_RECOVERY_RATIO,
    TOWER_REFILL_SPAWN_YIELD_RATIO,
    TOWER_RESERVE_RATIO,
    WORKER_EMERGENCY_SPAWN_RATIO,
    refillSpawnTarget,
    refillSpawnTargets,
    refillTerminalTarget,
    refillTowerTarget,
    refillTowerTargets,
    towerEnergyRatio
} from './energyRefill';
import {
    terminalEnergyReserveDeficit,
    terminalWithdrawableEnergy
} from './energyTerminal';

const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
export {
    terminalEnergyReserveDeficit,
    terminalWithdrawableEnergy
} from './energyTerminal';
export {
    TOWER_HAULER_DEPOSIT_RATIO,
    TOWER_RECOVERY_RATIO,
    TOWER_REFILL_SPAWN_YIELD_RATIO,
    TOWER_RESERVE_RATIO,
    WORKER_EMERGENCY_SPAWN_RATIO,
    refillSpawnTarget,
    refillSpawnTargets,
    refillTerminalTarget,
    refillTowerTarget,
    refillTowerTargets,
    towerEnergyRatio
} from './energyRefill';

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
