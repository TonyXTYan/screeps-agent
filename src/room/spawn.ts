// Spawn planning helpers: body minimums, pending-request accounting, capacity measurement.
// runSpawnPlanner / chooseSpawnRequest live in room.controller.ts until remote spawn
// functions are co-extracted (they share mutual call dependencies).

import { BODY_BUDGET_RATIO, BODY_MIN_BUDGET, MAX_CARRY_CAPACITY, getBodyCapabilities, getCreepCapabilities, ensureArchetype } from '../creep/capabilities';
import { RoomControllerContext, SpawnRequest, PendingSpawnRequest } from './types';
import { desiredUpgraderWork } from './work';

// ── Body minimums ─────────────────────────────────────────────────────────────

export function minCarryForHauler(rcl: number): number {
    if (rcl >= 7) return 6;
    if (rcl >= 4) return 4;
    return 2;
}

export function minWorkForWorker(rcl: number): number {
    if (rcl >= 7) return 3;
    if (rcl >= 4) return 2;
    return 1;
}

export function minWorkForMiner(rcl: number): number {
    if (rcl >= 7) return 4;
    if (rcl >= 4) return 3;
    return 1;
}

export function meetsMinimumBody(body: BodyPartConstant[], archetype: CreepArchetype, rcl: number, fleetCount: number): boolean {
    if (fleetCount === 0) return true;
    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const carry = body.filter(p => p === CARRY).length;
        return carry >= minCarryForHauler(rcl);
    }
    if (archetype === 'worker') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForWorker(rcl);
    }
    if (archetype === 'miner' || archetype === 'remoteMiner' || archetype === 'mineralMiner') {
        const work = body.filter(p => p === WORK).length;
        return work >= minWorkForMiner(rcl);
    }
    return true;
}

// ── Pending-request accounting ────────────────────────────────────────────────

export function pendingSpawnRequest(request: SpawnRequest, plannedBody?: BodyPartConstant[]): PendingSpawnRequest {
    const pending: PendingSpawnRequest = {
        ...request
    };
    if (plannedBody) {
        pending.plannedBody = plannedBody;
    }
    return pending;
}

export function renewalDemandCreepsForRoom(roomName: string): Creep[] {
    const creeps: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if (creep.room.name !== roomName) { continue; }
        if ((creep.memory.homeRoom ?? creep.room.name) !== roomName) { continue; }
        if (!creep.memory.renewing &&
            !creep.memory.remoteRenewing &&
            !creep.memory.remoteHaulerRenewAfterTrip) {
            continue;
        }
        creeps.push(creep);
    }
    creeps.sort((a, b) => (a.ticksToLive ?? Infinity) - (b.ticksToLive ?? Infinity));
    return creeps;
}

export function pendingArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype === archetype) { count++; }
    }
    return count;
}

export function pendingRemoteArchetypeCount(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId?: string,
    standby?: boolean
): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && request.sourceId !== sourceId) { continue; }
        if (standby !== undefined && !!request.remoteStandby !== standby) { continue; }
        count++;
    }
    return count;
}

export function pendingRemoteBodyCapability(
    pending: PendingSpawnRequest[],
    archetype: CreepArchetype,
    remoteRoom: string,
    sourceId: string,
    capability: 'harvest' | 'haul'
): number {
    let total = 0;
    for (const request of pending) {
        if (request.archetype !== archetype) { continue; }
        if (request.remoteRoom !== remoteRoom) { continue; }
        if (request.sourceId !== sourceId) { continue; }
        if (!request.plannedBody) { continue; }
        const caps = getBodyCapabilities(request.plannedBody);
        total += capability === 'harvest' ? caps.harvest : caps.haul;
    }
    return total;
}

// ── Capacity measurement ──────────────────────────────────────────────────────

export function measureCapabilities(creeps: Creep[]): {
    minerWork: number;
    haulerCapacity: number;
    workerWork: number;
    heal: number;
    claim: number;
    mineralMinerWork: number;
    remoteMinerWork: number;
    remoteHaulerCapacity: number;
} {
    let minerWork = 0;
    let haulerCapacity = 0;
    let workerWork = 0;
    let heal = 0;
    let claim = 0;
    let mineralMinerWork = 0;
    let remoteMinerWork = 0;
    let remoteHaulerCapacity = 0;

    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        const capabilities = getCreepCapabilities(creep);

        if (archetype === 'miner') {
            minerWork += capabilities.harvest;
        }
        else if (archetype === 'hauler') { haulerCapacity += capabilities.haul; }
        else if (archetype === 'mineralMiner') { mineralMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteMiner') { remoteMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteHauler') { remoteHaulerCapacity += capabilities.haul; }
        else if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { /* tracked separately */ }
        else if (archetype === 'doctor' || archetype === 'claimer' || archetype === 'defender') { /* tracked separately */ }
        else { workerWork += capabilities.work; }

        heal += capabilities.heal;
        claim += capabilities.claim;
    }

    return {
        minerWork,
        haulerCapacity,
        workerWork,
        heal,
        claim,
        mineralMinerWork,
        remoteMinerWork,
        remoteHaulerCapacity
    };
}

export function addPendingCapabilities(
    capacities: ReturnType<typeof measureCapabilities>,
    pending: PendingSpawnRequest[]
): ReturnType<typeof measureCapabilities> {
    const totals = { ...capacities };
    for (const request of pending) {
        if (!request.plannedBody) { continue; }
        const caps = getBodyCapabilities(request.plannedBody);

        if (request.archetype === 'miner') {
            totals.minerWork += caps.harvest;
        } else if (request.archetype === 'hauler') {
            totals.haulerCapacity += caps.haul;
        } else if (request.archetype === 'mineralMiner') {
            totals.mineralMinerWork += caps.harvest;
        } else if (request.archetype === 'remoteMiner') {
            totals.remoteMinerWork += caps.harvest;
        } else if (request.archetype === 'remoteHauler') {
            totals.remoteHaulerCapacity += caps.haul;
        } else if (request.archetype === 'worker') {
            totals.workerWork += caps.work;
        }

        totals.heal += caps.heal;
        totals.claim += caps.claim;
    }
    return totals;
}

// ── Demand projections ────────────────────────────────────────────────────────

export function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 3) { return 1; }
    const remainingWork = context.constructionSites.reduce(
        (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 4 && remainingWork > 30000) { return 3; }
    if (remainingWork > 10000) { return 2; }
    return 1;
}

export function desiredHaulerCapacity(context: RoomControllerContext): { demand: number; maxCount: number } {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 10 ? 300 : 0;
    const rawDemand = context.sources.length * base + rclBonus + salvageBonus;

    const haulerBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const maxCarryPerHauler = Math.min(MAX_CARRY_CAPACITY, 2 * Math.floor(haulerBudget / 150) * CARRY_CAPACITY);
    const maxCount = Math.max(2, Math.ceil(rawDemand / Math.max(1, maxCarryPerHauler)) + 1);
    return { demand: Math.min(rawDemand, maxCarryPerHauler * maxCount), maxCount };
}

export function desiredWorkerWork(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (context.constructionSites.length > 0) {
        const base = Math.min(12, 4 + context.constructionSites.length);

        if (rcl >= 4) {
            const ratio = workerWorkRatio(context);
            const unitCost = ratio * 100 + 100;
            const unitParts = ratio + 2;
            const energyAvail = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
            const segments = Math.min(
                Math.floor(50 / unitParts),
                Math.floor(energyAvail / unitCost)
            );
            const workPerWorker = segments * ratio;
            const upgradeDemand = desiredUpgraderWork(rcl);
            const minWorkers = Math.max(2, 1 + Math.ceil(upgradeDemand / Math.max(1, workPerWorker)));
            return Math.max(base, minWorkers * workPerWorker);
        }

        return base;
    }
    if (rcl >= 8) { return 8; }
    if (rcl >= 7) { return 6; }
    return 4;
}
