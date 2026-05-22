import { bodyCost, getBodyCapabilities } from '../../creep.capabilities';
import { planBodyForArchetype } from '../../creeps/bodyPlans';
import { creepsForHomeRoom } from '../remotes/fleet';
import type { RoomControllerContext, SpawnRequest } from '../controllerTypes';
import {
    isEmergencyRemoteRequest,
    isRemoteSpawnRequest,
    remoteSourcePlanForRequest
} from './remotePolicyShared';

const REMOTE_HAULER_ABSOLUTE_MIN_COST = 600;
const REMOTE_HAULER_USEFUL_MIN_COST = 900;
const REMOTE_HAULER_MIN_DEMAND_RATIO = 0.4;
const REMOTE_MAINTAINER_MIN_COST = 500;

export function remoteSpawnMinimumCost(
    context: RoomControllerContext,
    request: SpawnRequest,
    plannedCost: number
): number {
    if (!isRemoteSpawnRequest(request)) { return 0; }

    if (request.archetype === 'remoteHauler') {
        const demand = remoteSourcePlanForRequest(context, request)?.haulerCapacityDemand ?? 150;
        const capacityCost = remoteHaulerCostForCapacity(Math.ceil(demand * REMOTE_HAULER_MIN_DEMAND_RATIO));
        return Math.max(REMOTE_HAULER_ABSOLUTE_MIN_COST, Math.min(REMOTE_HAULER_USEFUL_MIN_COST, capacityCost));
    }

    if (request.archetype === 'remoteMiner') {
        const homeFleet = creepsForHomeRoom(context.room.name);
        if (isEmergencyRemoteRequest(homeFleet, request)) {
            return bodyCost([WORK, CARRY, MOVE]);
        }
        const sourcePlan = remoteSourcePlanForRequest(context, request);
        const workDemand = sourcePlan?.workDemand ?? 3;
        return remoteMinerCostForWorkDemand(context, request, workDemand, plannedCost);
    }

    if (request.archetype === 'remoteMaintainer') {
        return REMOTE_MAINTAINER_MIN_COST;
    }

    if (request.archetype === 'claimer' && request.remoteMode === 'reserve') {
        return (request.minClaimParts ?? 1) * bodyCost([CLAIM, MOVE]);
    }

    return 0;
}

function remoteHaulerCostForCapacity(capacity: number): number {
    const segments = Math.max(1, Math.ceil(capacity / (2 * CARRY_CAPACITY)));
    return segments * bodyCost([CARRY, CARRY, MOVE]);
}

function remoteMinerCostForWorkDemand(
    context: RoomControllerContext,
    request: SpawnRequest,
    workDemand: number,
    plannedCost: number
): number {
    for (let budget = bodyCost([WORK, CARRY, MOVE]); budget <= context.room.energyCapacityAvailable; budget += 50) {
        const body = planBodyForArchetype('remoteMiner', budget, {
            staticMining: request.staticMining,
            hasContainer: request.hasContainer
        });
        if (body.length === 0) { continue; }
        if (getBodyCapabilities(body).harvest >= workDemand) {
            return bodyCost(body);
        }
    }
    return plannedCost;
}
