import { BODY_MIN_BUDGET, BODY_BUDGET_RATIO, planBodyForArchetype, bodyCost, getBodyCapabilities, ensureArchetype, getCreepCapabilities, MAX_CARRY_CAPACITY } from "../creep.capabilities";
import { reserveRenewSpawns } from "../spawn.renewal";
import { MAX_REMOTE_HAULERS_PER_SOURCE, REMOTE_THROTTLE_STORED_ENERGY, REMOTE_HAULER_RETARGET_STUCK_TICKS, REMOTE_HOME_RECOVERY_STORED_ENERGY, REMOTE_SPAWN_MIN_ENERGY_RATIO, REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED, REMOTE_HAULER_MIN_DEMAND_RATIO, REMOTE_HAULER_ABSOLUTE_MIN_COST, REMOTE_HAULER_USEFUL_MIN_COST, REMOTE_MAINTAINER_MIN_COST, TOWER_RECOVERY_RATIO } from "./constants";
import { terminalEnergyReserveDeficit } from "./context";
import { legacyRoleForArchetype, stationaryTargetIdForSource, mineralReadyToMine, stationaryTargetIdForMineral, storedEnergy, minCarryForHauler, minWorkForWorker, minWorkForMiner, desiredUpgraderWork, towerEnergyRatio, closest } from "./jobs";
import { countFleetForArchetype, countRemoteScouts, hasAssignedNonScoutRemoteCreep, remoteClaimerCount, countRemoteHaulersForRoom, countActiveRemoteMinersForRoom, countSourceLessRemoteStandbyMiners, sourceNeedingStandbyReplacement, remoteSourceHasContainerStation, remoteSourceReplacementHorizon, projectedRemoteMinerWork, countRemoteMinersForSource, remoteSourceActiveMinerLimit, hasRemoteStandbyMinerForSource, projectedRemoteHaulerCapacity, countRemoteHaulersForSource, hasIdleRemoteHauler, remoteNeedsMaintainer, hasRemoteMaintainer, remoteNeedsRouteHealthMaintainer } from "./remote";
import { RoomControllerContext, PendingSpawnRequest, SpawnRequest, JobReservations, SourcePlan } from "./types";

export function runSpawnPlanner(context: RoomControllerContext): void {
    const allFreeSpawns = context.structures.spawns.filter((s) => !s.spawning);
    if (allFreeSpawns.length === 0) { return; }

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
            reason: 'currently spawning'
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

export function addPendingCapabilities(capacities: ReturnType<typeof measureCapabilities>, pending: PendingSpawnRequest[]): ReturnType<typeof measureCapabilities> {
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

export function pendingArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype === archetype) { count++; }
    }

    return count;
}

export function pendingRemoteArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype, remoteRoom: string, sourceId?: string, standby?: boolean): number {
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

export function pendingRemoteBodyCapability(pending: PendingSpawnRequest[], archetype: CreepArchetype, remoteRoom: string, sourceId: string, capability: 'harvest' | 'haul'): number {
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

export function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 3) { return 1; }

    const remainingWork = context.constructionSites.reduce(
                (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 4 && remainingWork > 30000) { return 3; }

    if (remainingWork > 10000) { return 2; }

    return 1;
}

export function chooseSpawnRequest(context: RoomControllerContext, pending: PendingSpawnRequest[] = []): SpawnRequest | null {
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

    if (capacities.heal === 0 && !pending.some(r => r.archetype === 'doctor') &&
        context.room.energyCapacityAvailable >= 450) {
        return { archetype: 'doctor', reason: 'no heal-capable creep' };
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

    return remoteSpawnRequest(context, capacities, pending);
}

export function remoteSpawnRequest(context: RoomControllerContext, capacities: ReturnType<typeof measureCapabilities>, pending: PendingSpawnRequest[] = []): SpawnRequest | null {
    if (activeMinerCount(context.creeps) < context.sourcePlans.length) { return null; }

    if (pending.some(r => !r.remoteRoom)) { return null; }

    const homeFleet = creepsForHomeRoom(context.room.name);
    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.dangerUntil && remote.dangerUntil > Game.time) { continue; }
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
            if ((!reservation || reservation.ticksToEnd < 4000) &&
                !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
                remoteClaimerCount(homeFleet, roomName, 'reserve', 2) === 0) {
                const maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
                const request: SpawnRequest = {
                    archetype: 'claimer',
                    reason: 'remote reserve ' + roomName,
                    remoteRoom: roomName,
                    remoteMode: 'reserve',
                    minClaimParts: 2,
                    maxClaimParts
                };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if (remote.mode === 'harvest' && remote.sources) {
            const numSources = Object.keys(remote.sources).length;
            const totalRoomHaulers = countRemoteHaulersForRoom(homeFleet, roomName) +
                pendingRemoteArchetypeCount(pending, 'remoteHauler', roomName);
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
                const haulerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteHauler');
                const haulerProjectedCapacity = projectedRemoteHaulerCapacity(homeFleet, roomName, sourceId, haulerCoverageHorizon) +
                    pendingRemoteBodyCapability(pending, 'remoteHauler', roomName, sourceId, 'haul');
                if (haulerProjectedCapacity < targetHaulerCapacity &&
                    totalRoomHaulers < 2 * numSources &&
                    countRemoteHaulersForSource(homeFleet, roomName, sourceId) +
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

            if (remote.maintainRoads !== false && remoteNeedsMaintainer(roomName) &&
                !hasRemoteMaintainer(homeFleet, roomName) &&
                !pending.some(r => r.archetype === 'remoteMaintainer' && r.remoteRoom === roomName)) {
                const request: SpawnRequest = { archetype: 'remoteMaintainer', reason: 'remote maintenance ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
                const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
                if (!blockReason) { return request; }
                logRemoteSpawnSkip(context, request, blockReason);
            }
        }
        if ((remote.mode === 'reserve' || remote.mode === 'claim') &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName) &&
            remoteClaimerCount(homeFleet, roomName, remote.mode, remote.mode === 'reserve' ? 2 : 1) === 0) {
            let maxClaimParts: number | undefined;
            if (remote.mode === 'reserve') {
                const reservation = Game.rooms[roomName]?.controller?.reservation;
                maxClaimParts = (reservation && reservation.ticksToEnd < 500) ? 5 : 2;
            }
            const request: SpawnRequest = {
                archetype: 'claimer',
                reason: 'configured remote ' + remote.mode + ' ' + roomName,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                minClaimParts: remote.mode === 'reserve' ? 2 : undefined,
                maxClaimParts
            };
            const blockReason = remoteRequestBlockReason(context, homeFleet, remoteRooms, roomName, request);
            if (!blockReason) { return request; }
            logRemoteSpawnSkip(context, request, blockReason);
        }
    }

    return null;
}

export function remoteRequestBlockReason(context: RoomControllerContext, homeFleet: Creep[], remoteRooms: { [roomName: string]: RemoteRoomPlan }, roomName: string, request: SpawnRequest): string | null {
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

export function remoteRequestUsesRemoteIncome(request: SpawnRequest): boolean {
    return request.archetype === 'remoteHauler' ||
    request.archetype === 'remoteMaintainer' ||
    (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

export function firstEnabledHarvestRemoteName(remoteRooms: { [roomName: string]: RemoteRoomPlan }): string | null {
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (remote.enabled && remote.mode === 'harvest') { return roomName; }
    }

    return null;
}

export function hasRemoteRouteCongestion(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.jobType !== 'travelRoom') { continue; }
        if ((creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS) { return true; }
    }

    return false;
}

export function creepsForHomeRoom(homeRoomName: string): Creep[] {
    const creeps: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom === homeRoomName) {
            creeps.push(creep);
            continue;
        }
        if (!creep.memory.homeRoom && creep.room.name === homeRoomName) {
            creeps.push(creep);
        }
    }

    return creeps;
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

export function isRemoteSpawnRequest(request: SpawnRequest): boolean {
    return request.archetype === 'remoteMiner' ||
    request.archetype === 'remoteHauler' ||
    request.archetype === 'remoteMaintainer' ||
    request.archetype === 'remoteScout' ||
    (request.archetype === 'claimer' && request.remoteMode === 'reserve');
}

export function isEmergencyRemoteRequest(homeFleet: Creep[], request: SpawnRequest): boolean {
    if (request.archetype === 'remoteScout') { return true; }

    if (request.archetype !== 'remoteMiner' || !request.remoteRoom || !request.sourceId) { return false; }

    if (countSourceLessRemoteStandbyMiners(homeFleet, request.remoteRoom) > 0) { return false; }

    return countRemoteMinersForSource(homeFleet, request.remoteRoom, request.sourceId) === 0 &&
    projectedRemoteMinerWork(homeFleet, request.remoteRoom, request.sourceId, 0) === 0;
}

export function remoteSpawnRecoveryBlockReason(context: RoomControllerContext, homeFleet: Creep[], request: SpawnRequest, availableEnergy: number = context.room.energyAvailable): string | null {
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

export function remoteSpawnMinimumCost(context: RoomControllerContext, request: SpawnRequest, plannedCost: number): number {
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

export function isRouteHealthMaintainerRequest(context: RoomControllerContext, request: SpawnRequest): boolean {
    if (request.archetype !== 'remoteMaintainer' || !request.remoteRoom) { return false; }

    const remotePlan = context.room.memory.plan?.remoteRooms?.[request.remoteRoom];
    return remoteNeedsRouteHealthMaintainer(request.remoteRoom, remotePlan);
}

export function remoteSourcePlanForRequest(context: RoomControllerContext, request: SpawnRequest): RemoteSourcePlan | undefined {
    if (!request.remoteRoom || !request.sourceId) { return undefined; }

    return context.room.memory.plan?.remoteRooms?.[request.remoteRoom]?.sources?.[request.sourceId];
}

export function remoteHaulerCostForCapacity(capacity: number): number {
    const segments = Math.max(1, Math.ceil(capacity / (2 * CARRY_CAPACITY)));
    return segments * bodyCost([CARRY, CARRY, MOVE]);
}

export function remoteMinerCostForWorkDemand(context: RoomControllerContext, request: SpawnRequest, workDemand: number, plannedCost: number): number {
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

export function logRemoteSpawnSkip(context: RoomControllerContext, request: SpawnRequest, reason: string): void {
    if (Game.time % 25 !== 0) { return; }

    console.log('room.controller: skipping ' + request.archetype +
    ' for ' + request.reason +
    ' reason=' + reason +
    ' stored=' + storedEnergy(context) +
    ' energy=' + context.room.energyAvailable + '/' + context.room.energyCapacityAvailable);
}

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

export function refillSpawnTargets(context: RoomControllerContext): EnergyStructure[] {
    return [...context.structures.spawns, ...context.structures.extensions]
    .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
}

export function refillTowerTargets(context: RoomControllerContext): EnergyStructure[] {
    return context.structures.towers
    .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO);
}

export function refillSpawnTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): EnergyStructure | null {
    return closest(creep, refillSpawnTargets(context)
    .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

export function refillTowerTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): EnergyStructure | null {
    return closest(creep, refillTowerTargets(context)
    .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

export function refillTerminalTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): StructureTerminal | null {
    const terminal = context.structures.terminal;
    if (!terminal || terminal.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return null;
    }

    const reserved = reservations.energySinks[terminal.id] ?? 0;
    const deficit = terminalEnergyReserveDeficit(context, reservations);
    return deficit > reserved ? terminal : null;
}

export function totalSourcePlanWorkDemand(sourcePlans: SourcePlan[]): number {
    let demand = 0;
    for (const sourcePlan of sourcePlans) {
        demand += sourcePlan.requiredWork;
    }

    return demand;
}

export function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

export function sourceSpawnDeficit(context: RoomControllerContext, pendingSourceIds: Set<string> = new Set()): SourcePlan | null {
    for (const plan of context.sourcePlans) {
        if (pendingSourceIds.has(plan.source.id)) { continue; }
        const assignedMiners = assignedSourceMinerCount(context.creeps, plan.source.id);
        if (assignedMiners === 0) {
            return plan;
        }
    }

    return null;
}

export function activeMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }

    return count;
}

export function assignedSourceMinerCount(creeps: Creep[], sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }

    return count;
}

export function assignedSourceWork(creeps: Creep[], sourceId: string): number {
    let work = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        work += getCreepCapabilities(creep).harvest;
    }

    return work;
}

export function assignedSourcePlan(creep: Creep, sourcePlans: SourcePlan[], reservations: JobReservations): SourcePlan | null {
    if (sourcePlans.length === 0) { return null; }

    const assignedId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (assignedId) {
        const current = sourcePlans.find((plan) => plan.source.id === assignedId);
        const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
        if (current && (!uncovered || (reservations.sourceMinerCount[current.source.id] ?? 0) <= 1)) {
            return current;
        }
        if (current && uncovered) {
            reservations.sourceMinerCount[current.source.id] = Math.max(0, (reservations.sourceMinerCount[current.source.id] ?? 1) - 1);
            reservations.sourceWork[current.source.id] = Math.max(0, (reservations.sourceWork[current.source.id] ?? 0) - getCreepCapabilities(creep).harvest);
            reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
            reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
            creep.memory.sourceId = uncovered.source.id;
            creep.memory.assignedSourceId = uncovered.source.id;
            return uncovered;
        }
    }

    const uncovered = sourcePlans.find((plan) => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0);
    if (uncovered) {
        reservations.sourceMinerCount[uncovered.source.id] = (reservations.sourceMinerCount[uncovered.source.id] ?? 0) + 1;
        reservations.sourceWork[uncovered.source.id] = (reservations.sourceWork[uncovered.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = uncovered.source.id;
        creep.memory.assignedSourceId = uncovered.source.id;
        return uncovered;
    }

    let best: SourcePlan | null = null;
    let bestDeficit = -Infinity;
    for (const plan of sourcePlans) {
        const reserved = reservations.sourceWork[plan.source.id] ?? 0;
        const deficit = plan.requiredWork - reserved;
        if (deficit > bestDeficit) {
            best = plan;
            bestDeficit = deficit;
        }
    }

    if (best && bestDeficit > 0) {
        reservations.sourceMinerCount[best.source.id] = (reservations.sourceMinerCount[best.source.id] ?? 0) + 1;
        reservations.sourceWork[best.source.id] = (reservations.sourceWork[best.source.id] ?? 0) + getCreepCapabilities(creep).harvest;
        creep.memory.sourceId = best.source.id;
        creep.memory.assignedSourceId = best.source.id;
    } else {
        return null;
    }

    return best;
}
