import { ensureArchetype, getCreepCapabilities } from '../creep/capabilities';
import { clearJob } from '../creep/jobRunner';
import { getRoomStructures } from './structures';
import { repairStructureFilter } from '../role/doctor';
import { findHostiles } from '../hostileUtils';
import { closest, closestReachable, bestHealTarget, worstHits } from './targeting';
import { setJob, setTravelJob, setResourceJob, rememberPrimaryJob } from './jobMemory';
import {
    buildSourcePlans, buildMineralPlan,
    assignedSourcePlan, reserveSourceIfNeeded,
    setStaticHarvestMemory, setStaticMineralMemory, clearStaticMiningMemory,
    closestSourcePlan,
} from './source';
import {
    storedEnergy,
    reserveResourceTarget, reserveDroppedTarget, reserveEnergySink,
    spawnEnergyRatio,
    roomHasEnergyDemand, roomNeedsCriticalEnergyRecovery,
    terminalEnergyReserveDeficit,
    refillSpawnTarget, refillTowerTarget, refillTerminalTarget,
    droppedResourceTarget, salvageWithdrawalTarget, mineralContainerWithdrawalTarget,
    resourceDepositTarget, energyDepositTarget, energyWithdrawalTarget,
    linkReceivers, uniqueLinks,
} from './energy';
import {
    bestConstructionSite, repairTargetFor, remainingConstructionProgress, remainingRepairProgress,
    reserveConstructionProgress, reserveRepairProgress,
    shouldRepairWithCreeps, shouldReserveUpgrade,
    mineralReadyToMine, totalStoredResources, firstStoredResource,
    haulerMiningSiteMinPickup, isMiningSiteEnergyTarget,
} from './work';
import {
    preferredRemoteInfrastructureSite, shouldBuildRemoteInfrastructure, closestRemoteInfrastructureSite,
} from './remote/roads';
import {
    remoteSourceRouteDegraded,
    initialiseRoomPlan, updateRemoteRoomPlans, rememberPlans,
    rememberRcl, updatePlanAssignments, rememberLoad,
} from './remote/planning';
import {
    creepsForHomeRoom,
    remoteSourceMinerSlotCap, pickRemoteMinerSource,
    remoteScoutPack, remoteRoomCrowdedForScout, assignOverflowRemoteScout,
} from './remote/fleet';
import { findRemoteEnergySource } from './remote/energy';
import {
    primeRemoteMinerTravelStation, remoteMinerStationRouteStalled, resetRemoteMinerStationProgress,
    markRemoteSourceRouteDegraded, assignStandbyRemoteMiner, manageRemoteRenewal,
} from './remote/miners';
import { assignRemoteHaulerCycle } from './remote/haulers';
import { runSpawnPlanner } from './remote/spawn';
import { keepCurrentJob, assignEmergencyEnergyDelivery, resumePrimaryEnergyJob } from './jobManage';
import { isMaintenanceDisabled } from './flags';
import { RoomControllerContext, JobReservations } from './types';
import {
    LINK_TRANSFER_THRESHOLD,
    REMOTE_SCOUT_KEEP_COUNT, REMOTE_HAULER_RETARGET_STUCK_TICKS,
    REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS,
    REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD,
    REMOTE_MINER_REPAIR_THRESHOLD, REMOTE_MINER_REPAIR_RANGE,
} from './constants';

export function run(room: Room): void {
    const context = buildContext(room);

    initialiseRoomPlan(room);
    updateRemoteRoomPlans(room);
    rememberRcl(room);
    updatePlanAssignments(context);
    rememberLoad(context);
    rememberPlans(context);
    // Refresh hysteresis state once per tick so force-pull logic and debug reflect
    // current room energy conditions even when no branch queries it later.
    roomNeedsCriticalEnergyRecovery(context);
    runLinks(context);
    reportPassiveInfrastructure(context);
    assignJobs(context);
    runSpawnPlanner(context);
}

function remoteMaintainerClaimedTargetIds(creep: Creep): Set<string> {
    const claimed = new Set<string>();
    const homeRoom = creep.memory.homeRoom;
    const remoteRoom = creep.memory.remoteRoom;
    if (!homeRoom || !remoteRoom) { return claimed; }

    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (other.spawning) { continue; }
        if (ensureArchetype(other) !== 'remoteMaintainer') { continue; }
        if (other.memory.homeRoom !== homeRoom) { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.jobType !== 'build' && other.memory.jobType !== 'repair') { continue; }
        if (!other.memory.jobTargetId) { continue; }
        claimed.add(other.memory.jobTargetId);
    }

    return claimed;
}

function preferUnclaimedTargets<T extends { id: string }>(targets: T[], claimed: Set<string>): T[] {
    if (claimed.size === 0 || targets.length === 0) { return targets; }
    const unclaimed = targets.filter((target) => !claimed.has(target.id));
    return unclaimed.length > 0 ? unclaimed : targets;
}

function closestByPathOrRange(creep: Creep, sites: ConstructionSite[]): ConstructionSite | null {
    if (sites.length === 0) { return null; }
    const byPath = creep.pos.findClosestByPath(sites, { ignoreCreeps: true }) as ConstructionSite | null;
    if (byPath) { return byPath; }
    return closest(creep, sites);
}

function selectRemoteMaintainerBuildSite(creep: Creep, claimedTargets: Set<string>): ConstructionSite | null {
    const infraSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    }) as ConstructionSite[];
    const preferredInfra = closestByPathOrRange(creep, preferUnclaimedTargets(infraSites, claimedTargets));
    if (preferredInfra) { return preferredInfra; }

    const allSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES) as ConstructionSite[];
    return closestByPathOrRange(creep, preferUnclaimedTargets(allSites, claimedTargets));
}

function selectRemoteMaintainerRepairTarget(
    creep: Creep,
    claimedTargets: Set<string>,
    filter: (structure: AnyStructure) => boolean
): AnyStructure | null {
    const targets = (creep.room.find(FIND_STRUCTURES, { filter }) as AnyStructure[])
        .filter(s => !isMaintenanceDisabled(s));
    const pool = preferUnclaimedTargets(targets, claimedTargets);
    return worstHits(creep, pool);
}

export function assignRemoteCreep(creep: Creep): boolean {
    const homeRoom = creep.memory.homeRoom;
    const remoteRoom = creep.memory.remoteRoom;
    if (!homeRoom || !remoteRoom) { return false; }
    const archetype = ensureArchetype(creep);
    const configuredRemotePlan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
    if (configuredRemotePlan && !configuredRemotePlan.enabled) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (configuredRemotePlan?.dangerUntil && configuredRemotePlan.dangerUntil > Game.time) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (!configuredRemotePlan && !(Memory.rooms[homeRoom]?.plan?.claimTargets ?? []).includes(remoteRoom)) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    const remotePlan: RemoteRoomPlan = configuredRemotePlan ?? {
        enabled: true,
        roomName: remoteRoom,
        mode: creep.memory.remoteMode ?? 'claim',
        reserve: false,
        buildRoads: false,
        maintainRoads: false
    };

    const capabilities = getCreepCapabilities(creep);
    if (archetype === 'remoteHauler') {
        return assignRemoteHaulerCycle(creep, homeRoom, remoteRoom, remotePlan);
    }
    if (manageRemoteRenewal(creep, archetype, capabilities, homeRoom, remoteRoom, remotePlan)) {
        return true;
    }

    if (archetype === 'remoteScout') {
        const scoutPack = remoteScoutPack(homeRoom, remoteRoom);
        const scoutRank = scoutPack.indexOf(creep.name);
        if (scoutPack.length > REMOTE_SCOUT_KEEP_COUNT && scoutRank >= REMOTE_SCOUT_KEEP_COUNT) {
            return assignOverflowRemoteScout(creep, homeRoom);
        }
        if (remoteRoomCrowdedForScout(creep, homeRoom, remoteRoom)) {
            return assignOverflowRemoteScout(creep, homeRoom, remoteRoom);
        }

        if (findHostiles(creep.room).length > 0 && creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }

        if (creep.room.name !== remoteRoom) {
            setTravelJob(creep, remoteRoom);
            return true;
        }
        const hold = new RoomPosition(25, 25, remoteRoom);
        if (creep.pos.getRangeTo(hold) > 8) {
            creep.moveTo(hold, { visualizePathStyle: { stroke: '#a0b7ff' } });
        }
        clearJob(creep);
        return true;
    }

    if (archetype === 'remoteMiner' && creep.memory.remoteStandby) {
        return assignStandbyRemoteMiner(creep, homeRoom, remoteRoom, remotePlan);
    }

    if (archetype === 'remoteMiner') {
        primeRemoteMinerTravelStation(creep, remotePlan);
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const remoteMaintainerClaims = archetype === 'remoteMaintainer'
        ? remoteMaintainerClaimedTargetIds(creep)
        : null;

    const remoteBuildCandidate = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? (archetype === 'remoteMaintainer'
            ? selectRemoteMaintainerBuildSite(creep, remoteMaintainerClaims ?? new Set<string>())
            : closestRemoteInfrastructureSite(creep, false))
        : null;
    const remoteBuildSite = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? preferredRemoteInfrastructureSite(creep, archetype, remoteBuildCandidate)
        : null;
    if (remoteBuildSite) {
        // Bug fix: for remoteMaintainer the pre-block only handles build-job stickiness
        // (keeping an already-active build target alive).  New build assignments go through
        // the priority block below so repair always takes precedence over building.
        if (archetype !== 'remoteMaintainer' || creep.memory.jobType === 'build') {
            setJob(creep, 'build', remoteBuildSite);
            return true;
        }
    }

    if (archetype === 'claimer' && creep.room.controller) {
        const jobType: CreepJobType = creep.memory.remoteMode === 'reserve' ? 'reserveController' : 'claimController';
        setJob(creep, jobType, creep.room.controller);
        return true;
    }

    if (archetype === 'remoteMiner') {
        let assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        const sources = creep.room.find(FIND_SOURCES);
        const sourceIds = new Set<string>(sources.map((source) => source.id));
        if (assignedSourceId && !sourceIds.has(assignedSourceId)) {
            assignedSourceId = undefined;
        }

        const minerCountBySource = new Map<string, number>();
        for (const other of creepsForHomeRoom(homeRoom)) {
            if (other.id === creep.id) { continue; }
            if (other.spawning) { continue; }
            if (ensureArchetype(other) !== 'remoteMiner') { continue; }
            if (other.memory.remoteRoom !== remoteRoom) { continue; }
            if (other.memory.remoteStandby) { continue; }
            const sid = other.memory.assignedSourceId ?? other.memory.sourceId;
            if (sid && sourceIds.has(sid)) {
                minerCountBySource.set(sid, (minerCountBySource.get(sid) ?? 0) + 1);
            }
        }

        let selectedSource: Source | null = null;
        if (assignedSourceId) {
            const currentSource = sources.find((source) => source.id === assignedSourceId) ?? null;
            if (currentSource) {
                const currentSourcePlan = remotePlan.sources?.[currentSource.id];
                const currentCount = minerCountBySource.get(currentSource.id) ?? 0;
                const currentCap = remoteSourceMinerSlotCap(remotePlan, currentSource);
                if (currentSourcePlan?.routeAccessible !== false && currentCount < currentCap) {
                    selectedSource = currentSource;
                }
            }
        }

        if (!selectedSource) {
            selectedSource = pickRemoteMinerSource(creep, sources, remotePlan, minerCountBySource);
            assignedSourceId = selectedSource?.id;
        }

        if (!selectedSource || !assignedSourceId) {
            creep.memory.remoteStandby = true;
            creep.memory.sourceId = undefined;
            creep.memory.assignedSourceId = undefined;
            creep.memory.stationaryTargetId = undefined;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
            if (creep.room.name !== homeRoom) {
                setTravelJob(creep, homeRoom);
            } else {
                setJob(creep, 'idle', Game.rooms[homeRoom]?.storage
                    ?? creep.pos.findClosestByRange(FIND_MY_SPAWNS));
            }
            return true;
        }

        const sourceCfg = remotePlan.sources?.[assignedSourceId];
        const wasAlreadyDegraded = !!sourceCfg && remoteSourceRouteDegraded(sourceCfg);
        if (sourceCfg && remoteMinerStationRouteStalled(creep, selectedSource, sourceCfg)) {
            markRemoteSourceRouteDegraded(sourceCfg, creep.pos);
            if (!wasAlreadyDegraded) {
                resetRemoteMinerStationProgress(creep);
            }
        }

        const noProgressTicks = creep.memory.remoteStationNoProgressTicks ?? 0;
        const preferDirectSourceApproach = !!sourceCfg &&
            remoteSourceRouteDegraded(sourceCfg) &&
            noProgressTicks >= REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS;

        let stationaryTargetId: string | undefined;
        if (!preferDirectSourceApproach && sourceCfg?.containerId) {
            stationaryTargetId = sourceCfg.containerId;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
        } else if (!preferDirectSourceApproach && sourceCfg?.stationX != null && sourceCfg?.stationY != null && sourceCfg.routeAccessible !== false) {
            stationaryTargetId = undefined;
            creep.memory.stationX = sourceCfg.stationX;
            creep.memory.stationY = sourceCfg.stationY;
        } else {
            stationaryTargetId = assignedSourceId;
            creep.memory.stationX = undefined;
            creep.memory.stationY = undefined;
        }

        creep.memory.remoteStandby = undefined;
        creep.memory.sourceId = selectedSource.id;
        creep.memory.assignedSourceId = selectedSource.id;
        creep.memory.stationaryTargetId = stationaryTargetId ?? selectedSource.id;

        if (selectedSource.energy === 0) {
            const damagedNearby = closest(creep, creep.room.find(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) &&
                             s.hits < s.hitsMax * REMOTE_MINER_REPAIR_THRESHOLD &&
                             creep.pos.getRangeTo(s) <= REMOTE_MINER_REPAIR_RANGE &&
                             !isMaintenanceDisabled(s as AnyStructure)
            }) as AnyStructure[]);
            if (damagedNearby) {
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    setJob(creep, 'repair', damagedNearby);
                    return true;
                }
                const stationContainer = sourceCfg?.containerId
                    ? Game.getObjectById(sourceCfg.containerId as Id<StructureContainer>)
                    : null;
                if (stationContainer && stationContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    setJob(creep, 'withdrawEnergy', stationContainer);
                    return true;
                }
            }
        }

        setJob(creep, 'harvestSource', selectedSource);
        return true;
    }

    if (archetype === 'remoteMaintainer') {
        const claimedTargets = remoteMaintainerClaims ?? remoteMaintainerClaimedTargetIds(creep);
        const hasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

        // Sticky: keep the current repair or build job while the target still needs work,
        // rather than re-evaluating to the globally worst target every tick.  This prevents
        // oscillation between two similarly-degraded structures and avoids wasted travel.
        const currentJobType = creep.memory.jobType;
        const currentTargetId = creep.memory.jobTargetId;
        if (hasEnergy && currentTargetId && (currentJobType === 'repair' || currentJobType === 'build')) {
            if (currentJobType === 'build') {
                const site = Game.getObjectById(currentTargetId as Id<ConstructionSite>);
                if (site && site.progress < site.progressTotal) { return true; }
            } else {
                const structure = Game.getObjectById(currentTargetId as Id<AnyStructure>);
                if (structure && structure.hits < structure.hitsMax) { return true; }
            }
        }

        // 1. Critical container repair: most-degraded container below 50%.
        const criticalContainer = selectRemoteMaintainerRepairTarget(
            creep,
            claimedTargets,
            (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD
        );
        if (criticalContainer && hasEnergy) {
            setJob(creep, 'repair', criticalContainer);
            return true;
        }

        // 2. Container repair: most-degraded container below 90% — prioritised over building.
        const worstContainer = selectRemoteMaintainerRepairTarget(
            creep,
            claimedTargets,
            (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.9
        );
        if (worstContainer && hasEnergy) {
            setJob(creep, 'repair', worstContainer);
            return true;
        }

        // 3. Road repair: most-degraded road below 80% — prioritised over building.
        const worstCriticalRoad = selectRemoteMaintainerRepairTarget(
            creep,
            claimedTargets,
            (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.8
        );
        if (worstCriticalRoad && hasEnergy) {
            setJob(creep, 'repair', worstCriticalRoad);
            return true;
        }

        // 4. Build construction sites (roads and containers only; falls back to any site).
        const site = selectRemoteMaintainerBuildSite(creep, claimedTargets);
        if (site && hasEnergy) {
            setJob(creep, 'build', site);
            return true;
        }

        // 5. Road upkeep: roads below 90% — lower threshold than step 3, runs after building
        // to catch gradual road decay before it hits the 80% critical threshold.
        const worstMinorRoad = selectRemoteMaintainerRepairTarget(
            creep,
            claimedTargets,
            (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.9
        );
        if (worstMinorRoad && hasEnergy) {
            setJob(creep, 'repair', worstMinorRoad);
            return true;
        }

        // 6. Collect energy — only when there is actual work queued.  Prevents the creep
        // from filling up on energy when all structures are healthy, which would otherwise
        // trigger the generic fallback and cause a pointless home↔remote bounce cycle.
        const hasWorkQueued = !!(criticalContainer || worstContainer || worstCriticalRoad || site || worstMinorRoad);
        if (hasWorkQueued && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const remoteEnergy = findRemoteEnergySource(creep, remotePlan, {
                droppedFirst: false,
                droppedMinAmount: 50
            });
            if (remoteEnergy) {
                setJob(creep, remoteEnergy.jobType, remoteEnergy.target);
                return true;
            }

            // Avoid a source we're currently stuck on (mirrors hauler retarget logic).
            // Use path-based selection so terrain-blocked sources are never picked.
            const stuckOnSourceId = (creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS
                && creep.memory.jobType === 'harvestSource'
                ? creep.memory.jobTargetId : undefined;
            const allSources = creep.room.find(FIND_SOURCES);
            const preferred = stuckOnSourceId ? allSources.filter(s => s.id !== stuckOnSourceId) : allSources;
            const sourcePool = preferred.length > 0 ? preferred : allSources;
            const source = (creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: false })
                ?? creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: true })) as Source | null;
            if (source) {
                setJob(creep, 'harvestSource', source);
                return true;
            }
        }

        // 7. Nothing to do: idle in the remote room rather than falling through to the
        // home-deposit fallback (which causes a pointless home↔remote bounce cycle).
        // The creep retains any energy it holds and will resume repairs as soon as
        // structures start to decay below the maintenance thresholds.
        setJob(creep, 'idle', creep.room.controller ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }

    // Fallback for legacy/misclassified remote creeps that still carry remote assignment.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        const structures = getRoomStructures(creep.room);
        const sink = structures.storage ?? closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
        } else {
            const towerFill = closest(creep, structures.towers.filter(t => t.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
            if (towerFill) {
                setJob(creep, 'refillTower', towerFill);
            } else {
                setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
            }
        }
        return true;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && capabilities.harvest > 0) {
        const source = closestReachable(creep, creep.room.find(FIND_SOURCES));
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        setJob(creep, 'idle', creep.room.controller);
    } else {
        setTravelJob(creep, remoteRoom);
    }
    return true;
}
function buildContext(room: Room): RoomControllerContext {
    const structures = getRoomStructures(room);
    const sources = room.find(FIND_SOURCES);
    const minerals = room.find(FIND_MINERALS);
    const creeps = room.find(FIND_MY_CREEPS);
    const droppedResources = room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.amount > 0
    }) as Resource<ResourceConstant>[];
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
    }) as Resource<RESOURCE_ENERGY>[];
    const tombstones = room.find(FIND_TOMBSTONES, {
        filter: (tombstone) => totalStoredResources(tombstone.store) > 0
    });
    const ruins = room.find(FIND_RUINS, {
        filter: (ruin) => totalStoredResources(ruin.store) > 0
    });
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const rcl = room.controller?.level ?? 0;
    const repairTargets = room.find(FIND_STRUCTURES, { filter: (s) => repairStructureFilter(s as AnyStructure, rcl) });
    const injuredCreeps = room.find(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
    const sourcePlans = buildSourcePlans(sources, structures);
    const mineralPlan = minerals[0] ? buildMineralPlan(minerals[0], structures) : null;

    return {
        room,
        structures,
        sources,
        mineral: minerals[0],
        creeps,
        droppedEnergy,
        droppedResources,
        tombstones,
        ruins,
        constructionSites,
        repairTargets,
        injuredCreeps,
        sourcePlans,
        mineralPlan
    };
}

function runLinks(context: RoomControllerContext): void {
    const sourceIds = new Set(context.structures.links.source.map((link) => link.id));
    const receivers = linkReceivers(context).filter((link) => !sourceIds.has(link.id));
    if (receivers.length === 0) { return; }

    const senders = uniqueLinks([
        ...context.structures.links.source,
        ...context.structures.links.other
    ]);

    for (const link of senders) {
        if (link.cooldown > 0) { continue; }
        if (link.store.getUsedCapacity(RESOURCE_ENERGY) < LINK_TRANSFER_THRESHOLD) { continue; }

        const receiver = receivers.find((candidate) =>
            candidate.id !== link.id &&
            candidate.store.getFreeCapacity(RESOURCE_ENERGY) >= LINK_TRANSFER_THRESHOLD);
        if (!receiver) { continue; }

        const code = link.transferEnergy(receiver);
        if (code !== OK && Game.time % 25 === 0) {
            console.log('room.controller: source link transfer failed in ' + context.room.name + ' with code ' + code);
        }
    }
}

function reportPassiveInfrastructure(context: RoomControllerContext): void {
    if (Game.time % 100 !== 0) { return; }

    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const labMinerals = context.structures.labs
        .map((lab) => lab.mineralType ? lab.mineralType + ':' + lab.store.getUsedCapacity(lab.mineralType) : 'empty')
        .join(',');

    console.log('room.controller: ' + context.room.name +
        ' RCL ' + (context.room.controller?.level ?? 0) +
        ' stored=' + storedEnergy(context) +
        ' terminalEnergy=' + terminalEnergy +
        ' labs=' + (labMinerals || 'none') +
        ' remotes=' + Object.keys(context.room.memory.plan?.remoteRooms ?? {}).length);
}

function assignJobs(context: RoomControllerContext): void {
    const reservations = createReservations(context);
    const creeps = context.creeps
        .filter((creep) => !creep.spawning && creep.memory.role !== 'defender')
        .filter((creep) => !isDedicatedRemoteCreep(creep, context.room.name))
        .sort((a, b) => assignmentPriority(ensureArchetype(a)) - assignmentPriority(ensureArchetype(b)));

    for (const creep of creeps) {
        const archetype = ensureArchetype(creep);
        if (keepCurrentJob(context, creep, archetype, reservations)) { continue; }
        assignJob(context, creep, reservations);
    }
}

function isDedicatedRemoteCreep(creep: Creep, homeRoomName: string): boolean {
    return creep.memory.homeRoom === homeRoomName && Boolean(creep.memory.remoteRoom);
}


function assignJob(context: RoomControllerContext, creep: Creep, reservations: JobReservations): void {
    const capabilities = getCreepCapabilities(creep);
    const archetype = ensureArchetype(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();
    const hasMinerals = totalUsed > energyUsed;

    if (hasMinerals && archetype !== 'mineralMiner') {
        const resourceSink = resourceDepositTarget(context);
        if (resourceSink) {
            setResourceJob(creep, 'depositResource', resourceSink, firstStoredResource(creep.store));
            return;
        }
    }

    if ((archetype === 'miner' || archetype === 'remoteMiner') && capabilities.harvest > 0) {
        const sourcePlan = assignedSourcePlan(creep, context.sourcePlans, reservations);
        if (sourcePlan) {
            reserveSourceIfNeeded(creep, reservations, sourcePlan, capabilities.harvest);
            setStaticHarvestMemory(creep, sourcePlan);
            setJob(creep, 'harvestSource', sourcePlan.source);
            return;
        }
    }

    if (archetype === 'mineralMiner' && capabilities.harvest > 0 && context.mineralPlan && mineralReadyToMine(context)) {
        reservations.mineralWork += capabilities.harvest;
        setStaticMineralMemory(creep, context.mineralPlan);
        setJob(creep, 'mineMineral', context.mineralPlan.mineral);
        return;
    }

    if (capabilities.heal > 0 && context.injuredCreeps.length > 0) {
        setJob(creep, 'heal', bestHealTarget(creep, context.injuredCreeps));
        return;
    }

    if (assignEmergencyEnergyDelivery(context, creep, archetype, capabilities, reservations)) {
        return;
    }

    if (energyUsed > 0) {
        if (archetype === 'worker' &&
            creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            hasEnergyToGather(context)) {
            if (assignWorkerPartialEnergyWork(context, creep, capabilities, reservations)) { return; }

            // Not full and there's ambient energy — fall through to top up from storage.
            // (energyWithdrawalTarget always returns storage for workers, so the "dump
            // partial then re-withdraw" pattern is never needed and only causes bouncing.)
        } else if (archetype === 'hauler' &&
                   creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                   (context.sourcePlans.some(p => p.container &&
                        creep.pos.getRangeTo(p.container) <= 3 &&
                        p.container.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)) ||
                    context.structures.links.source.some(l =>
                        creep.pos.getRangeTo(l) <= 3 &&
                        l.store.getUsedCapacity(RESOURCE_ENERGY) >= haulerMiningSiteMinPickup(creep)))) {
            // Hauler at a source site with free capacity — fall through to top up from the container/link
            // before leaving, but only if it has enough to meet the min-pickup threshold.
        } else {
            assignEnergySpendingJob(context, creep, archetype, capabilities, reservations);
            return;
        }
    }

    if (capabilities.haul > 0) {
        const dropped = droppedResourceTarget(context, creep, reservations);
        if (dropped) {
            reserveDroppedTarget(reservations, dropped.id, Math.min(creep.store.getFreeCapacity(), dropped.amount));
            setResourceJob(creep, 'pickupResource', dropped, dropped.resourceType);
            return;
        }

        const salvage = salvageWithdrawalTarget(context, creep, reservations);
        if (salvage) {
            reserveResourceTarget(reservations, salvage.target.id, Math.min(creep.store.getFreeCapacity(), salvage.amount));
            setResourceJob(creep, 'withdrawResource', salvage.target, salvage.resource);
            return;
        }

        if (archetype === 'hauler') {
            const mineralContainer = mineralContainerWithdrawalTarget(context, creep, archetype, reservations);
            if (mineralContainer) {
                reserveResourceTarget(reservations, mineralContainer.target.id, Math.min(creep.store.getFreeCapacity(), mineralContainer.amount));
                setResourceJob(creep, 'withdrawResource', mineralContainer.target, mineralContainer.resource);
                return;
            }
        }

        if ((archetype === 'hauler' || archetype === 'worker') && roomNeedsCriticalEnergyRecovery(context)) {
            const spawnTarget = refillSpawnTarget(context, creep, reservations);
            if (spawnTarget) {
                const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
                if (withdrawalTarget) {
                    setJob(creep, 'withdrawEnergy', withdrawalTarget);
                    return;
                }
            }
        }

        if (archetype === 'hauler' &&
            context.structures.storage &&
            terminalEnergyReserveDeficit(context, reservations) > 0 &&
            !roomNeedsCriticalEnergyRecovery(context) &&
            !roomHasEnergyDemand(context)) {
            const storageReserved = reservations.resources[context.structures.storage.id] ?? 0;
            const storageAvailable = context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) - storageReserved;
            if (storageAvailable > 0) {
                setJob(creep, 'withdrawEnergy', context.structures.storage);
                return;
            }
        }

        const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype, reservations);
        if (withdrawalTarget) {
            setJob(creep, 'withdrawEnergy', withdrawalTarget);
            return;
        }

        if (archetype === 'worker') {
            const mineralContainer = mineralContainerWithdrawalTarget(context, creep, archetype, reservations);
            if (mineralContainer) {
                reserveResourceTarget(reservations, mineralContainer.target.id, Math.min(creep.store.getFreeCapacity(), mineralContainer.amount));
                setResourceJob(creep, 'withdrawResource', mineralContainer.target, mineralContainer.resource);
                return;
            }
        }
    }

    if (capabilities.harvest > 0 && archetype !== 'hauler' && archetype !== 'remoteHauler') {
        const fallbackSourcePlan = closestSourcePlan(creep, context.sourcePlans);
        if (fallbackSourcePlan) {
            clearStaticMiningMemory(creep);
            setJob(creep, 'harvestSource', fallbackSourcePlan.source);
            return;
        }
    }

    if (capabilities.reserve > 0 && context.room.controller) {
        setJob(creep, 'reserveController', context.room.controller);
        return;
    }

    setJob(creep, 'idle', context.structures.storage ?? context.structures.spawns[0]);
}

function hasEnergyToGather(context: RoomControllerContext): boolean {
    if (context.droppedEnergy.length > 0) return true;
    if (context.tombstones.length > 0) return true;
    if (context.structures.containers.some(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return true;
    if (context.structures.links.source.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.controller.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.hub.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    if (context.structures.links.sink.some(l => l.store.getUsedCapacity(RESOURCE_ENERGY) > 0)) return true;
    return false;
}

function assignWorkerPartialEnergyWork(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
    if (capabilities.build > 0 && context.constructionSites.length > 0) {
        const site = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (site) {
            reserveConstructionProgress(reservations, site, capabilities.build);
            rememberPrimaryJob(creep, 'build', site);
            setJob(creep, 'build', site);
            return true;
        }
    }

    if (capabilities.repair > 0 &&
        context.repairTargets.length > 0 &&
        shouldRepairWithCreeps(context)) {
        const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
        if (repairTarget) {
            reserveRepairProgress(reservations, repairTarget, capabilities.repair);
            rememberPrimaryJob(creep, 'repair', repairTarget);
            setJob(creep, 'repair', repairTarget);
            return true;
        }
    }

    if (capabilities.upgrade > 0 && context.room.controller && shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return true;
    }

    return false;
}

function assignEnergySpendingJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): void {
    const spawnRatio = spawnEnergyRatio(context);
    if (!(archetype === 'worker' && context.structures.storage && spawnRatio >= 0.5)) {
        const spawnTarget = refillSpawnTarget(context, creep, reservations);
        if (spawnTarget) {
            reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'refillSpawn', spawnTarget);
            return;
        }

        const towerTarget = refillTowerTarget(context, creep, reservations);
        if (towerTarget) {
            reserveEnergySink(reservations, towerTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), towerTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'refillTower', towerTarget);
            return;
        }

        const terminalTarget = refillTerminalTarget(context, creep, reservations);
        if (terminalTarget) {
            reserveEnergySink(reservations, terminalTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), terminalTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
            setJob(creep, 'depositEnergy', terminalTarget);
            return;
        }
    }

    const resumed = resumePrimaryEnergyJob(context, creep, capabilities, reservations);
    if (resumed) { return; }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const sink = energyDepositTarget(context, creep, reservations);
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
            return;
        }
    }

    if (Object.keys(reservations.constructionProgress).length === 0 && capabilities.build > 0 && context.constructionSites.length > 0) {
        const guaranteedSite = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (guaranteedSite) {
            reserveConstructionProgress(reservations, guaranteedSite, capabilities.build);
            rememberPrimaryJob(creep, 'build', guaranteedSite);
            setJob(creep, 'build', guaranteedSite);
            return;
        }
    }

    if (reservations.upgraderWork === 0 &&
        capabilities.upgrade > 0 &&
        context.room.controller &&
        shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.upgrade > 0 && context.room.controller && shouldReserveUpgrade(context, reservations)) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.build > 0 && context.constructionSites.length > 0) {
        const site = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
        if (site) {
            reserveConstructionProgress(reservations, site, capabilities.build);
            rememberPrimaryJob(creep, 'build', site);
            setJob(creep, 'build', site);
            return;
        }
    }

    if (capabilities.upgrade > 0 && context.room.controller) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    if (capabilities.repair > 0 && context.repairTargets.length > 0 && shouldRepairWithCreeps(context)) {
        const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
        if (repairTarget) {
            reserveRepairProgress(reservations, repairTarget, capabilities.repair);
            rememberPrimaryJob(creep, 'repair', repairTarget);
            setJob(creep, 'repair', repairTarget);
            return;
        }
    }

    const sink = energyDepositTarget(context, creep, reservations);
    setJob(creep, 'depositEnergy', sink);
}
function createReservations(context: RoomControllerContext): JobReservations {
    const reservations: JobReservations = {
        resources: {},
        dropped: {},
        energySinks: {},
        constructionProgress: {},
        repairProgress: {},
        sourceWork: {},
        sourceMinerCount: {},
        mineralWork: 0,
        upgraderWork: 0
    };

    for (const creep of context.creeps) {
        const capabilities = getCreepCapabilities(creep);
        const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        if (sourceId && ensureArchetype(creep) === 'miner') {
            reservations.sourceWork[sourceId] = (reservations.sourceWork[sourceId] ?? 0) + capabilities.harvest;
            reservations.sourceMinerCount[sourceId] = (reservations.sourceMinerCount[sourceId] ?? 0) + 1;
        }
        if (creep.spawning) { continue; }
        if (creep.memory.assignedMineralId && ensureArchetype(creep) === 'mineralMiner') {
            reservations.mineralWork += capabilities.harvest;
        }
    }

    return reservations;
}

function assignmentPriority(archetype: CreepArchetype): number {
    if (archetype === 'miner' || archetype === 'remoteMiner') { return 1; }
    if (archetype === 'mineralMiner') { return 2; }
    if (archetype === 'hauler' || archetype === 'remoteHauler') { return 3; }
    if (archetype === 'doctor') { return 4; }
    if (archetype === 'worker') { return 5; }
    return 6;
}
