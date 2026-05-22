import { BODY_BUDGET_RATIO, BODY_MIN_BUDGET, MAX_CARRY_CAPACITY, bodyCost, ensureArchetype, getBodyCapabilities, getCreepCapabilities, planBodyForArchetype } from '../creep.capabilities';
import { clearJob } from '../creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from '../room.structures';
import { repairStructureFilter, wallRampartRepairCap } from '../role.doctor';
import { findHostiles, isHostile } from '../hostileUtils';
import { acquireRenewSpawn, nearestSpawn, reserveRenewSpawns } from '../spawn.renewal';

import { RoomControllerContext, SpawnRequest, PendingSpawnRequest, ResourceTarget, SourcePlan, MineralPlan, JobReservations } from './types';
import {
    TOWER_RESERVE_RATIO, TOWER_RECOVERY_RATIO, TOWER_HAULER_DEPOSIT_RATIO, ENERGY_RECOVERY_ENTER_SPAWN_RATIO,
    ENERGY_RECOVERY_EXIT_SPAWN_RATIO, ENERGY_RECOVERY_ENTER_TOWER_RATIO, ENERGY_RECOVERY_EXIT_TOWER_RATIO,
    WORKER_EMERGENCY_SPAWN_RATIO, TOWER_REFILL_SPAWN_YIELD_RATIO, TERMINAL_RESERVE_RCL6, TERMINAL_RESERVE_RCL7,
    TERMINAL_RESERVE_RCL8, MINERAL_WORK_DEMAND, LINK_TRANSFER_THRESHOLD, BUILD_RESERVATION_TICKS,
    REPAIR_RESERVATION_TICKS, REMOTE_DANGER_TICKS, REMOTE_PATH_REFRESH_INTERVAL, REMOTE_INACCESSIBLE_RETRY_TICKS,
    REMOTE_CONTAINER_REROUTE_FREEZE_TICKS, REMOTE_PATH_INCOMPLETE_RETRY_TICKS, REMOTE_MAX_STATION_STALLS,
    REMOTE_MAX_STATION_FAILURES, REMOTE_ROAD_SITES_PER_TICK, REMOTE_MAX_UNFINISHED_ROAD_SITES,
    REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES, REMOTE_CONTAINER_BUILD_DISTANCE, REMOTE_SCOUT_KEEP_COUNT,
    REMOTE_SCOUT_WANDER_TICKS, REMOTE_SCOUT_CROWD_THRESHOLD, REMOTE_PLANNING_LOG_INTERVAL, DOCTOR_EMERGENCY_HITS_RATIO,
    DOCTOR_THREAT_RADIUS, REMOTE_AUX_BUILD_RANGE, REMOTE_RENEW_MIN_TTL, REMOTE_RENEW_BUFFER_TICKS,
    REMOTE_RENEW_HYSTERESIS, REMOTE_REPLACEMENT_BUFFER_TICKS, REMOTE_STANDBY_TRIGGER_TTL, REMOTE_STANDBY_PARK_RANGE_MIN,
    REMOTE_STANDBY_PARK_RANGE_TARGET, REMOTE_STANDBY_PARK_RANGE_MAX, REMOTE_STANDBY_BOUNDARY_STUCK_TICKS,
    MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE, MAX_REMOTE_HAULERS_PER_SOURCE, REMOTE_HAULER_POST_TRIP_RENEW_START_TTL,
    REMOTE_HAULER_RENEW_START_TTL, REMOTE_HAULER_RENEW_STOP_TTL, REMOTE_HAULER_RENEW_CRITICAL_TTL,
    REMOTE_HAULER_IDLE_RECHECK_TICKS, REMOTE_HAULER_WANDER_TICKS, REMOTE_HAULER_WANDER_MIN_RANGE,
    REMOTE_HAULER_WANDER_MAX_RANGE, REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH, REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO,
    REMOTE_HAULER_RETARGET_STUCK_TICKS, REMOTE_TARGET_MAX_HAULER_CLAIMS, REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY,
    REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY, REMOTE_MINER_STUCK_REPLAN_TICKS, REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS,
    REMOTE_MINER_OSCILLATION_REPLAN_TICKS, REMOTE_HOME_RECOVERY_STORED_ENERGY, REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED,
    REMOTE_THROTTLE_STORED_ENERGY, REMOTE_SPAWN_MIN_ENERGY_RATIO, REMOTE_HAULER_ABSOLUTE_MIN_COST,
    REMOTE_HAULER_USEFUL_MIN_COST, REMOTE_HAULER_MIN_DEMAND_RATIO, REMOTE_MAINTAINER_MIN_COST,
    REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD, REMOTE_MINER_REPAIR_THRESHOLD, REMOTE_MINER_REPAIR_RANGE
} from './constants';
import { buildContext, initialiseRoomPlan, rememberRcl, updatePlanAssignments, rememberLoad, rememberPlans, roomNeedsCriticalEnergyRecovery, reportPassiveInfrastructure } from "./context";
import { assignJobs, setTravelJob, setJob, closest, closestReachable } from "./jobs";
import { runLinks } from "./links";
import { updateRemoteRoomPlans, assignRemoteHaulerCycle, manageRemoteRenewal, remoteScoutPack, assignOverflowRemoteScout, remoteRoomCrowdedForScout, assignStandbyRemoteMiner, primeRemoteMinerTravelStation, shouldBuildRemoteInfrastructure, preferredRemoteInfrastructureSite, closestRemoteInfrastructureSite, remoteSourceMinerSlotCap, pickRemoteMinerSource, remoteSourceRouteDegraded, remoteMinerStationRouteStalled, markRemoteSourceRouteDegraded, resetRemoteMinerStationProgress, findRemoteEnergySource } from "./remote";
import { runSpawnPlanner, creepsForHomeRoom } from "./spawn";

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

    const remoteBuildSite = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? preferredRemoteInfrastructureSite(creep, archetype, closestRemoteInfrastructureSite(creep, archetype === 'remoteMaintainer'))
        : null;
    if (remoteBuildSite) {
        setJob(creep, 'build', remoteBuildSite);
        return true;
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
                             creep.pos.getRangeTo(s) <= REMOTE_MINER_REPAIR_RANGE
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
        const criticalContainer = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD
        }) as AnyStructure[]);
        if (criticalContainer && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'repair', criticalContainer);
            return true;
        }
        const site = closestRemoteInfrastructureSite(creep, true) ??
            closest(creep, creep.room.find(FIND_MY_CONSTRUCTION_SITES));
        if (site && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'build', site);
            return true;
        }
        const repair = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.9
        }) as AnyStructure[]);
        if (repair && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'repair', repair);
            return true;
        }
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
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



export * from "./context";
export * from "./links";
export * from "./jobs";
export * from "./spawn";
export * from "./remote";
