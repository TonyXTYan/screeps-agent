import {
    BODY_BUDGET_RATIO,
    BODY_MIN_BUDGET,
    bodyCost
} from '../../creep.capabilities';
import { planBodyForArchetype } from '../../creeps/bodyPlans';
import { countFleetForArchetype } from '../remotes/fleet';
import type { PendingSpawnRequest, RoomControllerContext, SpawnRequest } from '../controllerTypes';
import {
    pendingArchetypeCount,
    pendingSpawnRequest
} from './accounting';
import { meetsMinimumBody } from './bodyPolicy';
import { logRemoteSpawnSkip, remoteSpawnMinimumCost } from './remotePolicy';
import { spawnRequestMemory, spawnRequestName } from './spawnRequestHelpers';

export interface SpawnAttemptResult {
    breakLoop: boolean;
    remainingEnergy: number;
    spawned: boolean;
}

export function trySpawnRequest(
    context: RoomControllerContext,
    spawn: StructureSpawn,
    request: SpawnRequest,
    pending: PendingSpawnRequest[],
    remainingEnergy: number
): SpawnAttemptResult {
    const rcl = context.room.controller?.level ?? 0;
    const defaultBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const maxBudget = request.archetype === 'claimer' && request.remoteMode === 'reserve'
        ? context.room.energyCapacityAvailable
        : defaultBudget;
    const body = planBodyForArchetype(request.archetype, maxBudget, {
        staticMining: request.staticMining,
        hasContainer: request.hasContainer,
        workRatio: request.workRatio,
        minClaimParts: request.minClaimParts,
        maxClaimParts: request.maxClaimParts
    });

    if (body.length === 0) {
        if (Game.time % 25 === 0) {
            console.log('room.controller: waiting for energy to spawn ' + request.archetype + ' for ' + request.reason);
        }
        pending.push(pendingSpawnRequest(request));
        return { breakLoop: false, remainingEnergy, spawned: false };
    }

    const cost = bodyCost(body);
    const remoteMinimumCost = remoteSpawnMinimumCost(context, request, cost);
    if (remoteMinimumCost > 0 && cost < remoteMinimumCost) {
        logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' planned=' + cost);
        pending.push(pendingSpawnRequest(request));
        return { breakLoop: false, remainingEnergy, spawned: false };
    }

    if (cost > remainingEnergy) {
        const affordableBody = planBodyForArchetype(request.archetype, remainingEnergy, {
            staticMining: request.staticMining,
            hasContainer: request.hasContainer,
            workRatio: request.workRatio,
            minClaimParts: request.minClaimParts,
            maxClaimParts: request.maxClaimParts
        });
        if (affordableBody.length > 0) {
            const affordableCost = bodyCost(affordableBody);
            const fleetCount = countFleetForArchetype(context.creeps, request.archetype) +
                pendingArchetypeCount(pending, request.archetype);
            if (remoteMinimumCost > 0 && affordableCost < remoteMinimumCost) {
                logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' have=' + affordableCost + ' planned=' + cost);
                pending.push(pendingSpawnRequest(request));
                return { breakLoop: false, remainingEnergy, spawned: false };
            }
            if (meetsMinimumBody(affordableBody, request.archetype, rcl, fleetCount) && affordableCost <= remainingEnergy) {
                const aName = spawnRequestName(request, spawn.name, pending.length);
                const aCode = spawn.spawnCreep(affordableBody, aName, {
                    memory: spawnRequestMemory(context.room.name, request)
                });
                if (aCode === OK) {
                    console.log('room.controller: spawning ' + aName + ' for ' + request.reason + ' cost=' + affordableCost + ' (scaled from ' + cost + ')');
                    pending.push(pendingSpawnRequest(request, affordableBody));
                    return { breakLoop: false, remainingEnergy: remainingEnergy - affordableCost, spawned: true };
                }
                if (aCode !== ERR_BUSY && Game.time % 25 === 0) {
                    console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + aCode);
                    return { breakLoop: true, remainingEnergy, spawned: false };
                }
                pending.push(pendingSpawnRequest(request));
                return { breakLoop: false, remainingEnergy, spawned: false };
            }
            logInsufficientEnergy(request, cost, remainingEnergy);
            pending.push(pendingSpawnRequest(request));
            return { breakLoop: false, remainingEnergy, spawned: false };
        }
        logInsufficientEnergy(request, cost, remainingEnergy);
        pending.push(pendingSpawnRequest(request));
        return { breakLoop: false, remainingEnergy, spawned: false };
    }

    const name = spawnRequestName(request, spawn.name, pending.length);
    const code = spawn.spawnCreep(body, name, {
        memory: spawnRequestMemory(context.room.name, request)
    });

    if (code === OK) {
        console.log('room.controller: spawning ' + name + ' for ' + request.reason + ' cost=' + cost);
        pending.push(pendingSpawnRequest(request, body));
        return { breakLoop: false, remainingEnergy: remainingEnergy - cost, spawned: true };
    }
    if (code !== ERR_BUSY && Game.time % 25 === 0) {
        console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + code);
        return { breakLoop: true, remainingEnergy, spawned: false };
    }
    return { breakLoop: false, remainingEnergy, spawned: false };
}

function logInsufficientEnergy(request: SpawnRequest, need: number, have: number): void {
    if (Game.time % 25 === 0) {
        console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + need + ' have=' + have);
    }
}
