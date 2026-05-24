import { ensureArchetype, getBodyCapabilities, getCreepCapabilities } from '../../creep.capabilities';
import type { PendingSpawnRequest, SpawnRequest } from '../controllerTypes';
export {
    pendingArchetypeCount,
    pendingRemoteArchetypeCount,
    pendingRemoteBodyCapability
} from './accountingPending';

export interface RoomFleetCapabilities {
    minerWork: number;
    haulerCapacity: number;
    workerWork: number;
    heal: number;
    claim: number;
    mineralMinerWork: number;
    remoteMinerWork: number;
    remoteHaulerCapacity: number;
}

export function measureCapabilities(creeps: Creep[]): RoomFleetCapabilities {
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

export function addPendingCapabilities(
    capacities: RoomFleetCapabilities,
    pending: PendingSpawnRequest[]
): RoomFleetCapabilities {
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
