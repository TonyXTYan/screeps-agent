// Home-room energy management: stored energy, refill targets, deposit/withdrawal routing,
// energy state (recovery, pressure), terminal reserves, link receivers, interrupts.

import { RoomControllerContext, JobReservations, ResourceTarget } from './types';
import { getCreepCapabilities } from '../creep/capabilities';
import {
    TOWER_RESERVE_RATIO, TOWER_RECOVERY_RATIO, TOWER_HAULER_DEPOSIT_RATIO,
    ENERGY_RECOVERY_ENTER_SPAWN_RATIO, ENERGY_RECOVERY_EXIT_SPAWN_RATIO,
    ENERGY_RECOVERY_ENTER_TOWER_RATIO, ENERGY_RECOVERY_EXIT_TOWER_RATIO,
    WORKER_EMERGENCY_SPAWN_RATIO, TOWER_REFILL_SPAWN_YIELD_RATIO,
    TERMINAL_RESERVE_RCL6, TERMINAL_RESERVE_RCL7, TERMINAL_RESERVE_RCL8,
} from './constants';
import { closest } from './targeting';
import { firstStoredResource, firstStoredNonEnergyResource, haulerMiningSiteMinPickup } from './storeUtils';

// ---------------------------------------------------------------------------
// Core stored-energy helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Spawn / spawn-energy state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Energy recovery (hysteresis stored in room memory)
// ---------------------------------------------------------------------------

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

export function energyRecoveryReason(context: RoomControllerContext, active: boolean): EnergyRecoveryReason {
    if (!active) { return 'none'; }

    const spawnHeld = spawnEnergyRatio(context) < ENERGY_RECOVERY_EXIT_SPAWN_RATIO;
    const towerHeld = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    if (spawnHeld && towerHeld) { return 'spawn+tower'; }
    if (spawnHeld) { return 'spawn'; }
    if (towerHeld) { return 'tower'; }
    return 'hysteresis';
}

// ---------------------------------------------------------------------------
// Terminal reserve helpers
// ---------------------------------------------------------------------------

export function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }
    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }
    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }
    return 0;
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

// ---------------------------------------------------------------------------
// Refill target finders
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dropped / salvage / mineral withdrawal targets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deposit / withdrawal targets
// ---------------------------------------------------------------------------

export function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

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

    const sourceContainerIds: { [id: string]: boolean } = {};
    for (const sourcePlan of context.sourcePlans) {
        if (sourcePlan.container) {
            sourceContainerIds[sourcePlan.container.id] = true;
        }
    }

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
    const miningSiteContainerIds: { [id: string]: boolean } = {};
    for (const sourcePlan of context.sourcePlans) {
        if (sourcePlan.container) {
            miningSiteContainerIds[sourcePlan.container.id] = true;
        }
    }
    if (context.mineralPlan?.container) {
        miningSiteContainerIds[context.mineralPlan.container.id] = true;
    }

    const sourceContainers = context.structures.containers
        .filter((container) => {
            // Threshold of 50 prevents idle stalls when containers dip below 200. Subtract reservations to avoid over-committing.
            const reserved = reservations.resources[container.id] ?? 0;
            const available = container.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
            if (available <= 0) { return false; }

            const baseMin = Math.min(50, creep.store.getFreeCapacity(RESOURCE_ENERGY));
            if (!isHauler) { return available >= baseMin; }
            if (!miningSiteContainerIds[container.id]) { return available >= baseMin; }
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

// ---------------------------------------------------------------------------
// Link receivers
// ---------------------------------------------------------------------------

export function linkReceivers(context: RoomControllerContext): StructureLink[] {
    const receivers: StructureLink[] = [];
    const spawnPressure = spawnEnergyPressure(context);
    const controllerNeedsEnergy = context.room.controller !== undefined &&
        context.structures.links.controller.some((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) < 400);

    if (spawnPressure > 0) {
        receivers.push(...context.structures.links.sink, ...context.structures.links.hub);
    }

    if (controllerNeedsEnergy) {
        receivers.push(...context.structures.links.controller);
    }

    receivers.push(...context.structures.links.hub, ...context.structures.links.controller);
    return uniqueLinks(receivers);
}

export function uniqueLinks(links: StructureLink[]): StructureLink[] {
    const seen: { [id: string]: boolean } = {};
    const result: StructureLink[] = [];
    for (const link of links) {
        if (seen[link.id]) { continue; }
        seen[link.id] = true;
        result.push(link);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Energy interrupt helpers
// ---------------------------------------------------------------------------

export function shouldInterruptForEnergyRefill(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    if (archetype === 'miner' || archetype === 'mineralMiner' ||
        (archetype === 'worker' && context.structures.storage)) { return false; }
    if (!roomNeedsCriticalEnergyRecovery(context)) { return false; }
    if (refillSpawnTarget(context, creep, reservations)) { return true; }
    return refillTowerTarget(context, creep, reservations) !== null;
}

export function canEmergencyDeliverEnergy(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>
): boolean {
    if (archetype === 'miner' || archetype === 'remoteMiner' || archetype === 'mineralMiner' || archetype === 'remoteHauler') {
        return false;
    }
    if (capabilities.haul <= 0) { return false; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return false; }
    if (archetype === 'worker') {
        return spawnEnergyRatio(context) < WORKER_EMERGENCY_SPAWN_RATIO;
    }
    if (roomHasSpawnEnergyDemand(context)) { return true; }
    // Tower-only demand: only interrupt haulers, not workers mid-build
    return archetype === 'hauler' && refillTowerTargets(context).length > 0;
}

// ---------------------------------------------------------------------------
// Reservation helpers
// ---------------------------------------------------------------------------

export function reserveResourceTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.resources[targetId] = (reservations.resources[targetId] ?? 0) + Math.max(0, amount);
}

export function reserveDroppedTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.dropped[targetId] = (reservations.dropped[targetId] ?? 0) + Math.max(0, amount);
}

export function reserveEnergySink(reservations: JobReservations, target: EnergyStructure, amount: number): void {
    const alreadyReserved = reservations.energySinks[target.id] ?? 0;
    const remainingCapacity = Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY) - alreadyReserved);
    const reserveAmount = Math.min(Math.max(0, amount), remainingCapacity);
    reservations.energySinks[target.id] = alreadyReserved + reserveAmount;
}
