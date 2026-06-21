// Remote spawn planning: request generation, cost checks, recovery gating, body sizing.

import {
    ensureArchetype, planBodyForArchetype, getBodyCapabilities, bodyCost,
    BODY_MIN_BUDGET, BODY_BUDGET_RATIO,
} from '../../creep/capabilities';
import { reserveRenewSpawns } from '../../spawn/renewal';
import {
    pendingSpawnRequest, renewalDemandCreepsForRoom, pendingArchetypeCount,
    pendingRemoteArchetypeCount, pendingRemoteBodyCapability,
    addPendingCapabilities, measureCapabilities, desiredHaulerCapacity, desiredWorkerWork,
    meetsMinimumBody, workerWorkRatio,
} from '../spawn';
import {
    creepsForHomeRoom, countRemoteScouts, hasAssignedNonScoutRemoteCreep, remoteClaimerCount,
    countActiveRemoteMinersForRoom, countSourceLessRemoteStandbyMiners,
    sourceNeedingStandbyReplacement, projectedRemoteMinerWork, projectedRemoteHaulerCapacity,
    countRemoteMinersForSource, remoteSourceActiveMinerLimit, hasRemoteStandbyMinerForSource,
    countRemoteHaulersForSource, hasIdleRemoteHauler, remoteNeedsMaintainer, countRemoteMaintainersForRoom,
    remoteSourceHasContainerStation, remoteSourceReplacementHorizon, countFleetForArchetype,
    remoteReserverReplacementHorizon, remoteMaintainerReplacementHorizon,
} from './fleet';
import { findHostiles } from '../../hostileUtils';
import { remoteArmedFailsafeActive, remoteNeedsRouteHealthMaintainer } from './planning';
import { desiredRemoteMaintainerCount } from './maintenance';
import { sourceSpawnDeficit, stationaryTargetIdForSource, stationaryTargetIdForMineral, activeMinerCount } from '../source';
import { mineralReadyToMine } from '../work';
import { storedEnergy } from '../energy';
import { legacyRoleForArchetype } from '../targeting';
import { RoomControllerContext, SpawnRequest, PendingSpawnRequest } from '../types';
import {
    REMOTE_HOME_RECOVERY_STORED_ENERGY, REMOTE_SPAWN_MIN_ENERGY_RATIO, REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED,
    REMOTE_HAULER_MIN_DEMAND_RATIO, REMOTE_HAULER_ABSOLUTE_MIN_COST, REMOTE_HAULER_USEFUL_MIN_COST,
    REMOTE_MAINTAINER_MIN_COST, REMOTE_THROTTLE_STORED_ENERGY,
    REMOTE_HAULER_RETARGET_STUCK_TICKS, MAX_REMOTE_HAULERS_PER_SOURCE,
    REMOTE_RESERVER_CLAIM_PARTS, REMOTE_RESERVER_PANIC_CLAIM_PARTS,
    REMOTE_RESERVER_PANIC_TTL, REMOTE_RESERVE_REFRESH_TTL,
} from '../constants';

const CURRENTLY_SPAWNING_REASON = 'currently spawning';

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

    const pending: PendingSpawnRequest[] = [];
    const rcl = context.room.controller?.level ?? 0;

    for (const spawn of context.structures.spawns) {
        if (!spawn.spawning) continue;
        const memory = Memory.creeps[spawn.spawning.name];
        if (!memory || !memory.archetype) continue;
        const spawningCreep = Game.creeps[spawn.spawning.name];
        pending.push(pendingSpawnRequest({
            archetype: memory.archetype,
            sourceId: memory.sourceId ?? memory.assignedSourceId,
            remoteRoom: memory.remoteRoom,
            remoteMode: memory.remoteMode,
            remoteStandby: memory.remoteStandby,
            reason: CURRENTLY_SPAWNING_REASON
        }, spawningCreep?.body.map((part) => part.type)));
    }

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
            const maxBudget = request.useFullEnergyCapacity || (request.archetype === 'claimer' && request.remoteMode === 'reserve')
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
            if (request.minimumBodyCost && cost < request.minimumBodyCost) {
                logRemoteSpawnSkip(context, request, 'body below request minimum need=' + request.minimumBodyCost + ' planned=' + cost);
                pending.push(pendingSpawnRequest(request));
                continue;
            }
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
                    if (request.minimumBodyCost && affordableCost < request.minimumBodyCost) {
                        logRemoteSpawnSkip(context, request, 'body below request minimum need=' + request.minimumBodyCost + ' have=' + affordableCost + ' planned=' + cost);
                        pending.push(pendingSpawnRequest(request));
                        continue;
                    }
                    if (remoteMinimumCost > 0 && affordableCost < remoteMinimumCost) {
                        logRemoteSpawnSkip(context, request, 'body below minimum need=' + remoteMinimumCost + ' have=' + affordableCost + ' planned=' + cost);
                        pending.push(pendingSpawnRequest(request));
                        continue;
                    }
                    if (meetsMinimumBody(affordableBody, request.archetype, rcl, fleetCount) && affordableCost <= remainingEnergy) {
                        const aName = request.archetype + '-' + spawn.name + '-' + Game.time + (pending.length > 0 ? '-' + pending.length : '');
                        const aRole = legacyRoleForArchetype(request.archetype);
                        const aCode = spawn.spawnCreep(affordableBody, aName, {
                            memory: {
                                archetype: request.archetype,
                                role: aRole,
                                sourceId: request.sourceId,
                                assignedSourceId: request.sourceId,
                                assignedMineralId: request.mineralId,
                                stationaryTargetId: request.stationaryTargetId,
                                staticMining: request.staticMining,
                                homeRoom: context.room.name,
                                remoteRoom: request.remoteRoom,
                                remoteMode: request.remoteMode,
                                remoteStandby: request.remoteStandby
                            }
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
                const name = request.archetype + '-' + spawn.name + '-' + Game.time + (pending.length > 0 ? '-' + pending.length : '');
                const role = legacyRoleForArchetype(request.archetype);
                const code = spawn.spawnCreep(body, name, {
                    memory: {
                        archetype: request.archetype,
                        role,
                        sourceId: request.sourceId,
                        assignedSourceId: request.sourceId,
                        assignedMineralId: request.mineralId,
                        stationaryTargetId: request.stationaryTargetId,
                        staticMining: request.staticMining,
                        homeRoom: context.room.name,
                        remoteRoom: request.remoteRoom,
                        remoteMode: request.remoteMode,
                        remoteStandby: request.remoteStandby
                    }
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

function chooseSpawnRequest(context: RoomControllerContext, pending: PendingSpawnRequest[] = []): SpawnRequest | null {
    const capacities = addPendingCapabilities(measureCapabilities(context.creeps), pending);
    const { demand: haulerCapacityDemand, maxCount: maxHaulerCount } = desiredHaulerCapacity(context);
    const workerWorkDemand = desiredWorkerWork(context);

    if (context.creeps.length === 0 && !pending.some(r => r.archetype === 'worker')) {
        return { archetype: 'worker', reason: 'emergency recovery' };
    }

    const pendingSourceIds = new Set(
        pending.filter(r => r.archetype === 'miner' && r.sourceId).map(r => r.sourceId!)
    );
    const sourceDeficit = sourceSpawnDeficit(context, pendingSourceIds);
    if (sourceDeficit) {
        return {
            archetype: 'miner',
            reason: 'source harvest deficit ' + sourceDeficit.source.id,
            sourceId: sourceDeficit.source.id,
            stationaryTargetId: stationaryTargetIdForSource(sourceDeficit),
            staticMining: sourceDeficit.staticMining
        };
    }

    const patrolRequest = patrolSpawnRequest(context, pending);
    if (patrolRequest) {
        return patrolRequest;
    }

    const pendingHaulerCount = pendingArchetypeCount(pending, 'hauler');
    const haulerCount = context.creeps.filter(c => ensureArchetype(c) === 'hauler' && !c.spawning).length;
    if (context.structures.storage && (context.room.controller?.level ?? 0) >= 4 &&
        haulerCount + pendingHaulerCount < 2) {
        return { archetype: 'hauler', reason: 'min hauler count 2' };
    }

    const haulerCountWithPending = haulerCount + pendingHaulerCount;
    if (capacities.haulerCapacity < haulerCapacityDemand &&
        haulerCountWithPending < maxHaulerCount &&
        !pending.some(r => r.archetype === 'hauler')) {
        return { archetype: 'hauler', reason: 'haul deficit ' + capacities.haulerCapacity + '/' + haulerCapacityDemand + ' ' + haulerCountWithPending + '/' + maxHaulerCount };
    }

    if (capacities.workerWork < workerWorkDemand && !pending.some(r => r.archetype === 'worker')) {
        const rcl = context.room.controller?.level ?? 0;
        const maxWorkerCount = context.constructionSites.length < 3
            ? 1
            : ([0, 2, 2, 2, 3, 3, 3, 4, 4][Math.min(rcl, 8)] || 4);
        const workerCreeps = context.creeps.filter(c => ensureArchetype(c) === 'worker' && !c.spawning).length +
            pendingArchetypeCount(pending, 'worker');
        if (workerCreeps < maxWorkerCount) {
            return { archetype: 'worker', reason: 'worker deficit ' + capacities.workerWork + '/' + workerWorkDemand + ' ' + workerCreeps + '/' + maxWorkerCount, workRatio: workerWorkRatio(context) };
        }
    }

    if (mineralReadyToMine(context) && context.mineralPlan &&
        !pending.some(r => r.archetype === 'mineralMiner') &&
        capacities.mineralMinerWork === 0) {
        return {
            archetype: 'mineralMiner',
            reason: 'passive mineral extraction',
            mineralId: context.mineralPlan.mineral.id,
            stationaryTargetId: stationaryTargetIdForMineral(context.mineralPlan),
            staticMining: context.mineralPlan.staticMining
        };
    }

    const claimTargets = context.room.memory.plan?.claimTargets ?? [];
    if (claimTargets.length > 0 && capacities.claim === 0 && !pending.some(r => r.archetype === 'claimer')) {
        return { archetype: 'claimer', reason: 'configured claim target ' + claimTargets[0], remoteRoom: claimTargets[0], remoteMode: 'claim', maxClaimParts: 5 };
    }

    const remoteRequest = remoteSpawnRequest(context, capacities, pending);
    if (remoteRequest) { return remoteRequest; }

    const storageUpgradeWorkerTarget = storageUpgradeWorkerCountTarget(context);
    if (storageUpgradeWorkerTarget > 0 && !hasDeferredSpawnRequest(pending) && !pending.some(r => r.archetype === 'worker')) {
        const workerCreeps = context.creeps.filter(c => ensureArchetype(c) === 'worker' && !c.spawning).length +
            pendingArchetypeCount(pending, 'worker');
        if (workerCreeps < storageUpgradeWorkerTarget) {
            const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            return {
                archetype: 'worker',
                reason: 'storage upgrade worker ' + workerCreeps + '/' + storageUpgradeWorkerTarget +
                    ' storage=' + storageEnergy,
                workRatio: workerWorkRatio(context)
            };
        }
    }

    return null;
}

function storageUpgradeWorkerCountTarget(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl <= 0 || rcl >= 8 || !context.structures.storage) { return 0; }

    const storageEnergy = context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY);
    if (storageEnergy > 400000) { return 4; }
    if (storageEnergy > 300000) { return 3; }
    if (storageEnergy > 200000) { return 2; }
    return 0;
}

function hasDeferredSpawnRequest(pending: PendingSpawnRequest[]): boolean {
    return pending.some(r => r.reason !== CURRENTLY_SPAWNING_REASON);
}

function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: ReturnType<typeof measureCapabilities>,
    pending: PendingSpawnRequest[] = []
): SpawnRequest | null {
    if (activeMinerCount(context.creeps) < context.sourcePlans.length) { return null; }
    if (pending.some(r => !r.remoteRoom)) { return null; }

    const homeFleet = creepsForHomeRoom(context.room.name);
    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    // Serve the most starved remotes first. A fixed key-order pass lets rooms at the
    // tail of the list starve indefinitely when home spawn throughput is the bottleneck
    // (see the W5N9/W4N9 over-subscription investigation). Sorting by least-recently
    // mined makes the rotation fair without a per-room aging counter.
    const orderedRoomNames = orderedRemoteRoomNames(remoteRooms);

    // Emergency pass: a source with zero live coverage anywhere outranks proactive
    // standby/handoff top-offs of already-covered sources, regardless of room order, so
    // a single danger event can no longer leave a remote dark while incumbents cycle.
    const emergencyRequest = emergencyRemoteMinerRequest(context, homeFleet, remoteRooms, orderedRoomNames, pending);
    if (emergencyRequest) { return emergencyRequest; }

    for (const roomName of orderedRoomNames) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.manualPauseUntil && remote.manualPauseUntil > Game.time) { continue; }
        if (remoteArmedFailsafeActive(context.room.name, roomName, remote)) { continue; }
        if (remote.mode === 'harvest' && (!remote.sources || Object.keys(remote.sources).length === 0)) {
            if (countRemoteScouts(context.room.name, roomName) === 0 &&
                !pending.some(r => r.archetype === 'remoteScout' && r.remoteRoom === roomName) &&
                !hasAssignedNonScoutRemoteCreep(homeFleet, roomName) &&
                !pending.some(r => r.remoteRoom === roomName && r.archetype !== 'remoteScout')) {
                const request: SpawnRequest = { archetype: 'remoteScout', reason: 'remote scout ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (blockReason) {
                    logRemoteSpawnSkip(context, request, blockReason);
                    continue;
                }
                return request;
            }
            continue;
        }
        if (remote.mode === 'harvest' && remote.reserve !== false) {
            const reservation = Game.rooms[roomName]?.controller?.reservation;
            const reserveHorizon = remoteReserverReplacementHorizon(context, remote, context.room.name, roomName);
            if ((!reservation || reservation.ticksToEnd < REMOTE_RESERVE_REFRESH_TTL) &&
                !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
                remoteClaimerCount(homeFleet, roomName, 'reserve', 2, reserveHorizon) === 0) {
                const panic = reservation && reservation.ticksToEnd < REMOTE_RESERVER_PANIC_TTL;
                const request: SpawnRequest = {
                    archetype: 'claimer',
                    reason: 'remote reserve ' + roomName,
                    remoteRoom: roomName,
                    remoteMode: 'reserve',
                    minClaimParts: REMOTE_RESERVER_CLAIM_PARTS,
                    maxClaimParts: panic ? REMOTE_RESERVER_PANIC_CLAIM_PARTS : REMOTE_RESERVER_CLAIM_PARTS
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if (remote.mode === 'harvest' && remote.sources) {
            const numSources = Object.keys(remote.sources).length;
            const haulerCoverageHorizons: { [sourceId: string]: number } = {};
            let totalRoomHaulers = pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName);
            for (const sourceId in remote.sources) {
                const horizon = remoteSourceReplacementHorizon(context, remote.sources[sourceId], 'remoteHauler');
                haulerCoverageHorizons[sourceId] = horizon;
                totalRoomHaulers += countRemoteHaulersForSource(homeFleet, roomName, sourceId, horizon);
            }
            const totalRoomMiners = countActiveRemoteMinersForRoom(homeFleet, roomName) +
                pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, undefined, false);
            const sourceLessStandbyMiners = countSourceLessRemoteStandbyMiners(homeFleet, roomName);
            const standbySourceId = sourceNeedingStandbyReplacement(homeFleet, roomName);
            if (standbySourceId &&
                !pending.some(r =>
                    r.archetype === 'remoteMiner' &&
                    r.remoteRoom === roomName &&
                    r.remoteStandby &&
                    r.sourceId === standbySourceId)) {
                const request: SpawnRequest = {
                    archetype: 'remoteMiner',
                    reason: 'remote standby replacement ' + roomName + ':' + standbySourceId,
                    remoteRoom: roomName,
                    remoteMode: remote.mode,
                    remoteStandby: true,
                    sourceId: standbySourceId,
                    staticMining: true,
                    hasContainer: remoteSourceHasContainerStation(remote.sources[standbySourceId])
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }

            for (const sourceId in remote.sources) {
                const sourcePlan = remote.sources[sourceId];
                if (sourcePlan.routeAccessible === false) { continue; }
                const targetMinerWork = sourcePlan.workDemand ?? 3;
                const minerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteMiner');
                const minerProjectedWork = projectedRemoteMinerWork(homeFleet, roomName, sourceId, minerCoverageHorizon) +
                    pendingRemoteBodyCapability(pending, 'remoteMiner', roomName, sourceId, 'harvest');
                const minerCount = countRemoteMinersForSource(homeFleet, roomName, sourceId) +
                    pendingRemoteArchetypeCount(pending, 'remoteMiner', roomName, sourceId, false);
                const sourceMinerLimit = remoteSourceActiveMinerLimit(sourcePlan);
                const sourceHasStandby = hasRemoteStandbyMinerForSource(homeFleet, roomName, sourceId) ||
                    pending.some(r =>
                        r.archetype === 'remoteMiner' &&
                        r.remoteRoom === roomName &&
                        r.remoteStandby &&
                        r.sourceId === sourceId);
                if (minerProjectedWork < targetMinerWork && minerCount < sourceMinerLimit && (minerCount === 0 || minerProjectedWork === 0) &&
                    totalRoomMiners <= numSources &&
                    sourceLessStandbyMiners === 0 &&
                    !sourceHasStandby &&
                    !pending.some(r => r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    const request: SpawnRequest = {
                        archetype: 'remoteMiner',
                        reason: 'remote source handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + minerProjectedWork + '/' + targetMinerWork,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId,
                        staticMining: true,
                        hasContainer: remoteSourceHasContainerStation(sourcePlan)
                    };
                    const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                    if (!blockReason) { return request; }
                    logRemoteSpawnSkip(context, request, blockReason);
                }

                const targetHaulerCapacity = sourcePlan.haulerCapacityDemand ?? 150;
                const haulerCoverageHorizon = haulerCoverageHorizons[sourceId] ??
                    remoteSourceReplacementHorizon(context, sourcePlan, 'remoteHauler');
                const haulerProjectedCapacity = projectedRemoteHaulerCapacity(homeFleet, roomName, sourceId, haulerCoverageHorizon) +
                    pendingRemoteBodyCapability(pending, 'remoteHauler', roomName, sourceId, 'haul');
                if (haulerProjectedCapacity < targetHaulerCapacity &&
                    totalRoomHaulers < 2 * numSources &&
                    countRemoteHaulersForSource(homeFleet, roomName, sourceId, haulerCoverageHorizon) +
                        pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName, sourceId) < MAX_REMOTE_HAULERS_PER_SOURCE &&
                    !hasIdleRemoteHauler(homeFleet, roomName, sourceId) &&
                    !pending.some(r => r.archetype === 'remoteHauler' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    const request: SpawnRequest = {
                        archetype: 'remoteHauler',
                        reason: 'remote haul handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + haulerProjectedCapacity + '/' + targetHaulerCapacity,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId
                    };
                    const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                    if (!blockReason) { return request; }
                    logRemoteSpawnSkip(context, request, blockReason);
                }
            }

            const maintainerTarget = desiredRemoteMaintainerCount(remote);
            const maintainerHorizon = remoteMaintainerReplacementHorizon(context, remote, context.room.name, roomName);
            const maintainerCount = countRemoteMaintainersForRoom(homeFleet, roomName, maintainerHorizon);
            const pendingMaintainerCount = pendingRemoteArchetypeCount(pending, 'remoteMaintainer', roomName);
            if (remote.maintainRoads !== false &&
                remoteNeedsMaintainer(roomName) &&
                maintainerCount + pendingMaintainerCount < maintainerTarget) {
                const request: SpawnRequest = {
                    archetype: 'remoteMaintainer',
                    reason: 'remote maintenance ' + roomName + ' target=' + maintainerTarget +
                        ' current=' + (maintainerCount + pendingMaintainerCount),
                    remoteRoom: roomName,
                    remoteMode: remote.mode
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if (remote.mode === 'reserve' || remote.mode === 'claim') {
            // Overlap only applies to reserving (continuous coverage). Claiming is one-shot,
            // so an in-progress claimer must never be pre-replaced (horizon 0 = count it).
            const reserveHorizon = remote.mode === 'reserve'
                ? remoteReserverReplacementHorizon(context, remote, context.room.name, roomName)
                : 0;
            if (!pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
                remoteClaimerCount(homeFleet, roomName, remote.mode, remote.mode === 'reserve' ? 2 : 1, reserveHorizon) === 0) {
                let minClaimParts: number | undefined;
                let maxClaimParts: number | undefined;
                if (remote.mode === 'reserve') {
                    const reservation = Game.rooms[roomName]?.controller?.reservation;
                    const panic = reservation && reservation.ticksToEnd < REMOTE_RESERVER_PANIC_TTL;
                    minClaimParts = REMOTE_RESERVER_CLAIM_PARTS;
                    maxClaimParts = panic ? REMOTE_RESERVER_PANIC_CLAIM_PARTS : REMOTE_RESERVER_CLAIM_PARTS;
                }
                const request: SpawnRequest = {
                    archetype: 'claimer',
                    reason: 'configured remote ' + remote.mode + ' ' + roomName,
                    remoteRoom: roomName,
                    remoteMode: remote.mode,
                    minClaimParts: remote.mode === 'reserve' ? minClaimParts : undefined,
                    maxClaimParts
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
    }

    return null;
}

// Lowest = most starved. Harvest rooms are keyed by their least-recently-mined source
// so a room with a dark source sorts ahead of a fully-covered one. Rooms with no source
// plan yet (need scouting) are treated as fully starved; non-harvest rooms (reserve/claim)
// don't compete for miners and sort to the back at the current tick.
function remoteRoomMiningStaleness(remote: RemoteRoomPlan): number {
    if (remote.mode !== 'harvest') { return Game.time; }
    const sources = remote.sources;
    if (!sources) { return 0; }
    const sourceIds = Object.keys(sources);
    if (sourceIds.length === 0) { return 0; }
    let oldest = Infinity;
    for (const sourceId of sourceIds) {
        const lastHarvested = sources[sourceId].lastHarvestedAt ?? 0;
        if (lastHarvested < oldest) { oldest = lastHarvested; }
    }
    return oldest === Infinity ? 0 : oldest;
}

function orderedRemoteRoomNames(remoteRooms: { [roomName: string]: RemoteRoomPlan }): string[] {
    return Object.keys(remoteRooms).sort((a, b) =>
        remoteRoomMiningStaleness(remoteRooms[a]) - remoteRoomMiningStaleness(remoteRooms[b]));
}

// Cross-room scan for sources with zero live miner coverage (and no standby/pending
// replacement). Returns the first spawnable emergency miner in starvation order so it
// preempts the proactive standby/handoff spawns handled by the main pass.
function emergencyRemoteMinerRequest(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    orderedRoomNames: string[],
    pending: PendingSpawnRequest[]
): SpawnRequest | null {
    for (const roomName of orderedRoomNames) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.mode !== 'harvest' || !remote.sources) { continue; }
        if (remote.manualPauseUntil && remote.manualPauseUntil > Game.time) { continue; }
        if (remoteArmedFailsafeActive(context.room.name, roomName, remote)) { continue; }
        for (const sourceId in remote.sources) {
            const sourcePlan = remote.sources[sourceId];
            if (sourcePlan.routeAccessible === false) { continue; }
            if (hasRemoteStandbyMinerForSource(homeFleet, roomName, sourceId)) { continue; }
            if (pending.some(r =>
                r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                continue;
            }
            const request: SpawnRequest = {
                archetype: 'remoteMiner',
                reason: 'remote emergency miner ' + roomName + ':' + sourceId,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                sourceId,
                staticMining: true,
                hasContainer: remoteSourceHasContainerStation(sourcePlan)
            };
            if (!isEmergencyRemoteRequest(homeFleet, request)) { continue; }
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }
    return null;
}

function patrolSpawnRequest(
    context: RoomControllerContext,
    pending: PendingSpawnRequest[]
): SpawnRequest | null {
    const rcl = context.room.controller?.level ?? 0;
    const homeArmedHostiles = findHostiles(context.room).length;
    if (rcl < 6) {
        if (homeArmedHostiles === 0) { return null; }
        const hostileRooms = 1;
        const targetPatrol = Math.min(hostileRooms, patrolTargetCap(0));
        const homeFleet = creepsForHomeRoom(context.room.name);
        const patrolCount = countFleetForArchetype(homeFleet, 'patrol') + pendingArchetypeCount(pending, 'patrol');
        if (patrolCount >= targetPatrol) { return null; }
        return {
            archetype: 'patrol',
            reason: 'home defense target ' + patrolCount + '/' + targetPatrol +
                ' hostileRooms=' + hostileRooms + ' armedHostiles=' + homeArmedHostiles,
            useFullEnergyCapacity: true,
            minimumBodyCost: bodyCost(planBodyForArchetype('patrol', context.room.energyCapacityAvailable))
        };
    }

    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    const enabledRemoteNames: string[] = [];
    for (const roomName in remoteRooms) {
        if (remoteRooms[roomName].enabled) {
            enabledRemoteNames.push(roomName);
        }
    }
    if (enabledRemoteNames.length === 0 && homeArmedHostiles === 0) { return null; }

    let hostileRooms = homeArmedHostiles > 0 ? 1 : 0;
    for (const roomName of enabledRemoteNames) {
        const room = Game.rooms[roomName];
        if (!room) { continue; }
        if (findHostiles(room).length > 0) {
            hostileRooms++;
        }
    }

    const baselinePatrol = Math.ceil(enabledRemoteNames.length / 2);
    const targetPatrol = Math.min(
        baselinePatrol + hostileRooms,
        patrolTargetCap(enabledRemoteNames.length)
    );
    const homeFleet = creepsForHomeRoom(context.room.name);
    const patrolCount = countFleetForArchetype(homeFleet, 'patrol') + pendingArchetypeCount(pending, 'patrol');
    if (patrolCount >= targetPatrol) { return null; }

    return {
        archetype: 'patrol',
        reason: 'patrol target ' + patrolCount + '/' + targetPatrol +
            ' baseline=' + baselinePatrol + ' hostileRooms=' + hostileRooms +
            ' cap=' + patrolTargetCap(enabledRemoteNames.length),
        useFullEnergyCapacity: true,
        minimumBodyCost: bodyCost(planBodyForArchetype('patrol', context.room.energyCapacityAvailable))
    };
}

function patrolTargetCap(enabledRemoteCount: number): number {
    return 2 + (2 * enabledRemoteCount);
}

function remoteRequestBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    remoteRooms: { [roomName: string]: RemoteRoomPlan },
    roomName: string,
    request: SpawnRequest
): string | null {
    const recoveryReason = remoteSpawnRecoveryBlockReason(context, homeFleet, request);
    if (recoveryReason) { return recoveryReason; }

    if (storedEnergy(context) < REMOTE_THROTTLE_STORED_ENERGY && remoteRequestUsesRemoteIncome(request)) {
        const primaryRemote = firstEnabledHarvestRemoteName(remoteRooms);
        if (primaryRemote && roomName !== primaryRemote) {
            return 'remote throttle primary=' + primaryRemote + ' stored<' + REMOTE_THROTTLE_STORED_ENERGY;
        }
    }

    if (request.archetype === 'remoteHauler' && hasRemoteRouteCongestion(homeFleet, roomName)) {
        return 'route congestion';
    }

    return null;
}

function remoteRequestUsesRemoteIncome(request: SpawnRequest): boolean {
    return request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

function firstEnabledHarvestRemoteName(remoteRooms: { [roomName: string]: RemoteRoomPlan }): string | null {
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (remote.enabled && remote.mode === 'harvest') { return roomName; }
    }
    return null;
}

function hasRemoteRouteCongestion(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.jobType !== 'travelRoom') { continue; }
        if ((creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS) { return true; }
    }
    return false;
}

function isRemoteSpawnRequest(request: SpawnRequest): boolean {
    return request.archetype === 'remoteMiner' ||
        request.archetype === 'remoteHauler' ||
        request.archetype === 'remoteMaintainer' ||
        request.archetype === 'remoteScout' ||
        (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

function isEmergencyRemoteRequest(homeFleet: Creep[], request: SpawnRequest): boolean {
    if (request.archetype === 'remoteScout') { return true; }
    if (request.archetype !== 'remoteMiner' || !request.remoteRoom || !request.sourceId) { return false; }
    if (countSourceLessRemoteStandbyMiners(homeFleet, request.remoteRoom) > 0) { return false; }
    return countRemoteMinersForSource(homeFleet, request.remoteRoom, request.sourceId) === 0 &&
        projectedRemoteMinerWork(homeFleet, request.remoteRoom, request.sourceId, 0) === 0;
}

function remoteSpawnRecoveryBlockReason(
    context: RoomControllerContext,
    homeFleet: Creep[],
    request: SpawnRequest,
    availableEnergy: number = context.room.energyAvailable
): string | null {
    if (!isRemoteSpawnRequest(request)) { return null; }
    if (isRouteHealthMaintainerRequest(context, request)) { return null; }
    if (isEmergencyRemoteRequest(homeFleet, request)) { return null; }

    const energyCapacity = context.room.energyCapacityAvailable;
    const hasStorage = !!(context.structures.storage || context.structures.terminal);
    if (hasStorage && storedEnergy(context) < REMOTE_HOME_RECOVERY_STORED_ENERGY) {
        return 'home recovery stored<' + REMOTE_HOME_RECOVERY_STORED_ENERGY;
    }
    const stored = hasStorage ? storedEnergy(context) : 0;
    if (energyCapacity > 0 && availableEnergy < energyCapacity * REMOTE_SPAWN_MIN_ENERGY_RATIO &&
        stored < REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED) {
        return 'home recovery energy<' + Math.ceil(REMOTE_SPAWN_MIN_ENERGY_RATIO * 100) + '% remaining=' + availableEnergy;
    }
    return null;
}

function remoteSpawnMinimumCost(
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

function isRouteHealthMaintainerRequest(context: RoomControllerContext, request: SpawnRequest): boolean {
    if (request.archetype !== 'remoteMaintainer' || !request.remoteRoom) { return false; }
    const remotePlan = context.room.memory.plan?.remoteRooms?.[request.remoteRoom];
    return remoteNeedsRouteHealthMaintainer(request.remoteRoom, remotePlan);
}

function remoteSourcePlanForRequest(
    context: RoomControllerContext,
    request: SpawnRequest
): RemoteSourcePlan | undefined {
    if (!request.remoteRoom || !request.sourceId) { return undefined; }
    return context.room.memory.plan?.remoteRooms?.[request.remoteRoom]?.sources?.[request.sourceId];
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

function logRemoteSpawnSkip(context: RoomControllerContext, request: SpawnRequest, reason: string): void {
    if (Game.time % 25 !== 0) { return; }
    console.log('room.controller: skipping ' + request.archetype +
        ' for ' + request.reason +
        ' reason=' + reason +
        ' stored=' + storedEnergy(context) +
        ' energy=' + context.room.energyAvailable + '/' + context.room.energyCapacityAvailable);
}
