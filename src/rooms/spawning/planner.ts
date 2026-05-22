import {
    BODY_BUDGET_RATIO,
    BODY_MIN_BUDGET,
    bodyCost
} from '../../creep.capabilities';
import { planBodyForArchetype } from '../../creeps/bodyPlans';
import { reserveRenewSpawns } from '../../spawn.renewal';
import { countFleetForArchetype, creepsForHomeRoom } from '../remotes/fleet';
import type { PendingSpawnRequest, RoomControllerContext } from '../controllerTypes';
import {
    pendingArchetypeCount,
    pendingSpawnRequest,
    renewalDemandCreepsForRoom
} from './accounting';
import { meetsMinimumBody } from './bodyPolicy';
import { logRemoteSpawnSkip, remoteSpawnMinimumCost, remoteSpawnRecoveryBlockReason } from './remotePolicy';
import { collectPendingSpawningRequests, spawnRequestMemory, spawnRequestName } from './spawnRequestHelpers';
import { chooseSpawnRequest, desiredHaulerCapacity, desiredWorkerWork } from './requestSelection';

export function runSpawnPlanner(context: RoomControllerContext): void {
    const allFreeSpawns = context.structures.spawns.filter((s) => !s.spawning);
    if (allFreeSpawns.length === 0) { return; }

    // When multiple spawns are free, keep at least one unreserved for spawn planning
    // so long renew queues do not starve replacement/deficit spawns.
    const maxRenewReservations = allFreeSpawns.length > 1 ? allFreeSpawns.length - 1 : allFreeSpawns.length;
    const renewalReservedSpawnIds = reserveRenewSpawns(
        renewalDemandCreepsForRoom(context.room.name),
        allFreeSpawns,
        maxRenewReservations
    );
    const freeSpawns = allFreeSpawns.filter((spawn) => !renewalReservedSpawnIds[spawn.id]);
    if (freeSpawns.length === 0) { return; }

    const pending: PendingSpawnRequest[] = collectPendingSpawningRequests(context.structures.spawns);
    const rcl = context.room.controller?.level ?? 0;

    let remainingEnergy = context.room.energyAvailable;

    for (const spawn of freeSpawns) {
        let spawned = false;
        while (!spawned) {
            const request = chooseSpawnRequest(context, pending);
            if (!request) { break; }
            const homeFleet = creepsForHomeRoom(context.room.name);
            const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request, remainingEnergy);
            if (recoveryReason) {
                logRemoteSpawnSkip(context, request, recoveryReason);
                pending.push(pendingSpawnRequest(request));
                continue;
            }

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
                continue;
            }

            const cost = bodyCost(body);
            const remoteMinimumCost = remoteSpawnMinimumCost(context, request, cost);
            if (remoteMinimumCost > 0 && cost < remoteMinimumCost) {
                logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' planned=' + cost);
                pending.push(pendingSpawnRequest(request));
                continue;
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
                        continue;
                    }
                    if (meetsMinimumBody(affordableBody, request.archetype, rcl, fleetCount) && affordableCost <= remainingEnergy) {
                        const aName = spawnRequestName(request, spawn.name, pending.length);
                        const aCode = spawn.spawnCreep(affordableBody, aName, {
                            memory: spawnRequestMemory(context.room.name, request)
                        });
                        if (aCode === OK) {
                            console.log('room.controller: spawning ' + aName + ' for ' + request.reason + ' cost=' + affordableCost + ' (scaled from ' + cost + ')');
                            pending.push(pendingSpawnRequest(request, affordableBody));
                            remainingEnergy -= affordableCost;
                            spawned = true;
                        } else if (aCode !== ERR_BUSY && Game.time % 25 === 0) {
                            console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + aCode);
                            break;
                        } else {
                            pending.push(pendingSpawnRequest(request));
                            continue;
                        }
                    } else {
                        if (Game.time % 25 === 0) {
                            console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                        }
                        pending.push(pendingSpawnRequest(request));
                        continue;
                    }
                } else {
                    if (Game.time % 25 === 0) {
                        console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                    }
                    pending.push(pendingSpawnRequest(request));
                    continue;
                }
            } else {
                const name = spawnRequestName(request, spawn.name, pending.length);
                const code = spawn.spawnCreep(body, name, {
                    memory: spawnRequestMemory(context.room.name, request)
                });

                if (code === OK) {
                    console.log('room.controller: spawning ' + name + ' for ' + request.reason + ' cost=' + cost);
                    pending.push(pendingSpawnRequest(request, body));
                    remainingEnergy -= cost;
                    spawned = true;
                } else if (code !== ERR_BUSY && Game.time % 25 === 0) {
                    console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + code);
                    break;
                }
            }
        }
    }
}
export { desiredHaulerCapacity, desiredWorkerWork } from './requestSelection';
