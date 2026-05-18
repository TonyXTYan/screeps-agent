import { BODY_BUDGET_RATIO, BODY_MIN_BUDGET, MAX_CARRY_CAPACITY, bodyCost, ensureArchetype, getBodyCapabilities, getCreepCapabilities, planBodyForArchetype } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from './room.structures';
import { repairStructureFilter, wallRampartRepairCap } from './role.doctor';
import { findHostiles, isHostile } from './hostileUtils';
import { acquireRenewSpawn, nearestSpawn, reserveRenewSpawns } from './spawn.renewal';

interface RoomControllerContext {
    room: Room;
    structures: RoomStructureCache;
    sources: Source[];
    mineral: Mineral | undefined;
    creeps: Creep[];
    droppedEnergy: Resource<RESOURCE_ENERGY>[];
    droppedResources: Resource<ResourceConstant>[];
    tombstones: Tombstone[];
    ruins: Ruin[];
    constructionSites: ConstructionSite[];
    repairTargets: AnyStructure[];
    injuredCreeps: Creep[];
    sourcePlans: SourcePlan[];
    mineralPlan: MineralPlan | null;
}

interface SpawnRequest {
    archetype: CreepArchetype;
    reason: string;
    sourceId?: string;
    mineralId?: string;
    stationaryTargetId?: string;
    staticMining?: boolean;
    hasContainer?: boolean;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    workRatio?: number;
    minClaimParts?: number;
    maxClaimParts?: number;
    remoteStandby?: boolean;
}

interface PendingSpawnRequest extends SpawnRequest {
    plannedBody?: BodyPartConstant[];
}

interface ResourceTarget {
    target: WithdrawStructure;
    resource: ResourceConstant;
    amount: number;
}

interface SourcePlan {
    source: Source;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

interface MineralPlan {
    mineral: Mineral;
    extractor: StructureExtractor | undefined;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

interface JobReservations {
    resources: { [targetId: string]: number };
    dropped: { [targetId: string]: number };
    energySinks: { [targetId: string]: number };
    constructionProgress: { [targetId: string]: number };
    repairProgress: { [targetId: string]: number };
    sourceWork: { [sourceId: string]: number };
    sourceMinerCount: { [sourceId: string]: number };
    mineralWork: number;
    upgraderWork: number;
}

const TOWER_RESERVE_RATIO = 0.7;
const TOWER_RECOVERY_RATIO = 0.55;
const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
// Workers only drop non-hauling work to emergency-refill spawns when critically low
const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
// Spawn fill ratio at which haulers yield spawn priority to tower refill
const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;
const TERMINAL_RESERVE_RCL6 = 5000;
const TERMINAL_RESERVE_RCL7 = 10000;
const TERMINAL_RESERVE_RCL8 = 50000;

const MINERAL_WORK_DEMAND = 5;
const LINK_TRANSFER_THRESHOLD = 200;
const BUILD_RESERVATION_TICKS = 10;
const REPAIR_RESERVATION_TICKS = 5;
const REMOTE_DANGER_TICKS = 1500;
const REMOTE_PATH_REFRESH_INTERVAL = 5000;
const REMOTE_INACCESSIBLE_RETRY_TICKS = 500;
const REMOTE_CONTAINER_REROUTE_FREEZE_TICKS = 150;
const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
const REMOTE_MAX_STATION_STALLS = 3;
const REMOTE_MAX_STATION_FAILURES = 3;
const REMOTE_ROAD_SITES_PER_TICK = 4;
const REMOTE_MAX_UNFINISHED_ROAD_SITES = 3;
const REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES = 8;
const REMOTE_CONTAINER_BUILD_DISTANCE = 1;
const REMOTE_SCOUT_KEEP_COUNT = 2;
const REMOTE_SCOUT_WANDER_TICKS = 120;
const REMOTE_SCOUT_CROWD_THRESHOLD = 4;
const REMOTE_PLANNING_LOG_INTERVAL = 100;
const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const REMOTE_AUX_BUILD_RANGE = 8;
const REMOTE_RENEW_MIN_TTL = 220;
const REMOTE_RENEW_BUFFER_TICKS = 80;
const REMOTE_RENEW_HYSTERESIS = 140;
const REMOTE_REPLACEMENT_BUFFER_TICKS = 60;
const REMOTE_STANDBY_TRIGGER_TTL = 200;
const REMOTE_STANDBY_PARK_RANGE_MIN = 4;
const REMOTE_STANDBY_PARK_RANGE_TARGET = 6;
const REMOTE_STANDBY_PARK_RANGE_MAX = 10;
const REMOTE_STANDBY_BOUNDARY_STUCK_TICKS = 15;
const MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500;
const MAX_REMOTE_HAULERS_PER_SOURCE = 2;
const REMOTE_HAULER_POST_TRIP_RENEW_START_TTL = 1000;
const REMOTE_HAULER_RENEW_START_TTL = 500;
const REMOTE_HAULER_RENEW_STOP_TTL = 1400;
const REMOTE_HAULER_RENEW_CRITICAL_TTL = 80;
const REMOTE_HAULER_IDLE_RECHECK_TICKS = 75;
const REMOTE_HAULER_WANDER_TICKS = 35;
const REMOTE_HAULER_WANDER_MIN_RANGE = 6;
const REMOTE_HAULER_WANDER_MAX_RANGE = 8;
const REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH = 100;
const REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO = 0.75;
const REMOTE_HAULER_RETARGET_STUCK_TICKS = 4;
const REMOTE_TARGET_MAX_HAULER_CLAIMS = 2;
const REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY = 50;
const REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY = 1000;
const REMOTE_MINER_STUCK_REPLAN_TICKS = 8;
const REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS = 18;
const REMOTE_MINER_OSCILLATION_REPLAN_TICKS = 4;
const REMOTE_HOME_RECOVERY_STORED_ENERGY = 500;
const REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED = 5000;
const REMOTE_THROTTLE_STORED_ENERGY = 1;
const REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5;
const REMOTE_HAULER_ABSOLUTE_MIN_COST = 600;
const REMOTE_HAULER_USEFUL_MIN_COST = 900;
const REMOTE_HAULER_MIN_DEMAND_RATIO = 0.4;
const REMOTE_MAINTAINER_MIN_COST = 500;
const REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD = 0.25;
const REMOTE_MINER_REPAIR_THRESHOLD = 0.5;
const REMOTE_MINER_REPAIR_RANGE = 3;

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

function primeRemoteMinerTravelStation(creep: Creep, remotePlan: RemoteRoomPlan): void {
    const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!sourceId) { return; }
    const sourcePlan = remotePlan.sources?.[sourceId];
    if (!sourcePlan || sourcePlan.stationX == null || sourcePlan.stationY == null) { return; }
    creep.memory.stationX = sourcePlan.stationX;
    creep.memory.stationY = sourcePlan.stationY;
}

function remoteMinerStationRouteStalled(
    creep: Creep,
    source: Source,
    sourcePlan: RemoteSourcePlan
): boolean {
    if (!remoteSourceHasStaticStation(sourcePlan)) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    if (sourcePlan.routeAccessible === false || creep.room.name !== source.pos.roomName) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    const sameHarvestJob = creep.memory.jobType === 'harvestSource' && creep.memory.jobTargetId === source.id;
    if ((sameHarvestJob && creep.memory.lastJobResult === OK) || creep.pos.getRangeTo(source) <= 1) {
        markRemoteSourceRouteHealthy(sourcePlan);
        resetRemoteMinerStationProgress(creep);
        return false;
    }
    if (!sameHarvestJob || creep.memory.lastJobResult !== ERR_NOT_IN_RANGE) {
        resetRemoteMinerStationProgress(creep);
        return false;
    }

    if (creep.fatigue > 0) {
        // Update position history without resetting stuck counters.
        // Without this, the 3 resting ticks between plain-terrain moves would
        // clear all tracking state and prevent noProgressTicks from accumulating.
        creep.memory.remoteStationStuckSourceId = source.id;
        creep.memory.remoteStationPrevX = creep.memory.remoteStationLastX;
        creep.memory.remoteStationPrevY = creep.memory.remoteStationLastY;
        creep.memory.remoteStationPrevRoom = creep.memory.remoteStationLastRoom;
        creep.memory.remoteStationLastX = creep.pos.x;
        creep.memory.remoteStationLastY = creep.pos.y;
        creep.memory.remoteStationLastRoom = creep.pos.roomName;
        return false;
    }

    const positionKey = creep.pos.x + ',' + creep.pos.y + ',' + creep.pos.roomName;
    const sameSource = creep.memory.remoteStationStuckSourceId === source.id;
    const lastPositionKey = creep.memory.remoteStationLastX + ',' +
        creep.memory.remoteStationLastY + ',' +
        creep.memory.remoteStationLastRoom;
    const prevPositionKey = creep.memory.remoteStationPrevX + ',' +
        creep.memory.remoteStationPrevY + ',' +
        creep.memory.remoteStationPrevRoom;
    const stalled = sameSource &&
        creep.memory.remoteStationLastX !== undefined &&
        positionKey === lastPositionKey;
    const oscillating = sameSource &&
        !stalled &&
        creep.memory.remoteStationPrevX !== undefined &&
        positionKey === prevPositionKey;

    const rangeToSource = creep.pos.getRangeTo(source);
    const priorBestRange = sameSource
        ? creep.memory.remoteStationBestRange
        : undefined;
    const improvedBestRange = priorBestRange === undefined || rangeToSource < priorBestRange;
    const noProgressTicks = improvedBestRange
        ? 0
        : (sameSource ? (creep.memory.remoteStationNoProgressTicks ?? 0) + 1 : 0);
    const oscillationTicks = oscillating
        ? (creep.memory.remoteStationOscillationTicks ?? 0) + 1
        : 0;
    const stuckSignal = stalled ||
        oscillationTicks >= REMOTE_MINER_OSCILLATION_REPLAN_TICKS ||
        noProgressTicks >= REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS;
    const stuckTicks = stuckSignal
        ? (sameSource ? (creep.memory.remoteStationStuckTicks ?? 0) + 1 : 1)
        : Math.max(0, (sameSource ? (creep.memory.remoteStationStuckTicks ?? 0) : 0) - 1);

    creep.memory.remoteStationStuckSourceId = source.id;
    creep.memory.remoteStationPrevX = creep.memory.remoteStationLastX;
    creep.memory.remoteStationPrevY = creep.memory.remoteStationLastY;
    creep.memory.remoteStationPrevRoom = creep.memory.remoteStationLastRoom;
    creep.memory.remoteStationLastX = creep.pos.x;
    creep.memory.remoteStationLastY = creep.pos.y;
    creep.memory.remoteStationLastRoom = creep.pos.roomName;
    creep.memory.remoteStationBestRange = improvedBestRange
        ? rangeToSource
        : (priorBestRange ?? rangeToSource);
    creep.memory.remoteStationNoProgressTicks = noProgressTicks;
    creep.memory.remoteStationOscillationTicks = oscillationTicks;
    creep.memory.remoteStationStuckTicks = stuckTicks;

    return stuckTicks >= REMOTE_MINER_STUCK_REPLAN_TICKS;
}

function resetRemoteMinerStationProgress(creep: Creep): void {
    creep.memory.remoteStationStuckSourceId = undefined;
    creep.memory.remoteStationPrevX = undefined;
    creep.memory.remoteStationPrevY = undefined;
    creep.memory.remoteStationPrevRoom = undefined;
    creep.memory.remoteStationLastX = undefined;
    creep.memory.remoteStationLastY = undefined;
    creep.memory.remoteStationLastRoom = undefined;
    creep.memory.remoteStationBestRange = undefined;
    creep.memory.remoteStationNoProgressTicks = undefined;
    creep.memory.remoteStationOscillationTicks = undefined;
    creep.memory.remoteStationStuckTicks = undefined;
}

function clearRemoteMinerStationMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.stationX = undefined;
    creep.memory.stationY = undefined;
    resetRemoteMinerStationProgress(creep);
    creep.memory.standbyParkStuckTicks = undefined;
    creep.memory.standbyParkLastX = undefined;
    creep.memory.standbyParkLastY = undefined;
}

function markRemoteSourceRouteHealthy(sourcePlan: RemoteSourcePlan): void {
    sourcePlan.routeHealth = 'healthy';
    sourcePlan.stallCount = 0;
    sourcePlan.lastHarvestedAt = Game.time;
    sourcePlan.stationFailures = 0;
    sourcePlan.blockedApproachX = undefined;
    sourcePlan.blockedApproachY = undefined;
    sourcePlan.blockedApproachRoom = undefined;
    sourcePlan.containerClearedAt = undefined;
}

function markRemoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan, pos: RoomPosition): void {
    sourcePlan.routeHealth = 'degraded';
    sourcePlan.lastStallAt = Game.time;
    sourcePlan.stallCount = (sourcePlan.stallCount ?? 0) + 1;
    sourcePlan.lastStallX = pos.x;
    sourcePlan.lastStallY = pos.y;
    sourcePlan.lastStallRoom = pos.roomName;
    if ((sourcePlan.stallCount ?? 0) >= REMOTE_MAX_STATION_STALLS) {
        sourcePlan.routeAccessible = false;
        // Record the stuck zone for future pathfinding avoidance
        sourcePlan.blockedApproachX = pos.x;
        sourcePlan.blockedApproachY = pos.y;
        sourcePlan.blockedApproachRoom = pos.roomName;
        sourcePlan.stallCount = 0;
        const stationFailures = (sourcePlan.stationFailures ?? 0) + 1;
        sourcePlan.stationFailures = stationFailures;
        if (stationFailures < REMOTE_MAX_STATION_FAILURES) {
            // Clear station to force a new one, re-evaluate immediately
            sourcePlan.stationX = undefined;
            sourcePlan.stationY = undefined;
            sourcePlan.containerId = undefined;
            sourcePlan.containerSiteId = undefined;
            sourcePlan.containerClearedAt = Game.time;
            sourcePlan.pathUpdatedAt = undefined;
            console.log('room.controller: force-clearing station for re-route (failure #' +
                stationFailures + ') source=' + sourcePlan.sourceId +
                ' blocked at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
        } else {
            // Too many station failures: pathStale check uses shorter interval for blocked routes
            sourcePlan.pathUpdatedAt = Game.time;
            console.log('room.controller: permanently inaccessible after ' + stationFailures +
                ' station failures source=' + sourcePlan.sourceId +
                ' at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
        }
    } else {
        sourcePlan.pathUpdatedAt = undefined;
        console.log('room.controller: degraded remote source route source=' + sourcePlan.sourceId +
            ' after miner stall at ' + pos.roomName + ':' + pos.x + ',' + pos.y);
    }
}

function assignStandbyRemoteMiner(creep: Creep, homeRoom: string, remoteRoom: string, remotePlan: RemoteRoomPlan): boolean {
    const homeFleet = creepsForHomeRoom(homeRoom);
    let standbySourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!standbySourceId) {
        const dyingMiner = findDyingRemoteMiner(homeFleet, remoteRoom);
        standbySourceId = dyingMiner?.memory.assignedSourceId ?? dyingMiner?.memory.sourceId;
    }
    if (!standbySourceId) {
        standbySourceId = sourceNeedingBlankStandbyMiner(homeFleet, remoteRoom, remotePlan, creep.id) ?? undefined;
    }

    if (!standbySourceId) {
        creep.memory.sourceId = undefined;
        creep.memory.assignedSourceId = undefined;
        creep.memory.stationaryTargetId = undefined;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
        setTravelJob(creep, homeRoom);
        return true;
    }

    creep.memory.sourceId = standbySourceId;
    creep.memory.assignedSourceId = standbySourceId;

    const activeMinerAlive = hasActiveRemoteMinerForSource(homeFleet, remoteRoom, standbySourceId, creep.id);
    if (!activeMinerAlive) {
        creep.memory.remoteStandby = undefined;
        if (creep.room.name !== remoteRoom) {
            setTravelJob(creep, remoteRoom);
            return true;
        }

        const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
            creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
            null;
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }

        setTravelJob(creep, remoteRoom);
        return true;
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
        creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
        null;
    if (!source) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const range = creep.pos.getRangeTo(source);
    if (range > REMOTE_STANDBY_PARK_RANGE_MAX || range < REMOTE_STANDBY_PARK_RANGE_MIN) {
        const atBoundary = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
        const samePos = creep.memory.standbyParkLastX === creep.pos.x && creep.memory.standbyParkLastY === creep.pos.y;
        const stuckTicks = samePos ? (creep.memory.standbyParkStuckTicks ?? 0) + 1 : 0;
        creep.memory.standbyParkStuckTicks = stuckTicks;
        creep.memory.standbyParkLastX = creep.pos.x;
        creep.memory.standbyParkLastY = creep.pos.y;

        if (atBoundary && stuckTicks >= REMOTE_STANDBY_BOUNDARY_STUCK_TICKS) {
            // Can't navigate to park position from room entry — go home and wait
            creep.memory.standbyParkStuckTicks = 0;
            setTravelJob(creep, creep.memory.homeRoom!);
            return true;
        }
        creep.moveTo(source, {
            range: REMOTE_STANDBY_PARK_RANGE_TARGET,
            ignoreCreeps: true,
            reusePath: 0,
            visualizePathStyle: { stroke: '#f59e0b' }
        });
    }
    return true;
}

function preferredRemoteInfrastructureSite(
    creep: Creep,
    archetype: CreepArchetype,
    selectedSite: ConstructionSite | null
): ConstructionSite | null {
    if (archetype !== 'remoteMaintainer') { return selectedSite; }

    const currentSite = currentRemoteInfrastructureBuildSite(creep);
    if (currentSite) { return currentSite; }
    return selectedSite;
}

function currentRemoteInfrastructureBuildSite(creep: Creep): ConstructionSite | null {
    if (creep.memory.jobType !== 'build') { return null; }
    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return null; }

    const site = Game.getObjectById(targetId as Id<ConstructionSite>);
    if (!site) { return null; }
    if (site.progress >= site.progressTotal) { return null; }
    if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER) { return null; }
    return site;
}

function assignRemoteHaulerCycle(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const totalUsed = creep.store.getUsedCapacity();
    const totalCapacity = creep.store.getCapacity();
    const ttl = creep.ticksToLive ?? 0;
    const loadRatio = totalCapacity > 0 ? totalUsed / totalCapacity : 1;
    const full = creep.store.getFreeCapacity() === 0;

    if (totalUsed > 0) {
        const workParts = creep.getActiveBodyparts(WORK);
        const freeCapacity = creep.store.getFreeCapacity();
        // Skip top-up when free capacity ≤ WORK parts: opportunistic repair burns exactly
        // what the top-up picks up each tick, leaving the creep stuck at that threshold.
        const worthTopping = freeCapacity > 0 && (workParts === 0 || freeCapacity > workParts);
        if (worthTopping && !creep.memory.remoteHaulerReturning && creep.room.name === remoteRoom) {
            const followDroppedTopUp = creep.memory.remoteHaulerLastPickupWasDropped === true &&
                creep.memory.jobType !== 'pickupEnergy';
            const source = findRemoteEnergySource(creep, remotePlan, {
                followDroppedTopUp
            });
            if (source) {
                const pathLength = remoteEnergyTargetPathLength(creep, source.target);
                const isFarPickup = pathLength !== null && pathLength > REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH;
                if (!isFarPickup || loadRatio < REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO) {
                    creep.memory.remoteHaulerIdleUntil = undefined;
                    clearRemoteHaulerWanderMemory(creep);
                    creep.memory.remoteHaulerLastPickupWasDropped = source.fromDropped ? true : undefined;
                    setJob(creep, source.jobType, source.target);
                    return true;
                }
            }
        }

        creep.memory.remoteHaulerReturning = true;
        creep.memory.remoteHaulerLastPickupWasDropped = undefined;
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = ttl < REMOTE_HAULER_POST_TRIP_RENEW_START_TTL ? true : undefined;
        creep.memory.remoteHaulerIdleUntil = undefined;
        clearRemoteHaulerWanderMemory(creep);
        assignRemoteHaulerDelivery(creep, homeRoom);
        return true;
    }

    creep.memory.remoteHaulerReturning = undefined;
    if (creep.memory.remoteHaulerRenewAfterTrip) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, true);
        if ((creep.ticksToLive ?? 0) > REMOTE_HAULER_RENEW_STOP_TTL) {
            creep.memory.remoteHaulerRenewAfterTrip = undefined;
            creep.memory.remoteRenewing = false;
        }
        if (renewing) { return true; }
        if (creep.memory.remoteHaulerRenewAfterTrip) {
            setTravelJob(creep, homeRoom);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        const source = findRemoteEnergySource(creep, remotePlan);
        if (source) {
            creep.memory.remoteHaulerIdleUntil = undefined;
            clearRemoteHaulerWanderMemory(creep);
            setJob(creep, source.jobType, source.target);
            return true;
        }

        creep.memory.remoteHaulerIdleUntil = Game.time + REMOTE_HAULER_IDLE_RECHECK_TICKS;
        clearRemoteHaulerWanderMemory(creep);
        setTravelJob(creep, homeRoom);
        return true;
    }

    if (creep.memory.remoteHaulerIdleUntil && Game.time < creep.memory.remoteHaulerIdleUntil) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, ttl <= REMOTE_HAULER_RENEW_START_TTL);
        if (renewing) { return true; }
        return assignRemoteHaulerHomeIdle(creep, homeRoom);
    }

    if (creep.memory.remoteRenewing) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, false);
        if (renewing) { return true; }
    }

    creep.memory.remoteHaulerIdleUntil = undefined;
    creep.memory.remoteHaulerLastPickupWasDropped = undefined;
    clearRemoteHaulerWanderMemory(creep);
    setTravelJob(creep, remoteRoom);
    return true;
}

function manageRemoteHaulerRenewal(creep: Creep, homeRoomName: string, forceRenew: boolean): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    const alreadyRenewing = creep.memory.remoteRenewing === true;

    const homeRoom = Game.rooms[homeRoomName];
    if (!alreadyRenewing && homeRoom && shouldDeferRemoteHaulerRenewal(homeRoom, ttl)) {
        // Home room still needs energy: defer starting a new renew cycle so haulers
        // resume hauling/refill work. Once started, finish the cycle to avoid
        // one-tick renew bounces at the spawn.
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.memory.remoteRenewing && (forceRenew || ttl <= REMOTE_HAULER_RENEW_START_TTL)) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl > REMOTE_HAULER_RENEW_STOP_TTL) {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = acquireRenewSpawn(creep, homeRoom);
    if (!spawn) {
        const waitTarget = nearestSpawn(creep, homeRoom);
        if (waitTarget) {
            if (!creep.pos.isNearTo(waitTarget)) {
                creep.moveTo(waitTarget, { visualizePathStyle: { stroke: '#f5f57a' } });
            }
            setJob(creep, 'idle', waitTarget);
            return true;
        }
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#f5f57a' } });
        setJob(creep, 'idle', spawn);
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        setJob(creep, 'idle', spawn);
        return true;
    }

    creep.memory.remoteRenewing = false;
    return false;
}

function shouldDeferRemoteHaulerRenewal(homeRoom: Room, ttl: number): boolean {
    if (ttl <= REMOTE_HAULER_RENEW_CRITICAL_TTL) { return false; }
    if (homeRoom.memory.energyRecoveryActive === true) { return true; }
    return homeRoom.energyAvailable < homeRoom.energyCapacityAvailable;
}

function assignRemoteHaulerHomeIdle(creep: Creep, homeRoomName: string): boolean {
    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = closest(creep, homeRoom.find(FIND_MY_SPAWNS));
    if (!spawn) {
        setJob(creep, 'idle', homeRoom.storage ?? homeRoom.controller);
        return true;
    }

    const target = remoteHaulerWanderTarget(creep, spawn);
    if (!creep.pos.inRangeTo(target, 1)) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#7dd3fc' } });
    }
    setTravelJob(creep, homeRoomName);
    return true;
}

function remoteHaulerWanderTarget(creep: Creep, spawn: StructureSpawn): RoomPosition {
    if (creep.memory.remoteHaulerWanderX != null &&
        creep.memory.remoteHaulerWanderY != null &&
        creep.memory.remoteHaulerWanderUntil &&
        creep.memory.remoteHaulerWanderUntil > Game.time) {
        const current = new RoomPosition(
            creep.memory.remoteHaulerWanderX,
            creep.memory.remoteHaulerWanderY,
            spawn.room.name
        );
        if (current.getRangeTo(spawn.pos) >= REMOTE_HAULER_WANDER_MIN_RANGE) { return current; }
    }

    const terrain = spawn.room.getTerrain();
    const radiusSpread = REMOTE_HAULER_WANDER_MAX_RANGE - REMOTE_HAULER_WANDER_MIN_RANGE + 1;
    const seed = hashString(creep.name) + Game.time;

    for (let i = 0; i < 24; i++) {
        const radius = REMOTE_HAULER_WANDER_MIN_RANGE + ((seed + i) % radiusSpread);
        const angle = ((seed * 31 + i * 67) % 360) * (Math.PI / 180);
        const x = clampRoomCoord(Math.round(spawn.pos.x + Math.cos(angle) * radius));
        const y = clampRoomCoord(Math.round(spawn.pos.y + Math.sin(angle) * radius));
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

        const candidate = new RoomPosition(x, y, spawn.room.name);
        if (candidate.getRangeTo(spawn.pos) < REMOTE_HAULER_WANDER_MIN_RANGE) { continue; }
        const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART);
        if (blocked) { continue; }

        creep.memory.remoteHaulerWanderX = x;
        creep.memory.remoteHaulerWanderY = y;
        creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
        return candidate;
    }

    const fallback = new RoomPosition(
        clampRoomCoord(spawn.pos.x + REMOTE_HAULER_WANDER_MIN_RANGE),
        clampRoomCoord(spawn.pos.y),
        spawn.room.name
    );
    creep.memory.remoteHaulerWanderX = fallback.x;
    creep.memory.remoteHaulerWanderY = fallback.y;
    creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
    return fallback;
}

function clearRemoteHaulerWanderMemory(creep: Creep): void {
    creep.memory.remoteHaulerWanderX = undefined;
    creep.memory.remoteHaulerWanderY = undefined;
    creep.memory.remoteHaulerWanderUntil = undefined;
}

function clampRoomCoord(value: number): number {
    return Math.max(1, Math.min(48, value));
}

function assignRemoteHaulerDelivery(creep: Creep, homeRoom: string): void {
    if (creep.room.name !== homeRoom) {
        setTravelJob(creep, homeRoom);
        return;
    }

    const structures = getRoomStructures(creep.room);
    const resource = firstStoredResource(creep.store);

    if (resource === RESOURCE_ENERGY) {
        const refillTarget = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (refillTarget) {
            setJob(creep, 'refillSpawn', refillTarget);
            return;
        }

        const towerTarget = closest(creep, structures.towers
            .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO));
        if (towerTarget) {
            setJob(creep, 'refillTower', towerTarget);
            return;
        }
    }

    const storage = structures.storage;
    if (storage && resource && storage.store.getFreeCapacity(resource) > 0) {
        if (resource === RESOURCE_ENERGY) {
            setJob(creep, 'depositEnergy', storage);
        } else {
            setResourceJob(creep, 'depositResource', storage, resource);
        }
        return;
    }

    if (structures.terminal && resource && structures.terminal.store.getFreeCapacity(resource) > 0) {
        setResourceJob(creep, 'depositResource', structures.terminal, resource);
        return;
    }

    if (resource === RESOURCE_ENERGY) {
        const emergencySink = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (emergencySink) {
            setJob(creep, 'depositEnergy', emergencySink);
            return;
        }
    }

    setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
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

function initialiseRoomPlan(room: Room): void {
    if (!room.memory.plan) {
        room.memory.plan = {};
    }
    if (!room.memory.plan.remoteRooms) {
        room.memory.plan.remoteRooms = {};
    }
    if (!room.memory.plan.claimTargets) {
        room.memory.plan.claimTargets = [];
    }
}

function updateRemoteRoomPlans(homeRoom: Room): void {
    const remotes = homeRoom.memory.plan?.remoteRooms ?? {};
    const myUsername = homeRoom.controller?.owner?.username;
    for (const remoteName in remotes) {
        const remote = remotes[remoteName];
        if (!remote.enabled) { continue; }
        if (remote.reserve === undefined) { remote.reserve = true; }
        if (remote.buildRoads === undefined) { remote.buildRoads = true; }
        if (remote.maintainRoads === undefined) { remote.maintainRoads = true; }
        if (remote.debugPaths === undefined) { remote.debugPaths = false; }
        if (remote.mode !== 'harvest') { continue; }

        const visible = Game.rooms[remoteName];
        if (!visible) { continue; }

        remote.lastScouted = Game.time;
        const hostiles = findHostiles(visible);
        const hostileCore = visible.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_INVADER_CORE
        });
        const hostileControl = Boolean(visible.controller?.owner && visible.controller.owner.username !== myUsername) ||
            Boolean(visible.controller?.reservation && visible.controller.reservation.username !== myUsername);
        if (hostiles.length > 0 || hostileCore.length > 0 || hostileControl) {
            remote.lastSeenHostiles = Game.time;
            remote.dangerUntil = Game.time + REMOTE_DANGER_TICKS;
            remote.skipReason = 'danger';
            continue;
        }
        const hadAutoDanger = remote.skipReason === 'danger';
        remote.skipReason = undefined;
        if (hadAutoDanger) {
            remote.dangerUntil = undefined;
        }

        if (!remote.sources) { remote.sources = {}; }
        let roadsPlaced = 0;
        let unfinishedRoadSites = visible.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === STRUCTURE_ROAD
        }).length;
        const remoteEntries = remoteEntryPositions(homeRoom, remoteName);
        for (const source of visible.find(FIND_SOURCES)) {
            const existing = remote.sources[source.id] ?? (remote.sources[source.id] = { sourceId: source.id });
            existing.lastSeen = Game.time;
            const containerFrozen = existing.containerClearedAt !== undefined
                && Game.time - existing.containerClearedAt < REMOTE_CONTAINER_REROUTE_FREEZE_TICKS;
            const container = containerFrozen ? undefined : closestByRange(source, visible.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE
            }) as StructureContainer[]);
            const containerSite = (container || containerFrozen) ? null : closestByRange(source, visible.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: (site) => site.structureType === STRUCTURE_CONTAINER &&
                    site.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE
            }) as ConstructionSite[]);
            const blockedApproach = (existing.blockedApproachX != null && existing.blockedApproachRoom != null && existing.blockedApproachRoom === remoteName)
                ? new RoomPosition(existing.blockedApproachX, existing.blockedApproachY ?? 0, existing.blockedApproachRoom)
                : undefined;
            const station = container?.pos ?? containerSite?.pos ?? findStationForSource(visible, source, remoteEntries, blockedApproach);
            if (station) {
                existing.stationX = station.x;
                existing.stationY = station.y;
            } else {
                existing.stationX = undefined;
                existing.stationY = undefined;
                existing.routeAccessible = false;
                const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                existing.pathUpdatedAt = Game.time - retryOffset;
            }
            if (!containerFrozen) {
                existing.containerId = container?.id;
            }
            if (containerSite) {
                existing.containerSiteId = containerSite.id;
            } else {
                existing.containerSiteId = undefined;
            }
            existing.workDemand = sourceWorkDemand(source);
            const anchor = homeRoom.storage ?? homeRoom.find(FIND_MY_SPAWNS)[0];
            let latestPath: RoomPosition[] = [];
            const pathRetryInterval = existing.routeAccessible === false
                ? REMOTE_INACCESSIBLE_RETRY_TICKS
                : REMOTE_PATH_REFRESH_INTERVAL;
            const pathStale = !existing.pathUpdatedAt || Game.time - existing.pathUpdatedAt > pathRetryInterval;
            const cachedPath = deserializeRemotePath(existing.pathSerialized);
            const hasCachedPath = cachedPath.length > 0;
            if (anchor && station && (!existing.pathDistance || !hasCachedPath || pathStale || existing.routeAccessible === undefined)) {
                const route = PathFinder.search(anchor.pos, { pos: station, range: 0 }, { maxRooms: 8 });
                if (!route.incomplete) {
                    // Simulate the miner's local entry route into the remote room. A complete
                    // cross-room path is not enough if the selected exit enters a separated pocket.
                    const localRoute = bestRemoteEntryRoute(remoteEntries, station, blockedApproach);
                    const locallyReachable = !!localRoute && !localRoute.incomplete;
                    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log('room.controller: local path check ' + homeRoom.name + '->' + remoteName +
                            ' src=' + source.id +
                            ' len=' + (localRoute ? localRoute.path.length : -1) +
                            (!localRoute || localRoute.incomplete ? ' incomplete' : ''));
                    }
                    if (locallyReachable) {
                        existing.routeAccessible = true;
                        existing.stationFailures = 0;
                        existing.blockedApproachX = undefined;
                        existing.blockedApproachY = undefined;
                        existing.blockedApproachRoom = undefined;
                        existing.containerClearedAt = undefined;
                        latestPath = route.path;
                        existing.pathDistance = route.path.length;
                        existing.pathSerialized = serializeRemotePath(route.path);
                        existing.pathUpdatedAt = Game.time;
                    } else {
                        existing.routeAccessible = false;
                        existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, remoteName, route.path.length);
                        const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                        existing.pathUpdatedAt = Game.time - retryOffset;
                        latestPath = hasCachedPath ? cachedPath : [];
                        if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                            console.log(
                                'room.controller: station not locally reachable ' + homeRoom.name + '->' + remoteName +
                                ' source=' + source.id
                            );
                        }
                    }
                } else {
                    existing.routeAccessible = false;
                    existing.pathDistance = fallbackRemotePathDistance(homeRoom.name, remoteName, route.path.length);
                    const retryOffset = Math.max(0, REMOTE_PATH_REFRESH_INTERVAL - REMOTE_PATH_INCOMPLETE_RETRY_TICKS);
                    existing.pathUpdatedAt = Game.time - retryOffset;
                    latestPath = hasCachedPath ? cachedPath : [];
                    if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log(
                            'room.controller: incomplete remote path ' + homeRoom.name + '->' + remoteName +
                            ' source=' + source.id +
                            ' partial=' + route.path.length +
                            ' fallback=' + existing.pathDistance
                        );
                    }
                }
            } else if (!pathStale) {
                latestPath = cachedPath;
            }
            const distance = Math.max(1, existing.pathDistance ?? 25);
            const income = source.energyCapacity / ENERGY_REGEN_TIME;
            existing.haulerCapacityDemand = Math.min(MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE, Math.ceil(income * distance * 2 * 1.2));

            if (station && !container && canPlaceContainerSite(station)) {
                const code = station.createConstructionSite(STRUCTURE_CONTAINER);
                if (code !== OK && code !== ERR_FULL && Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                    console.log('room.controller: failed to place remote container in ' + visible.name + ' at ' + station.x + ',' + station.y + ' code=' + code);
                }
            }
            if (remote.buildRoads && latestPath.length > 0 && roadsPlaced < REMOTE_ROAD_SITES_PER_TICK) {
                const roadSiteLimit = remoteSourceRouteDegraded(existing)
                    ? REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES
                    : REMOTE_MAX_UNFINISHED_ROAD_SITES;
                if (unfinishedRoadSites < roadSiteLimit) {
                    const placed = placeRemoteRoadSites(
                        homeRoom,
                        visible,
                        existing,
                        latestPath,
                        myUsername,
                        roadSiteLimit,
                        REMOTE_ROAD_SITES_PER_TICK - roadsPlaced,
                        unfinishedRoadSites
                    );
                    roadsPlaced += placed;
                    unfinishedRoadSites += placed;
                }
            }
        }
    }
}

function placeRemoteRoadSites(
    homeRoom: Room,
    visibleRemote: Room,
    sourcePlan: RemoteSourcePlan,
    latestPath: RoomPosition[],
    myUsername: string | undefined,
    siteLimit: number,
    maxToPlace: number,
    unfinishedRoadSites: number
): number {
    let placed = 0;
    const steps = prioritizedRemoteRoadSteps(sourcePlan, latestPath);
    for (const step of steps) {
        if (placed >= maxToPlace || unfinishedRoadSites + placed >= siteLimit) { break; }
        if (!canPlaceRemoteRoadSite(homeRoom, visibleRemote, step, myUsername)) { continue; }

        const code = step.createConstructionSite(STRUCTURE_ROAD);
        if (code === OK) {
            placed++;
            sourcePlan.lastRoadPlanAt = Game.time;
            advanceRemoteRoadCursor(sourcePlan, latestPath, step);
        } else if (code === ERR_FULL) {
            break;
        } else if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
            console.log('room.controller: failed to place remote road in ' + step.roomName + ' at ' + step.x + ',' + step.y + ' code=' + code);
        }
    }
    return placed;
}

function prioritizedRemoteRoadSteps(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[]): RoomPosition[] {
    const steps: RoomPosition[] = [];
    const addUnique = (pos: RoomPosition | undefined): void => {
        if (!pos) { return; }
        if (steps.some((step) => sameRoomPosition(step, pos))) { return; }
        steps.push(pos);
    };

    for (const step of latestPath) {
        if (isRemoteExitApproach(step)) { addUnique(step); }
    }
    for (const step of latestPath) {
        if (isSwampPathStep(step)) { addUnique(step); }
    }
    if (sourcePlan.lastStallX !== undefined &&
        sourcePlan.lastStallY !== undefined &&
        sourcePlan.lastStallRoom) {
        addUnique(new RoomPosition(sourcePlan.lastStallX, sourcePlan.lastStallY, sourcePlan.lastStallRoom));
    }

    const start = Math.max(0, sourcePlan.roadCursor ?? 0) % Math.max(1, latestPath.length);
    for (let offset = 0; offset < latestPath.length; offset++) {
        addUnique(latestPath[(start + offset) % latestPath.length]);
    }

    return steps;
}

function canPlaceRemoteRoadSite(
    homeRoom: Room,
    visibleRemote: Room,
    pos: RoomPosition,
    myUsername: string | undefined
): boolean {
    if (pos.x <= 0 || pos.y <= 0 || pos.x >= 49 || pos.y >= 49) { return false; }
    if (pos.roomName !== visibleRemote.name && pos.roomName !== homeRoom.name) { return false; }
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    if (isOwnedByMe(room, myUsername)) { return false; }
    if (room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL) { return false; }

    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (structures.some((s) => s.structureType === STRUCTURE_ROAD)) { return false; }
    if (structures.some((s) => s.structureType !== STRUCTURE_RAMPART)) { return false; }
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    return true;
}

function advanceRemoteRoadCursor(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[], placed: RoomPosition): void {
    const index = latestPath.findIndex((step) => sameRoomPosition(step, placed));
    if (index < 0) { return; }
    sourcePlan.roadCursor = (index + 1) % latestPath.length;
}

function sameRoomPosition(a: RoomPosition, b: RoomPosition): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function isRemoteExitApproach(pos: RoomPosition): boolean {
    return pos.x <= 2 || pos.y <= 2 || pos.x >= 47 || pos.y >= 47;
}

function isSwampPathStep(pos: RoomPosition): boolean {
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    return room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP;
}

function remoteSourceRouteDegraded(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return sourcePlan?.routeHealth === 'degraded';
}

function isOwnedByMe(room: Room, myUsername?: string): boolean {
    if (!myUsername) { return false; }
    return room.controller?.owner?.username === myUsername;
}

function serializeRemotePath(path: RoomPosition[]): string {
    return JSON.stringify(path.map((step) => [step.x, step.y, step.roomName]));
}

function deserializeRemotePath(serialized?: string): RoomPosition[] {
    if (!serialized) { return []; }
    try {
        const raw = JSON.parse(serialized) as Array<[number, number, string]>;
        return raw
            .filter((step) => Array.isArray(step) && typeof step[0] === 'number' && typeof step[1] === 'number' && typeof step[2] === 'string')
            .map((step) => new RoomPosition(step[0], step[1], step[2]));
    } catch {
        return [];
    }
}

function fallbackRemotePathDistance(homeRoomName: string, remoteRoomName: string, partialPathLength: number): number {
    try {
        const linearDistance = Math.max(1, Game.map.getRoomLinearDistance(homeRoomName, remoteRoomName));
        return Math.max(partialPathLength, linearDistance * 50, 25);
    } catch {
        return Math.max(partialPathLength, 25);
    }
}

function shouldBuildRemoteInfrastructure(
    creep: Creep,
    archetype: CreepArchetype,
    remotePlan: RemoteRoomPlan
): boolean {
    if (remotePlan.buildRoads === false) { return false; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) { return false; }
    if (creep.getActiveBodyparts(WORK) <= 0) { return false; }
    if (creep.getActiveBodyparts(CARRY) <= 0) { return false; }
    if (archetype === 'remoteMiner' && isRemoteMinerSittingOnContainer(creep)) { return false; }

    if (archetype === 'remoteMaintainer') { return true; }
    if (archetype === 'remoteMiner') { return true; }
    return false;
}

function isRemoteMinerSittingOnContainer(creep: Creep): boolean {
    const stationaryTargetId = creep.memory.stationaryTargetId;
    if (stationaryTargetId) {
        const station = Game.getObjectById(stationaryTargetId as Id<StructureContainer>);
        if (station && station.structureType === STRUCTURE_CONTAINER && creep.pos.isEqualTo(station.pos)) {
            return true;
        }
    }

    return creep.pos.lookFor(LOOK_STRUCTURES).some((structure) => structure.structureType === STRUCTURE_CONTAINER);
}

function manageRemoteRenewal(
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    if (archetype === 'remoteMiner' || archetype === 'remoteMaintainer') {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (capabilities.claim > 0) { return false; } // CLAIM creeps are short-lived and not renewable.

    const oneWayDistance = estimateRemoteDistance(creep, homeRoomName, remoteRoomName, remotePlan);
    const renewStartTtl = Math.max(REMOTE_RENEW_MIN_TTL, oneWayDistance + REMOTE_RENEW_BUFFER_TICKS);
    const renewStopTtl = Math.min(1500, renewStartTtl + REMOTE_RENEW_HYSTERESIS);

    if (!creep.memory.remoteRenewing && ttl <= renewStartTtl) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl >= renewStopTtl) {
        creep.memory.remoteRenewing = false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = acquireRenewSpawn(creep, homeRoom);
    if (!spawn) {
        const waitTarget = nearestSpawn(creep, homeRoom);
        if (waitTarget) {
            if (!creep.pos.isNearTo(waitTarget)) {
                creep.moveTo(waitTarget, { visualizePathStyle: { stroke: '#f5f57a' } });
            }
            setJob(creep, 'idle', waitTarget);
            return true;
        }
        creep.memory.remoteRenewing = false;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#f5f57a' } });
        setJob(creep, 'idle', spawn);
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        setJob(creep, 'idle', spawn);
        return true;
    }

    // If renew is impossible (e.g. boosting restrictions or edge-case code),
    // release the renew lock so the creep can keep working instead of stalling.
    creep.memory.remoteRenewing = false;
    return false;
}

function estimateRemoteDistance(
    creep: Creep,
    homeRoomName: string,
    remoteRoomName: string,
    remotePlan: RemoteRoomPlan
): number {
    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (assignedSourceId) {
        const sourcePlan = remotePlan.sources?.[assignedSourceId];
        if (sourcePlan?.pathDistance && sourcePlan.pathDistance > 0) {
            return sourcePlan.pathDistance;
        }
    }

    if (remotePlan.sources) {
        let best = Infinity;
        for (const sourceId in remotePlan.sources) {
            const pathDistance = remotePlan.sources[sourceId]?.pathDistance;
            if (!pathDistance || pathDistance <= 0) { continue; }
            best = Math.min(best, pathDistance);
        }
        if (best < Infinity) { return best; }
    }

    try {
        return Math.max(25, Game.map.getRoomLinearDistance(homeRoomName, remoteRoomName) * 50);
    } catch {
        return 25;
    }
}

function closestRemoteInfrastructureSite(creep: Creep, allowLongRange: boolean): ConstructionSite | null {
    const candidates = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    });
    if (candidates.length === 0) { return null; }

    const nearby = candidates.filter((site) => creep.pos.getRangeTo(site) <= REMOTE_AUX_BUILD_RANGE);
    if (nearby.length === 0 && !allowLongRange) { return null; }

    const pool = nearby.length > 0 ? nearby : candidates;
    const byPath = creep.pos.findClosestByPath(pool, { ignoreCreeps: true }) as ConstructionSite | null;
    if (byPath) { return byPath; }
    return closest(creep, pool);
}

function countOpenTilesAround(terrain: RoomTerrain, x: number, y: number): number {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) { continue; }
            if (terrain.get(nx, ny) !== TERRAIN_MASK_WALL) { count++; }
        }
    }
    return count;
}

function remoteEntryPositions(homeRoom: Room, remoteRoomName: string): RoomPosition[] {
    const exitDirFromHome = Game.map.findExit(homeRoom.name, remoteRoomName);
    if (typeof exitDirFromHome !== 'number' || exitDirFromHome <= 0) { return []; }

    const entries: RoomPosition[] = [];
    for (const homeExit of homeRoom.find(exitDirFromHome as ExitConstant) as RoomPosition[]) {
        const mirrored = mirrorExitPositionIntoRoom(homeExit, remoteRoomName);
        if (mirrored) { entries.push(mirrored); }
    }
    return entries;
}

function mirrorExitPositionIntoRoom(exit: RoomPosition, roomName: string): RoomPosition | null {
    if (exit.x === 0) { return new RoomPosition(49, exit.y, roomName); }
    if (exit.x === 49) { return new RoomPosition(0, exit.y, roomName); }
    if (exit.y === 0) { return new RoomPosition(exit.x, 49, roomName); }
    if (exit.y === 49) { return new RoomPosition(exit.x, 0, roomName); }
    return null;
}

function bestRemoteEntryRoute(entries: RoomPosition[], station: RoomPosition, blockedPos?: RoomPosition): PathFinderPath | null {
    if (entries.length === 0) { return null; }
    const opts: PathFinderOpts = { maxRooms: 1 };
    if (blockedPos && blockedPos.roomName === station.roomName) {
        opts.roomCallback = (roomName) => {
            if (roomName !== station.roomName) { return false; }
            const matrix = new PathFinder.CostMatrix();
            matrix.set(blockedPos.x, blockedPos.y, 255);
            return matrix;
        };
    }
    return PathFinder.search(station, entries.map(pos => ({ pos, range: 0 })), opts);
}

function findStationForSource(room: Room, source: Source, entries: RoomPosition[] = [], blockedPos?: RoomPosition): RoomPosition | null {
    const terrain = room.getTerrain();
    const around = room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
    let best: RoomPosition | null = null;
    let bestScore = -1;
    for (const tile of around) {
        if (tile.x === source.pos.x && tile.y === source.pos.y) { continue; }
        const pos = new RoomPosition(tile.x, tile.y, room.name);
        if (!isRemoteStationTileUsable(pos, tile.terrain)) { continue; }
        const route = entries.length > 0 ? bestRemoteEntryRoute(entries, pos, blockedPos) : null;
        if (entries.length > 0 && (!route || route.incomplete)) { continue; }
        const pathCost = route?.path.length ?? 0;
        const score = countOpenTilesAround(terrain, tile.x, tile.y) * 100 - pathCost;
        if (score > bestScore) {
            bestScore = score;
            best = pos;
        }
    }
    return best;
}

function isRemoteStationTileUsable(pos: RoomPosition, terrain: string): boolean {
    if (terrain === 'wall') { return false; }
    if (pos.lookFor(LOOK_SOURCES).length > 0 || pos.lookFor(LOOK_MINERALS).length > 0) { return false; }
    const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_CONTAINER &&
        structure.structureType !== STRUCTURE_RAMPART);
    if (blocked) { return false; }
    return !pos.lookFor(LOOK_CONSTRUCTION_SITES).some((site) =>
        site.structureType !== STRUCTURE_ROAD &&
        site.structureType !== STRUCTURE_CONTAINER);
}

function canPlaceContainerSite(position: RoomPosition): boolean {
    if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    const blockingStructure = position.lookFor(LOOK_STRUCTURES).some((s) =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_RAMPART);
    return !blockingStructure;
}

function rememberPlans(context: RoomControllerContext): void {
    if (!context.room.memory.plan) { return; }

    context.room.memory.plan.sources = {};
    for (const plan of context.sourcePlans) {
        context.room.memory.plan.sources[plan.source.id] = {
            sourceId: plan.source.id,
            containerId: plan.container?.id,
            linkId: plan.link?.id,
            requiredWork: plan.requiredWork,
            assignedWork: plan.assignedWork,
            staticMining: plan.staticMining
        };
    }

    if (context.mineralPlan) {
        context.room.memory.plan.mineral = {
            mineralId: context.mineralPlan.mineral.id,
            extractorId: context.mineralPlan.extractor?.id,
            containerId: context.mineralPlan.container?.id,
            linkId: context.mineralPlan.link?.id,
            requiredWork: context.mineralPlan.requiredWork,
            assignedWork: context.mineralPlan.assignedWork,
            staticMining: context.mineralPlan.staticMining
        };
    } else {
        context.room.memory.plan.mineral = undefined;
    }
}

function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
    }
}

function updatePlanAssignments(context: RoomControllerContext): void {
    for (const sourcePlan of context.sourcePlans) {
        sourcePlan.assignedWork = assignedSourceWork(context.creeps, sourcePlan.source.id);
    }

    if (context.mineralPlan) {
        let assigned = 0;
        for (const creep of context.creeps) {
            if (creep.spawning) { continue; }
            if (creep.memory.assignedMineralId !== context.mineralPlan.mineral.id) { continue; }
            if (ensureArchetype(creep) !== 'mineralMiner') { continue; }
            assigned += getCreepCapabilities(creep).harvest;
        }
        context.mineralPlan.assignedWork = assigned;
    }
}

function rememberLoad(context: RoomControllerContext): void {
    const capacities = measureCapabilities(context.creeps);
    const spawnEnergyDeficit = sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
    const towerEnergyDeficit = sumFreeEnergy(context.structures.towers.filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO));
    const mineralReady = mineralReadyToMine(context);
    const salvageResources = totalStoredTargets(context.tombstones) +
        totalStoredTargets(context.ruins) +
        context.droppedResources.reduce((total, resource) => total + resource.amount, 0);

    context.room.memory.load = {
        updatedAt: Game.time,
        rcl: context.room.controller?.level ?? 0,
        energyAvailable: context.room.energyAvailable,
        energyCapacity: context.room.energyCapacityAvailable,
        storedEnergy: storedEnergy(context),
        sourceCount: context.sources.length,
        minerWork: capacities.minerWork,
        minerWorkDemand: totalSourcePlanWorkDemand(context.sourcePlans),
        haulerCapacity: capacities.haulerCapacity,
        haulerCapacityDemand: desiredHaulerCapacity(context).demand,
        workerWork: capacities.workerWork,
        workerWorkDemand: desiredWorkerWork(context),
        spawnEnergyDeficit,
        towerEnergyDeficit,
        constructionSites: context.constructionSites.length,
        repairTargets: context.repairTargets.length,
        mineralReady,
        salvageResources,
        mineralMinerWork: capacities.mineralMinerWork,
        mineralMinerWorkDemand: mineralReady && context.mineralPlan ? context.mineralPlan.requiredWork : 0
    };
}

function runLinks(context: RoomControllerContext): void {
    const receivers = linkReceivers(context);
    if (receivers.length === 0) { return; }

    const senders = uniqueLinks([
        ...context.structures.links.source,
        ...context.structures.links.hub.filter((link) => spawnEnergyPressure(context) === 0),
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
                        p.container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) ||
                    context.structures.links.source.some(l =>
                        creep.pos.getRangeTo(l) <= 3 &&
                        l.store.getUsedCapacity(RESOURCE_ENERGY) > 0))) {
            // Hauler at a source site with free capacity — fall through to drain the container/link
            // before leaving, so the trip isn't wasted on a partial load.
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

    if (capabilities.repair > 0 && context.repairTargets.length > 0 && shouldRepairWithCreeps(context)) {
        const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
        if (repairTarget) {
            reserveRepairProgress(reservations, repairTarget, capabilities.repair);
            rememberPrimaryJob(creep, 'repair', repairTarget);
            setJob(creep, 'repair', repairTarget);
            return;
        }
    }

    if (capabilities.upgrade > 0 && context.room.controller) {
        reservations.upgraderWork += capabilities.upgrade;
        rememberPrimaryJob(creep, 'upgrade', context.room.controller);
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    const sink = energyDepositTarget(context, creep, reservations);
    setJob(creep, 'depositEnergy', sink);
}

function minCarryForHauler(rcl: number): number {
    if (rcl >= 7) return 6;
    if (rcl >= 4) return 4;
    return 2;
}

function minWorkForWorker(rcl: number): number {
    if (rcl >= 7) return 3;
    if (rcl >= 4) return 2;
    return 1;
}

function minWorkForMiner(rcl: number): number {
    if (rcl >= 7) return 4;
    if (rcl >= 4) return 3;
    return 1;
}

function meetsMinimumBody(body: BodyPartConstant[], archetype: CreepArchetype, rcl: number, fleetCount: number): boolean {
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

function runSpawnPlanner(context: RoomControllerContext): void {
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

function pendingSpawnRequest(request: SpawnRequest, plannedBody?: BodyPartConstant[]): PendingSpawnRequest {
    const pending: PendingSpawnRequest = {
        ...request
    };
    if (plannedBody) {
        pending.plannedBody = plannedBody;
    }
    return pending;
}

function renewalDemandCreepsForRoom(roomName: string): Creep[] {
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

function addPendingCapabilities(
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

function pendingArchetypeCount(pending: PendingSpawnRequest[], archetype: CreepArchetype): number {
    let count = 0;
    for (const request of pending) {
        if (request.archetype === archetype) { count++; }
    }
    return count;
}

function pendingRemoteArchetypeCount(
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

function pendingRemoteBodyCapability(
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

function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 3) { return 1; }
    const remainingWork = context.constructionSites.reduce(
        (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 4 && remainingWork > 30000) { return 3; }
    if (remainingWork > 10000) { return 2; }
    return 1;
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

function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: ReturnType<typeof measureCapabilities>,
    pending: PendingSpawnRequest[] = []
): SpawnRequest | null {
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

function creepsForHomeRoom(homeRoomName: string): Creep[] {
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

function countActiveRemoteMinersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        count++;
    }
    return count;
}

function countRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { count++; }
    }
    return count;
}

function countSourceLessRemoteStandbyMiners(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if (creep.memory.assignedSourceId || creep.memory.sourceId) { continue; }
        count++;
    }
    return count;
}

function hasRemoteStandbyMinerForSource(creeps: Creep[], remoteRoom: string, sourceId: string, excludeCreepId?: string): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (!creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        return true;
    }
    return false;
}

function sourceNeedingBlankStandbyMiner(
    creeps: Creep[],
    remoteRoom: string,
    remotePlan: RemoteRoomPlan,
    excludeCreepId?: string
): string | null {
    if (!remotePlan.sources) { return null; }

    let bestSourceId: string | null = null;
    let bestDemand = -Infinity;
    for (const sourceId in remotePlan.sources) {
        const sourcePlan = remotePlan.sources[sourceId];
        if (sourcePlan.routeAccessible === false) { continue; }
        if (hasRemoteStandbyMinerForSource(creeps, remoteRoom, sourceId, excludeCreepId)) { continue; }
        if (countRemoteMinersForSource(creeps, remoteRoom, sourceId) > 0) { continue; }
        if (projectedRemoteMinerWork(creeps, remoteRoom, sourceId, 0) > 0) { continue; }

        const demand = sourcePlan.workDemand ?? 0;
        if (!bestSourceId || demand > bestDemand) {
            bestSourceId = sourceId;
            bestDemand = demand;
        }
    }

    return bestSourceId;
}

function findDyingRemoteMiner(
    creeps: Creep[],
    remoteRoom: string
): Creep | null {
    let best: Creep | null = null;
    let lowestTtl = Infinity;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if (!(creep.memory.assignedSourceId ?? creep.memory.sourceId)) { continue; }
        const ttl = creep.ticksToLive;
        if (!ttl || ttl > REMOTE_STANDBY_TRIGGER_TTL) { continue; }
        if (ttl < lowestTtl) {
            best = creep;
            lowestTtl = ttl;
        }
    }
    return best;
}

function hasActiveRemoteMinerForSource(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    excludeCreepId?: string
): boolean {
    for (const creep of creeps) {
        if (creep.id === excludeCreepId) { continue; }
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if ((creep.ticksToLive ?? 0) <= 0) { continue; }
        return true;
    }
    return false;
}

function sourceNeedingStandbyReplacement(
    creeps: Creep[],
    remoteRoom: string
): string | null {
    const anyStandby = creeps.some((creep) =>
        ensureArchetype(creep) === 'remoteMiner' &&
        creep.memory.remoteRoom === remoteRoom &&
        creep.memory.remoteStandby);
    if (anyStandby) { return null; }

    const dyingMiner = findDyingRemoteMiner(creeps, remoteRoom);
    if (!dyingMiner) { return null; }

    const sourceId = dyingMiner.memory.assignedSourceId ?? dyingMiner.memory.sourceId;
    return sourceId ?? null;
}

function countRemoteMinersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteStandby) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

function countRemoteHaulersForSource(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        count++;
    }
    return count;
}

function countRemoteHaulersForRoom(creeps: Creep[], remoteRoom: string): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        count++;
    }
    return count;
}

function remoteSourceMinerSlotCap(remotePlan: RemoteRoomPlan, source: Source): number {
    const sourceCfg = remotePlan.sources?.[source.id];
    if (sourceCfg && remoteSourceHasStaticStation(sourceCfg)) { return 1; }
    return Math.max(1, Math.min(2, remoteTargetAccessSlots(source.pos)));
}

function pickRemoteMinerSource(
    creep: Creep,
    sources: Source[],
    remotePlan: RemoteRoomPlan,
    minerCountBySource: Map<string, number>
): Source | null {
    let bestSource: Source | null = null;
    let bestLoad = Infinity;
    let bestRange = Infinity;
    for (const source of sources) {
        const sourcePlan = remotePlan.sources?.[source.id];
        if (sourcePlan?.routeAccessible === false) { continue; }
        const cap = remoteSourceMinerSlotCap(remotePlan, source);
        const count = minerCountBySource.get(source.id) ?? 0;
        if (count >= cap) { continue; }
        const load = count / cap;
        const range = creep.pos.getRangeTo(source);
        if (!bestSource || load < bestLoad || (load === bestLoad && range < bestRange)) {
            bestSource = source;
            bestLoad = load;
            bestRange = range;
        }
    }
    return bestSource;
}

function countFleetForArchetype(creeps: Creep[], archetype: CreepArchetype): number {
    let count = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) === archetype) { count++; }
    }
    return count;
}

function countRemoteScouts(homeRoomName: string, remoteRoom: string): number {
    return remoteScoutPack(homeRoomName, remoteRoom).length;
}

function hasAssignedNonScoutRemoteCreep(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        if (archetype === 'remoteScout') { continue; }
        if (archetype !== 'remoteMiner' &&
            archetype !== 'remoteHauler' &&
            archetype !== 'remoteMaintainer' &&
            archetype !== 'claimer') {
            continue;
        }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        return true;
    }
    return false;
}

function remoteScoutPack(homeRoomName: string, remoteRoom: string): string[] {
    const names: string[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (ensureArchetype(creep) !== 'remoteScout') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.homeRoom && creep.memory.homeRoom !== homeRoomName) { continue; }
        names.push(creep.name);
    }
    names.sort();
    return names;
}

function remoteRoomCrowdedForScout(creep: Creep, homeRoomName: string, remoteRoom: string): boolean {
    const visibleRemote = Game.rooms[remoteRoom];
    if (!visibleRemote) { return false; }

    let others = 0;
    const roomCreeps = visibleRemote.find(FIND_MY_CREEPS);
    for (const other of roomCreeps) {
        if (other.id === creep.id) { continue; }
        if (other.memory.homeRoom && other.memory.homeRoom !== homeRoomName) { continue; }
        others++;
        if (others >= REMOTE_SCOUT_CROWD_THRESHOLD) { return true; }
    }
    return false;
}

function assignOverflowRemoteScout(
    creep: Creep,
    homeRoomName: string,
    wanderFallbackRoom: string = homeRoomName
): boolean {
    const hostiles = findHostiles(creep.room);
    if (hostiles.length > 0) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const wanderExpired = !creep.memory.scoutWanderUntil || creep.memory.scoutWanderUntil <= Game.time;
    const reachedWanderRoom = creep.memory.scoutWanderRoom === creep.room.name;
    if (!creep.memory.scoutWanderRoom || wanderExpired || reachedWanderRoom) {
        creep.memory.scoutWanderRoom = chooseWanderRoom(creep, wanderFallbackRoom);
        creep.memory.scoutWanderUntil = Game.time + REMOTE_SCOUT_WANDER_TICKS;
    }

    const targetRoom = creep.memory.scoutWanderRoom ?? wanderFallbackRoom;
    if (creep.room.name !== targetRoom) {
        setTravelJob(creep, targetRoom);
        return true;
    }

    const targetPos = wanderPointInRoom(creep, targetRoom);
    if (!creep.pos.inRangeTo(targetPos, 3)) {
        creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#9ec8ff' } });
    }
    clearJob(creep);
    return true;
}

function chooseWanderRoom(creep: Creep, fallbackRoom: string): string {
    const exits = Game.map.describeExits(creep.room.name);
    const rooms: string[] = [];
    if (exits) {
        for (const key in exits) {
            const roomName = exits[key as unknown as keyof typeof exits];
            if (roomName) { rooms.push(roomName); }
        }
    }
    if (rooms.length === 0) { return fallbackRoom; }
    const seed = hashString(creep.name) + Game.time;
    return rooms[Math.abs(seed) % rooms.length];
}

function wanderPointInRoom(creep: Creep, roomName: string): RoomPosition {
    const visibleRoom = Game.rooms[roomName];
    if (visibleRoom) {
        const terrain = visibleRoom.getTerrain();
        for (let i = 0; i < 12; i++) {
            const seedA = hashString(creep.name + ':x:' + i);
            const seedB = hashString(creep.name + ':y:' + i);
            const x = 3 + (Math.abs(seedA) % 44);
            const y = 3 + (Math.abs(seedB) % 44);
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
            const pos = new RoomPosition(x, y, roomName);
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            return pos;
        }
    }

    const seedA = hashString(creep.name + ':x:fallback');
    const seedB = hashString(creep.name + ':y:fallback');
    const x = 10 + (Math.abs(seedA) % 31);
    const y = 10 + (Math.abs(seedB) % 31);
    return new RoomPosition(x, y, roomName);
}

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function remoteClaimerCount(creeps: Creep[], remoteRoom: string, mode: RemoteRoomMode, minClaimParts: number = 1): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'claimer') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (creep.memory.remoteMode !== mode) { continue; }
        if (getCreepCapabilities(creep).claim < minClaimParts) { continue; }
        count++;
    }
    return count;
}

function assignedRemoteMinerWork(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).harvest;
    }
    return total;
}

function assignedRemoteHaulerCapacity(creeps: Creep[], remoteRoom: string, sourceId: string): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        total += getCreepCapabilities(creep).haul;
    }
    return total;
}

function projectedRemoteMinerWork(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.harvest;
    }
    return total;
}

function projectedRemoteHaulerCapacity(
    creeps: Creep[],
    remoteRoom: string,
    sourceId: string,
    horizonTicks: number
): number {
    let total = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (!creep.memory.remoteRenewing && !creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        const caps = creep.spawning
            ? getBodyCapabilities(creep.body.map(p => p.type))
            : getCreepCapabilities(creep);
        total += caps.haul;
    }
    return total;
}

function remoteSourceReplacementHorizon(
    context: RoomControllerContext,
    sourcePlan: RemoteSourcePlan,
    archetype: 'remoteMiner' | 'remoteHauler'
): number {
    const oneWayDistance = Math.max(1, sourcePlan.pathDistance ?? 25);
    const spawnBody = archetype === 'remoteMiner'
        ? planBodyForArchetype('remoteMiner', context.room.energyCapacityAvailable, {
            staticMining: true,
            hasContainer: remoteSourceHasContainerStation(sourcePlan)
        })
        : planBodyForArchetype('remoteHauler', context.room.energyCapacityAvailable);
    const spawnTime = Math.max(1, spawnBody.length * CREEP_SPAWN_TIME);
    return oneWayDistance + spawnTime + REMOTE_REPLACEMENT_BUFFER_TICKS;
}

function remoteSourceHasContainerStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return !!sourcePlan?.containerId || !!sourcePlan?.containerSiteId;
}

function remoteSourceHasStaticStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return remoteSourceHasContainerStation(sourcePlan) ||
        (sourcePlan?.stationX != null && sourcePlan?.stationY != null);
}

function remoteSourceActiveMinerLimit(sourcePlan: RemoteSourcePlan): number {
    if (remoteSourceHasStaticStation(sourcePlan)) { return 1; }
    return 2;
}

function hasRemoteMaintainer(creeps: Creep[], remoteRoom: string): boolean {
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if (ensureArchetype(creep) !== 'remoteMaintainer') { continue; }
        if (creep.memory.remoteRoom === remoteRoom) { return true; }
    }
    return false;
}

function remoteNeedsMaintainer(remoteRoom: string): boolean {
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) { return true; }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

function remoteNeedsRouteHealthMaintainer(remoteRoom: string, remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlanHasDegradedRoute(remotePlan)) { return false; }
    const room = Game.rooms[remoteRoom];
    if (!room) { return false; }
    if (room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    }).length > 0) {
        return true;
    }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
}

function remotePlanHasDegradedRoute(remotePlan: RemoteRoomPlan | undefined): boolean {
    if (!remotePlan?.sources) { return false; }
    for (const sourceId in remotePlan.sources) {
        if (remoteSourceRouteDegraded(remotePlan.sources[sourceId])) { return true; }
    }
    return false;
}

function hasIdleRemoteHauler(creeps: Creep[], remoteRoom: string, sourceId?: string): boolean {
    const room = Game.rooms[remoteRoom];
    let foundIdleHauler = false;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'remoteHauler') { continue; }
        if (creep.memory.remoteRoom !== remoteRoom) { continue; }
        if (sourceId && (creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (creep.store.getUsedCapacity() > 0) { continue; }
        if (room && creep.room.name === remoteRoom) { foundIdleHauler = true; break; }
        if (!room && creep.room.name === creep.memory.homeRoom && !creep.spawning) { foundIdleHauler = true; break; }
    }
    if (!foundIdleHauler) { return false; }
    if (room) {
        const containersWithEnergy = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containersWithEnergy.length > 0) { return true; }
    }
    return foundIdleHauler;
}

function bestRemoteSourceContainer(creep: Creep, remotePlan: RemoteRoomPlan): StructureContainer | null {
    if (!remotePlan.sources) { return null; }

    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    const avoidTargetId = remoteHaulerAvoidTargetId(creep);

    if (assignedSourceId) {
        const cfg = remotePlan.sources[assignedSourceId];
        if (cfg?.containerId) {
            const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
            if (container &&
                remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
                !shouldAvoidRemoteEnergyTarget(creep, container, avoidTargetId) &&
                isRemoteEnergyTargetReachable(creep, container)) {
                return container;
            }
        }
    }

    const candidates: StructureContainer[] = [];
    for (const sourceId in remotePlan.sources) {
        if (sourceId === assignedSourceId) { continue; }
        const cfg = remotePlan.sources[sourceId];
        if (!cfg.containerId) { continue; }
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (!container) { continue; }
        const energy = remoteEnergyAvailableAfterClaims(creep, container);
        if (energy > 0) { candidates.push(container); }
    }

    return pickRemoteEnergyTarget(creep, candidates, avoidTargetId);
}

type RemoteEnergySourceTarget = {
    jobType: 'withdrawEnergy' | 'pickupEnergy';
    target: RoomObject & { id: string };
    fromDropped: boolean;
};

function findRemoteEnergySource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    opts?: { followDroppedTopUp?: boolean; droppedFirst?: boolean; droppedMinAmount?: number }
): RemoteEnergySourceTarget | null {
    const avoidTargetId = remoteHaulerAvoidTargetId(creep);
    const sourceContainerIds = remoteSourceContainerIds(remotePlan);
    const droppedFirst = opts?.droppedFirst !== false;
    const droppedMinAmount = Math.max(1, opts?.droppedMinAmount ?? 1);
    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    const followDroppedTopUp = opts?.followDroppedTopUp === true;

    if (assignedSourceId && remotePlan.sources?.[assignedSourceId]) {
        const assignedTarget = bestRemoteEnergyTargetForSource(
            creep,
            remotePlan,
            assignedSourceId,
            avoidTargetId,
            droppedMinAmount,
            followDroppedTopUp
        );
        const assignedAvailable = remoteEnergyAvailableForSource(creep, remotePlan, assignedSourceId, droppedMinAmount);
        const assignedIsDry = assignedAvailable < REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY;

        if (assignedTarget && !assignedIsDry) {
            return assignedTarget;
        }

        if (assignedIsDry) {
            const overflowTarget = bestCrossSourceRemoteEnergyTarget(
                creep,
                remotePlan,
                assignedSourceId,
                avoidTargetId,
                REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY
            );
            if (overflowTarget) {
                return overflowTarget;
            }
        }

        if (assignedTarget) {
            return assignedTarget;
        }

        return null;
    }

    const droppedCandidates = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) =>
            resource.resourceType === RESOURCE_ENERGY &&
            resource.amount >= droppedMinAmount &&
            remoteEnergyAvailableAfterClaims(creep, resource as Resource<RESOURCE_ENERGY>) > 0
    }) as Resource<RESOURCE_ENERGY>[];
    const droppedEnergy = pickRemoteEnergyTarget(creep, droppedCandidates, avoidTargetId);

    if (!followDroppedTopUp && droppedFirst && droppedEnergy) {
        return { jobType: 'pickupEnergy', target: droppedEnergy, fromDropped: true };
    }

    if (followDroppedTopUp) {
        const sourceContainers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                sourceContainerIds[structure.id] === true &&
                remoteEnergyAvailableAfterClaims(creep, structure as StructureContainer) > 0
        }) as StructureContainer[];
        const sourceContainer = pickRemoteEnergyTarget(creep, sourceContainers, avoidTargetId);
        if (sourceContainer) {
            return { jobType: 'withdrawEnergy', target: sourceContainer, fromDropped: false };
        }
    }

    const bestContainer = bestRemoteSourceContainer(creep, remotePlan);
    if (bestContainer) {
        return { jobType: 'withdrawEnergy', target: bestContainer, fromDropped: false };
    }

    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) =>
            structure.structureType === STRUCTURE_CONTAINER &&
            remoteEnergyAvailableAfterClaims(creep, structure as StructureContainer) > 0
    }) as StructureContainer[];
    const container = pickRemoteEnergyTarget(creep, containers, avoidTargetId);
    if (container) {
        return { jobType: 'withdrawEnergy', target: container, fromDropped: false };
    }

    const links = creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_LINK &&
            remoteEnergyAvailableAfterClaims(creep, s as StructureLink) > 0
    }) as StructureLink[];
    const link = pickRemoteEnergyTarget(creep, links, avoidTargetId);
    if (link) {
        return { jobType: 'withdrawEnergy', target: link, fromDropped: false };
    }

    if (droppedEnergy) {
        return { jobType: 'pickupEnergy', target: droppedEnergy, fromDropped: true };
    }

    return null;
}

function bestRemoteEnergyTargetForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    avoidTargetId: string | undefined,
    droppedMinAmount: number,
    skipDroppedResources: boolean
): RemoteEnergySourceTarget | null {
    const targets = remoteEnergyTargetsForSource(creep, remotePlan, sourceId, droppedMinAmount, skipDroppedResources)
        .filter((candidate) => !shouldAvoidRemoteEnergyTarget(creep, candidate.target, avoidTargetId));

    return pickRemoteEnergySourceTarget(creep, targets);
}

function bestCrossSourceRemoteEnergyTarget(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    assignedSourceId: string,
    avoidTargetId: string | undefined,
    minEnergy: number
): RemoteEnergySourceTarget | null {
    const candidates: RemoteEnergySourceTarget[] = [];
    if (!remotePlan.sources) { return null; }

    for (const sourceId in remotePlan.sources) {
        if (sourceId === assignedSourceId) { continue; }
        for (const candidate of remoteEnergyTargetsForSource(creep, remotePlan, sourceId, minEnergy, false)) {
            if (remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>) < minEnergy) {
                continue;
            }
            if (shouldAvoidRemoteEnergyTarget(creep, candidate.target, avoidTargetId)) {
                continue;
            }
            candidates.push(candidate);
        }
    }

    return pickRemoteEnergySourceTarget(creep, candidates);
}

function remoteEnergyAvailableForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number
): number {
    return remoteEnergyTargetsForSource(creep, remotePlan, sourceId, droppedMinAmount, false)
        .reduce((total, candidate) =>
            total + remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>), 0);
}

function remoteEnergyTargetsForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number,
    skipDroppedResources: boolean
): RemoteEnergySourceTarget[] {
    const cfg = remotePlan.sources?.[sourceId];
    if (!cfg) { return []; }

    const targets: RemoteEnergySourceTarget[] = [];
    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container &&
            remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
            isRemoteEnergyTargetReachable(creep, container)) {
            targets.push({ jobType: 'withdrawEnergy', target: container, fromDropped: false });
        }
    }

    if (skipDroppedResources) {
        return targets;
    }

    const station = remoteSourceStationPosition(remotePlan, sourceId);
    if (!station || creep.room.name !== station.roomName) {
        return targets;
    }

    const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) =>
            resource.resourceType === RESOURCE_ENERGY &&
            resource.amount >= droppedMinAmount &&
            resource.pos.inRangeTo(station, 1) &&
            remoteEnergyAvailableAfterClaims(creep, resource as Resource<RESOURCE_ENERGY>) > 0
    }) as Resource<RESOURCE_ENERGY>[];

    for (const resource of dropped) {
        targets.push({ jobType: 'pickupEnergy', target: resource, fromDropped: true });
    }

    return targets;
}

function remoteSourceStationPosition(remotePlan: RemoteRoomPlan, sourceId: string): RoomPosition | null {
    const cfg = remotePlan.sources?.[sourceId];
    if (!cfg) { return null; }

    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container) { return container.pos; }
    }

    if (cfg.stationX !== undefined && cfg.stationY !== undefined) {
        return new RoomPosition(cfg.stationX, cfg.stationY, remotePlan.roomName);
    }

    const source = Game.getObjectById(sourceId as Id<Source>);
    return source?.pos ?? null;
}

function pickRemoteEnergySourceTarget(
    creep: Creep,
    targets: RemoteEnergySourceTarget[]
): RemoteEnergySourceTarget | null {
    if (targets.length === 0) { return null; }
    const target = pickRemoteEnergyTarget(creep, targets.map(candidate => candidate.target));
    return targets.find(candidate => candidate.target.id === target?.id) ?? null;
}

function remoteSourceContainerIds(remotePlan: RemoteRoomPlan): { [id: string]: true } {
    const ids: { [id: string]: true } = {};
    if (!remotePlan.sources) { return ids; }
    for (const sourceId in remotePlan.sources) {
        const containerId = remotePlan.sources[sourceId]?.containerId;
        if (!containerId) { continue; }
        ids[containerId] = true;
    }
    return ids;
}

function remoteEnergyTargetPathLength(
    creep: Creep,
    target: RoomObject & { id: string }
): number | null {
    if (creep.room.name !== target.pos.roomName) { return null; }

    if (creep.pos.isEqualTo(target.pos)) { return 0; }

    const strict = creep.pos.findPathTo(target, { ignoreCreeps: false, maxRooms: 1 });
    if (strict.length > 0) { return strict.length; }

    const soft = creep.pos.findPathTo(target, { ignoreCreeps: true, maxRooms: 1 });
    if (soft.length > 0) { return soft.length; }

    return null;
}

function remoteHaulerAvoidTargetId(creep: Creep): string | undefined {
    const jobType = creep.memory.jobType;
    if (jobType !== 'withdrawEnergy' && jobType !== 'pickupEnergy') { return undefined; }
    if ((creep.memory.travelStuckTicks ?? 0) < REMOTE_HAULER_RETARGET_STUCK_TICKS) { return undefined; }
    return creep.memory.jobTargetId;
}

function pickRemoteEnergyTarget<T extends RoomObject & { id: string }>(
    creep: Creep,
    targets: T[],
    avoidTargetId?: string
): T | null {
    if (targets.length === 0) { return null; }

    const preferred = targets.filter((target) =>
        !shouldAvoidRemoteEnergyTarget(creep, target, avoidTargetId));
    const nonAvoided = targets.filter((target) =>
        !avoidTargetId || target.id !== avoidTargetId);
    const pool = preferred.length > 0
        ? preferred
        : (nonAvoided.length > 0 ? nonAvoided : targets);

    const byPath = creep.pos.findClosestByPath(pool, { ignoreCreeps: false }) as T | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByPath(pool, { ignoreCreeps: true }) as T | null;
}

function shouldAvoidRemoteEnergyTarget(
    creep: Creep,
    target: RoomObject & { id: string },
    avoidTargetId?: string
): boolean {
    if (avoidTargetId && target.id === avoidTargetId) { return true; }

    const accessSlots = remoteTargetAccessSlots(target.pos);
    const claimCap = Math.max(1, Math.min(REMOTE_TARGET_MAX_HAULER_CLAIMS, accessSlots));
    return remoteEnergyClaimCountForTarget(creep, target.id) >= claimCap;
}

function isRemoteEnergyTargetReachable(
    creep: Creep,
    target: RoomObject & { id: string }
): boolean {
    if (creep.room.name !== target.pos.roomName) { return true; }

    const strict = creep.pos.findClosestByPath([target], { ignoreCreeps: false }) as RoomObject | null;
    if (strict) { return true; }
    const soft = creep.pos.findClosestByPath([target], { ignoreCreeps: true }) as RoomObject | null;
    return soft !== null;
}

function remoteTargetAccessSlots(pos: RoomPosition): number {
    const room = Game.rooms[pos.roomName];
    if (!room) { return 8; }

    const terrain = room.getTerrain();
    let slots = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const tile = new RoomPosition(x, y, pos.roomName);
            if (tile.lookFor(LOOK_SOURCES).length > 0 || tile.lookFor(LOOK_MINERALS).length > 0) { continue; }
            const blocked = tile.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }
            slots++;
        }
    }
    return Math.max(1, slots);
}

function remoteEnergyClaimCountForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let claims = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        claims++;
    }
    return claims;
}

function remoteEnergyAvailableAfterClaims(
    creep: Creep,
    target: StructureContainer | StructureLink | Resource<RESOURCE_ENERGY>
): number {
    const amount = 'amount' in target
        ? target.amount
        : target.store.getUsedCapacity(RESOURCE_ENERGY);
    return Math.max(0, amount - remoteEnergyClaimsForTarget(creep, target.id));
}

function remoteEnergyClaimsForTarget(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let reserved = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        reserved += other.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return reserved;
}

function measureCapabilities(creeps: Creep[]): {
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

function desiredHaulerCapacity(context: RoomControllerContext): { demand: number; maxCount: number } {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 10 ? 300 : 0;
    const rawDemand = context.sources.length * base + rclBonus + salvageBonus;

    const haulerBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const maxCarryPerHauler = Math.min(MAX_CARRY_CAPACITY, 2 * Math.floor(haulerBudget / 150) * CARRY_CAPACITY);
    const maxCount = Math.max(2, Math.ceil(rawDemand / Math.max(1, maxCarryPerHauler)) + 1);
    return { demand: Math.min(rawDemand, maxCarryPerHauler * maxCount), maxCount };
}

function desiredWorkerWork(context: RoomControllerContext): number {
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

function refillSpawnTargets(context: RoomControllerContext): EnergyStructure[] {
    return [...context.structures.spawns, ...context.structures.extensions]
        .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
}

function refillTowerTargets(context: RoomControllerContext): EnergyStructure[] {
    return context.structures.towers
        .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO);
}

function refillSpawnTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillSpawnTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

function refillTowerTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): EnergyStructure | null {
    return closest(creep, refillTowerTargets(context)
        .filter((target) => target.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[target.id] ?? 0)));
}

function refillTerminalTarget(
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

function keepCurrentJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    reservations: JobReservations
): boolean {
    const jobType = creep.memory.jobType;
    if (!jobType) { return false; }

    const capabilities = getCreepCapabilities(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();

    if (shouldInterruptForEmergencyEnergyDelivery(context, creep, archetype, jobType, reservations, capabilities)) {
        clearJob(creep);
        creep.memory.interruptReason = 'emergency-refill';
        return false;
    }

    if (totalUsed > energyUsed && jobType !== 'depositResource') {
        clearJob(creep);
        creep.memory.interruptReason = 'deposit-resource';
        return false;
    }

    if (capabilities.heal > 0 && context.injuredCreeps.length > 0) {
        const priorityHealTarget = bestHealTarget(creep, context.injuredCreeps);
        if (!priorityHealTarget) {
            clearJob(creep);
            creep.memory.interruptReason = 'heal';
            return false;
        }

        const currentHealTarget = jobType === 'heal'
            ? jobTarget<Creep>(creep)
            : null;
        const priorityIsEmergency = isEmergencyHealTarget(priorityHealTarget);
        const currentIsEmergency = Boolean(currentHealTarget && isEmergencyHealTarget(currentHealTarget));

        if (jobType !== 'heal') {
            clearJob(creep);
            creep.memory.interruptReason = 'heal';
            return false;
        }

        if (creep.memory.jobTargetId !== priorityHealTarget.id && (priorityIsEmergency || !currentIsEmergency)) {
            clearJob(creep);
            creep.memory.interruptReason = 'heal-priority';
            return false;
        }
    }

    if (jobType === 'build' || jobType === 'repair' || jobType === 'upgrade') {
        if (energyUsed === 0) {
            rememberActiveAsPrimary(creep);
            clearJob(creep);
            return false;
        }

        if (shouldInterruptForEnergyRefill(context, creep, archetype, reservations)) {
            rememberActiveAsPrimary(creep);
            clearJob(creep);
            creep.memory.interruptReason = 'refill';
            return false;
        }
    }

    if (!currentJobStillValid(context, creep, jobType, reservations, capabilities)) {
        clearJob(creep);
        return false;
    }

    if (jobType === 'harvestSource' && archetype === 'miner') {
        const sourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        if (sourceId) {
            const hasUncovered = context.sourcePlans.some(
                plan => (reservations.sourceMinerCount[plan.source.id] ?? 0) === 0
            );
            const currentCount = reservations.sourceMinerCount[sourceId] ?? 0;
            if (hasUncovered && currentCount > 1) {
                reservations.sourceMinerCount[sourceId] = currentCount - 1;
                reservations.sourceWork[sourceId] = Math.max(0,
                    (reservations.sourceWork[sourceId] ?? 0) - capabilities.harvest);
                creep.memory.sourceId = undefined;
                creep.memory.assignedSourceId = undefined;
                clearStaticMiningMemory(creep);
                clearJob(creep);
                creep.memory.interruptReason = 'source-redistribute';
                return false;
            }
        }
    }

    reserveCurrentJob(creep, jobType, reservations, capabilities);
    return true;
}

function currentJobStillValid(
    context: RoomControllerContext,
    creep: Creep,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): boolean {
    if (jobType === 'idle') { return true; }
    if (jobType === 'travelRoom') { return Boolean(creep.memory.jobRoomName); }

    const target = jobTarget<RoomObject & { id: string }>(creep);
    if (!target) { return false; }

    if (jobType === 'harvestSource') {
        const source = target as Source;
        if (capabilities.harvest <= 0 || source.energyCapacity <= 0) { return false; }

        const archetype = ensureArchetype(creep);
        const isDedicatedMiner =
            archetype === 'miner' ||
            archetype === 'remoteMiner' ||
            archetype === 'mineralMiner';
        if (isDedicatedMiner) { return true; }

        // Fallback harvest for non-miners should be temporary: once any energy is
        // loaded, re-run assignment so the creep spends or tops up via structured sources.
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { return false; }

        if (archetype === 'worker' &&
            capabilities.haul > 0 &&
            context.structures.storage &&
            context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            // Workers should use storage when available instead of direct source mining.
            return false;
        }

        return true;
    }
    if (jobType === 'mineMineral') {
        const mineral = target as Mineral;
        return capabilities.harvest > 0 && mineral.mineralAmount > 0 && mineralReadyToMine(context);
    }
    if (jobType === 'withdrawEnergy') {
        const storeTarget = target as StructureContainer | StructureStorage | StructureTerminal | StructureLink;
        const archetype = ensureArchetype(creep);
        const storage = context.structures.storage;
        if (archetype === 'worker' &&
            storage &&
            storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            storeTarget.id !== storage.id) {
            // Re-target workers to storage as the primary refill source when stocked.
            return false;
        }

        if (storeTarget.structureType === STRUCTURE_TERMINAL) {
            const available = terminalWithdrawableEnergy(context, reservations, roomNeedsCriticalEnergyRecovery(context));
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && available > 0;
        }

        const reserved = reservations.resources[storeTarget.id] ?? 0;
        const available = storeTarget.store.getUsedCapacity(RESOURCE_ENERGY) - reserved;
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0 || available <= 0) { return false; }
        if (archetype === 'hauler' &&
            isMiningSiteEnergyTarget(context, storeTarget)) {
            return available >= haulerMiningSiteMinPickup(creep);
        }
        // Check remaining available energy after accounting for other creeps' reservations
        return true;
    }
    if (jobType === 'withdrawResource') {
        const storeTarget = target as WithdrawStructure;
        const resource = creep.memory.jobResourceType ?? firstStoredResource(storeTarget.store);
        if (!resource || creep.store.getFreeCapacity() === 0) { return false; }
        const remaining = (storeTarget.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[storeTarget.id] ?? 0);
        if (remaining <= 0) { return false; }
        const archetype = ensureArchetype(creep);
        if ((archetype === 'hauler' || archetype === 'worker') &&
            resource !== RESOURCE_ENERGY &&
            target instanceof StructureContainer) {
            return remaining >= haulerMiningSiteMinPickup(creep);
        }
        return true;
    }
    if (jobType === 'pickupEnergy' || jobType === 'pickupResource') {
        const resource = target as Resource<ResourceConstant>;
        if (creep.store.getFreeCapacity() === 0 || resource.amount <= 0) { return false; }
        const remaining = resource.amount - (reservations.dropped[resource.id] ?? 0);
        return remaining > 0;
    }
    if (jobType === 'depositEnergy' || jobType === 'refillSpawn' || jobType === 'refillTower') {
        const energyTarget = target as EnergyStructure;
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            energyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.energySinks[energyTarget.id] ?? 0);
    }
    if (jobType === 'depositResource' || jobType === 'depositMineral') {
        const storeTarget = target as StructureStorage | StructureTerminal | StructureContainer;
        const resource = creep.memory.jobResourceType ?? firstStoredResource(creep.store);
        return Boolean(resource) && storeTarget.store.getFreeCapacity(resource as ResourceConstant) > 0;
    }
    if (jobType === 'build') {
        const site = target as ConstructionSite;
        return capabilities.build > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            site.progress < site.progressTotal &&
            remainingConstructionProgress(site, reservations) > 0;
    }
    if (jobType === 'repair') {
        const structure = target as AnyStructure;
        const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
        const repairRcl = creep.room.controller?.level ?? 0;
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax;
        return capabilities.repair > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            structure.hits < maxHits &&
            remainingRepairProgress(structure, reservations) > 0;
    }
    if (jobType === 'upgrade') {
        return capabilities.upgrade > 0 &&
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            target instanceof StructureController;
    }
    if (jobType === 'heal') {
        const targetCreep = target as Creep;
        return capabilities.heal > 0 && targetCreep.hits < targetCreep.hitsMax;
    }
    if (jobType === 'reserveController' || jobType === 'claimController') {
        return capabilities.reserve > 0 && target instanceof StructureController;
    }

    return true;
}

function shouldInterruptForEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }

    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) { return jobType !== 'refillSpawn'; }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) { return jobType !== 'refillTower'; }

    if (spawnTarget) { return jobType !== 'refillSpawn'; }

    return false;
}

function reserveCurrentJob(
    creep: Creep,
    jobType: CreepJobType,
    reservations: JobReservations,
    capabilities: ReturnType<typeof getCreepCapabilities>
): void {
    const target = jobTarget<RoomObject & { id: string }>(creep);
    if (!target) { return; }

    if (jobType === 'withdrawResource') {
        reserveResourceTarget(reservations, target.id, creep.store.getFreeCapacity());
    } else if (jobType === 'withdrawEnergy') {
        reserveResourceTarget(reservations, target.id, creep.store.getFreeCapacity(RESOURCE_ENERGY));
    } else if (jobType === 'pickupEnergy' || jobType === 'pickupResource') {
        reserveDroppedTarget(reservations, target.id, creep.store.getFreeCapacity());
    } else if (jobType === 'depositEnergy' || jobType === 'refillSpawn' || jobType === 'refillTower') {
        reserveEnergySink(reservations, target as EnergyStructure, creep.store.getUsedCapacity(RESOURCE_ENERGY));
    } else if (jobType === 'build') {
        reserveConstructionProgress(reservations, target as ConstructionSite, capabilities.build);
    } else if (jobType === 'repair') {
        reserveRepairProgress(reservations, target as AnyStructure, capabilities.repair);
    } else if (jobType === 'upgrade') {
        reservations.upgraderWork += capabilities.upgrade;
    }
}

function shouldInterruptForEnergyRefill(
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

function assignEmergencyEnergyDelivery(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
    if (!canEmergencyDeliverEnergy(context, creep, archetype, capabilities)) { return false; }

    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    const spawnFull = spawnEnergyRatio(context) >= TOWER_REFILL_SPAWN_YIELD_RATIO;
    if (spawnTarget && !spawnFull) {
        reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillSpawn', spawnTarget);
        return true;
    }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) {
        reserveEnergySink(reservations, towerTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), towerTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillTower', towerTarget);
        return true;
    }

    if (spawnTarget) {
        reserveEnergySink(reservations, spawnTarget, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), spawnTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
        setJob(creep, 'refillSpawn', spawnTarget);
        return true;
    }

    return false;
}

function canEmergencyDeliverEnergy(
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

function droppedResourceTarget(
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

function salvageWithdrawalTarget(context: RoomControllerContext, creep: Creep, reservations: JobReservations): ResourceTarget | null {
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

function mineralContainerWithdrawalTarget(
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

function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

function energyDepositTarget(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): StructureStorage | StructureTerminal | StructureContainer | null {
    if (context.structures.terminal &&
        context.structures.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        terminalEnergyReserveDeficit(context, reservations) > 0 &&
        !roomHasEnergyDemand(context)) {
        return context.structures.terminal;
    }

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

function energyWithdrawalTarget(
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
        // If already at a source site (e.g. picking up dropped energy), drain its container/link
        // before leaving — bypasses the min-pickup threshold since we're already there.
        const nearbySourceContainer = context.sourcePlans
            .map(p => p.container)
            .find(c => c &&
                creep.pos.getRangeTo(c) <= 3 &&
                (c.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[c.id] ?? 0)) > 0);
        if (nearbySourceContainer) { return nearbySourceContainer; }

        const nearbySourceLink = context.structures.links.source.find(l =>
            creep.pos.getRangeTo(l) <= 3 &&
            (l.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.resources[l.id] ?? 0)) > 0);
        if (nearbySourceLink) { return nearbySourceLink; }

        const demandLinks = [...context.structures.links.hub, ...context.structures.links.controller, ...context.structures.links.sink]
            .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        // Primary: drain hub/controller/sink links so they always have capacity for incoming transfers.
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

function linkReceivers(context: RoomControllerContext): StructureLink[] {
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

function uniqueLinks(links: StructureLink[]): StructureLink[] {
    const seen: { [id: string]: boolean } = {};
    const result: StructureLink[] = [];
    for (const link of links) {
        if (seen[link.id]) { continue; }
        seen[link.id] = true;
        result.push(link);
    }
    return result;
}

function spawnEnergyRatio(context: RoomControllerContext): number {
    let used = 0, total = 0;
    for (const s of [...context.structures.spawns, ...context.structures.extensions]) {
        used += s.store.getUsedCapacity(RESOURCE_ENERGY);
        total += s.store.getCapacity(RESOURCE_ENERGY);
    }
    return total > 0 ? used / total : 1;
}

function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
}

function terminalEnergyReserveTarget(rcl: number): number {
    if (rcl >= 8) { return TERMINAL_RESERVE_RCL8; }
    if (rcl >= 7) { return TERMINAL_RESERVE_RCL7; }
    if (rcl >= 6) { return TERMINAL_RESERVE_RCL6; }
    return 0;
}

function roomHasEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0 || refillTowerTargets(context).length > 0;
}

function roomHasSpawnEnergyDemand(context: RoomControllerContext): boolean {
    return spawnEnergyPressure(context) > 0;
}

function roomNeedsCriticalEnergyRecovery(context: RoomControllerContext): boolean {
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

function energyRecoveryReason(context: RoomControllerContext, active: boolean): EnergyRecoveryReason {
    if (!active) { return 'none'; }

    const spawnHeld = spawnEnergyRatio(context) < ENERGY_RECOVERY_EXIT_SPAWN_RATIO;
    const towerHeld = context.structures.towers.some((tower) => towerEnergyRatio(tower) < ENERGY_RECOVERY_EXIT_TOWER_RATIO);
    if (spawnHeld && towerHeld) { return 'spawn+tower'; }
    if (spawnHeld) { return 'spawn'; }
    if (towerHeld) { return 'tower'; }
    return 'hysteresis';
}

function terminalWithdrawableEnergy(
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

function terminalEnergyReserveDeficit(context: RoomControllerContext, reservations: JobReservations): number {
    const terminal = context.structures.terminal;
    if (!terminal) { return 0; }

    const reserveTarget = terminalEnergyReserveTarget(context.room.controller?.level ?? 0);
    if (reserveTarget <= 0) { return 0; }

    const incomingReserved = reservations.energySinks[terminal.id] ?? 0;
    const projectedEnergy = terminal.store.getUsedCapacity(RESOURCE_ENERGY) + incomingReserved;
    return Math.max(0, reserveTarget - projectedEnergy);
}

function buildSourcePlans(sources: Source[], structures: RoomStructureCache): SourcePlan[] {
    return sources.map((source) => {
        const container = closestByRange(source, structures.containers.filter((structure) => structure.pos.getRangeTo(source) <= 1));
        const link = closestByRange(source, structures.links.source.filter((structure) => structure.pos.getRangeTo(source) <= 2));
        return {
            source,
            container,
            link,
            requiredWork: sourceWorkDemand(source),
            assignedWork: 0,
            staticMining: container !== null && link === null
        };
    });
}

function buildMineralPlan(mineral: Mineral, structures: RoomStructureCache): MineralPlan {
    let container = closestByRange(mineral, structures.containers.filter((structure) => structure.pos.getRangeTo(mineral) <= 1));
    if (!container && mineral.room) {
        const allContainers = mineral.room.find(FIND_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
        container = closestByRange(mineral, allContainers.filter((c) => c.pos.getRangeTo(mineral) <= 1));
    }
    const link = closestByRange(mineral, [...structures.links.hub, ...structures.links.other].filter((structure) => structure.pos.getRangeTo(mineral) <= 2));
    return {
        mineral,
        extractor: structures.extractor,
        container,
        link,
        requiredWork: MINERAL_WORK_DEMAND,
        assignedWork: 0,
        staticMining: container !== null
    };
}

function totalSourcePlanWorkDemand(sourcePlans: SourcePlan[]): number {
    let demand = 0;
    for (const sourcePlan of sourcePlans) {
        demand += sourcePlan.requiredWork;
    }
    return demand;
}

function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

function sourceSpawnDeficit(context: RoomControllerContext, pendingSourceIds: Set<string> = new Set()): SourcePlan | null {
    for (const plan of context.sourcePlans) {
        if (pendingSourceIds.has(plan.source.id)) { continue; }
        const assignedMiners = assignedSourceMinerCount(context.creeps, plan.source.id);
        if (assignedMiners === 0) {
            return plan;
        }
    }
    return null;
}

function activeMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

function assignedSourceMinerCount(creeps: Creep[], sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        count++;
    }
    return count;
}

function assignedSourceWork(creeps: Creep[], sourceId: string): number {
    let work = 0;
    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        work += getCreepCapabilities(creep).harvest;
    }
    return work;
}

function assignedSourcePlan(
    creep: Creep,
    sourcePlans: SourcePlan[],
    reservations: JobReservations
): SourcePlan | null {
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

function reserveSourceWork(reservations: JobReservations, sourcePlan: SourcePlan, work: number): void {
    reservations.sourceWork[sourcePlan.source.id] = (reservations.sourceWork[sourcePlan.source.id] ?? 0) + work;
}

function reserveSourceIfNeeded(
    creep: Creep,
    reservations: JobReservations,
    sourcePlan: SourcePlan,
    work: number
): void {
    const alreadyAssigned = (creep.memory.assignedSourceId ?? creep.memory.sourceId) === sourcePlan.source.id;
    if (!alreadyAssigned) {
        reservations.sourceMinerCount[sourcePlan.source.id] = (reservations.sourceMinerCount[sourcePlan.source.id] ?? 0) + 1;
        reserveSourceWork(reservations, sourcePlan, work);
    }
}

function reserveResourceTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.resources[targetId] = (reservations.resources[targetId] ?? 0) + Math.max(0, amount);
}

function reserveDroppedTarget(reservations: JobReservations, targetId: string, amount: number): void {
    reservations.dropped[targetId] = (reservations.dropped[targetId] ?? 0) + Math.max(0, amount);
}

function reserveEnergySink(reservations: JobReservations, target: EnergyStructure, amount: number): void {
    const alreadyReserved = reservations.energySinks[target.id] ?? 0;
    const remainingCapacity = Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY) - alreadyReserved);
    const reserveAmount = Math.min(Math.max(0, amount), remainingCapacity);
    reservations.energySinks[target.id] = alreadyReserved + reserveAmount;
}

function resumePrimaryEnergyJob(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): boolean {
    const jobType = creep.memory.primaryJobType;
    const targetId = creep.memory.primaryTargetId;
    if (!jobType || !targetId) { return false; }
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') {
        clearPrimaryJob(creep);
        return false;
    }

    const target = Game.getObjectById(targetId as Id<any>) as (RoomObject & { id: string }) | null;
    if (!target) {
        clearPrimaryJob(creep);
        return false;
    }

    if (jobType === 'build') {
        const site = target as ConstructionSite;
        if (capabilities.build <= 0 || site.progress >= site.progressTotal || remainingConstructionProgress(site, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        reserveConstructionProgress(reservations, site, capabilities.build);
        setJob(creep, 'build', site);
        return true;
    }

    if (jobType === 'repair') {
        const structure = target as AnyStructure;
        const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
        const repairRcl = creep.room.controller?.level ?? 0;
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
        if (capabilities.repair <= 0 || structure.hits >= maxHits || remainingRepairProgress(structure, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        if (shouldRepairWithCreeps(context) && context.repairTargets.length > 0) {
            const primaryRemaining = remainingRepairProgress(structure, reservations);
            const best = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
            if (best && best.id !== structure.id && remainingRepairProgress(best, reservations) > primaryRemaining * 2) {
                clearPrimaryJob(creep);
                return false;
            }
        }
        reserveRepairProgress(reservations, structure, capabilities.repair);
        setJob(creep, 'repair', structure);
        return true;
    }

    if (!context.room.controller || target.id !== context.room.controller.id || capabilities.upgrade <= 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (!shouldReserveUpgrade(context, reservations) && context.constructionSites.length > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (Object.keys(reservations.constructionProgress).length === 0 && context.constructionSites.length > 0 && capabilities.build > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    reservations.upgraderWork += capabilities.upgrade;
    setJob(creep, 'upgrade', context.room.controller);
    return true;
}

function setStaticHarvestMemory(creep: Creep, sourcePlan: SourcePlan): void {
    creep.memory.sourceId = sourcePlan.source.id;
    creep.memory.assignedSourceId = sourcePlan.source.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForSource(sourcePlan);
    creep.memory.staticMining = sourcePlan.staticMining;
}

function setStaticMineralMemory(creep: Creep, mineralPlan: MineralPlan): void {
    creep.memory.assignedMineralId = mineralPlan.mineral.id;
    creep.memory.stationaryTargetId = stationaryTargetIdForMineral(mineralPlan);
    creep.memory.staticMining = mineralPlan.staticMining;
}

function clearStaticMiningMemory(creep: Creep): void {
    creep.memory.stationaryTargetId = undefined;
    creep.memory.staticMining = undefined;
}

function stationaryTargetIdForSource(sourcePlan: SourcePlan): string {
    return sourcePlan.container?.id ?? sourcePlan.source.id;
}

function stationaryTargetIdForMineral(mineralPlan: MineralPlan): string {
    return mineralPlan.container?.id ?? mineralPlan.mineral.id;
}

function closestSourcePlan(creep: Creep, sourcePlans: SourcePlan[]): SourcePlan | null {
    let best: SourcePlan | null = null;
    let bestRange = Infinity;
    for (const plan of sourcePlans) {
        const range = creep.pos.getRangeTo(plan.source);
        if (range < bestRange) {
            best = plan;
            bestRange = range;
        }
    }
    return best;
}

function bestConstructionSite(
    creep: Creep,
    sites: ConstructionSite[],
    reservations: JobReservations,
    workParts: number
): ConstructionSite | null {
    let best: ConstructionSite | null = null;
    let bestPriority = Infinity;
    let bestRange = Infinity;
    let bestRemaining = 0;

    for (const site of sites) {
        const remaining = remainingConstructionProgress(site, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const priority = constructionPriority(site);
        const range = creep.pos.getRangeTo(site);
        if (!best ||
            priority < bestPriority ||
            (priority === bestPriority && remaining > bestRemaining) ||
            (priority === bestPriority && remaining === bestRemaining && range < bestRange)) {
            best = site;
            bestPriority = priority;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

function repairTargetFor(
    creep: Creep,
    targets: AnyStructure[],
    reservations: JobReservations,
    workParts: number
): AnyStructure | null {
    let best: AnyStructure | null = null;
    let bestRange = Infinity;
    let bestRemaining = 0;

    for (const target of targets) {
        const remaining = remainingRepairProgress(target, reservations);
        if (remaining <= 0 && workParts > 0) { continue; }
        const range = creep.pos.getRangeTo(target);
        if (!best || remaining > bestRemaining || (remaining === bestRemaining && range < bestRange)) {
            best = target;
            bestRange = range;
            bestRemaining = remaining;
        }
    }

    return best;
}

function remainingConstructionProgress(site: ConstructionSite, reservations: JobReservations): number {
    return site.progressTotal - site.progress - (reservations.constructionProgress[site.id] ?? 0);
}

function remainingRepairProgress(structure: AnyStructure, reservations: JobReservations): number {
    const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
    const repairRcl = structure.room.controller?.level ?? 0;
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
    const cappedRemaining = Math.max(0, maxHits - structure.hits);
    return cappedRemaining - (reservations.repairProgress[structure.id] ?? 0);
}

function reserveConstructionProgress(reservations: JobReservations, site: ConstructionSite, workParts: number): void {
    reservations.constructionProgress[site.id] = (reservations.constructionProgress[site.id] ?? 0) +
        workParts * BUILD_POWER * BUILD_RESERVATION_TICKS;
}

function reserveRepairProgress(reservations: JobReservations, structure: AnyStructure, workParts: number): void {
    reservations.repairProgress[structure.id] = (reservations.repairProgress[structure.id] ?? 0) +
        workParts * REPAIR_POWER * REPAIR_RESERVATION_TICKS;
}

function constructionPriority(site: ConstructionSite): number {
    if (site.structureType === STRUCTURE_TOWER) { return 1; }
    if (site.structureType === STRUCTURE_SPAWN) { return 2; }
    if (site.structureType === STRUCTURE_EXTENSION) { return 3; }
    if (site.structureType === STRUCTURE_STORAGE) { return 4; }
    if (site.structureType === STRUCTURE_LINK) { return 5; }
    if (site.structureType === STRUCTURE_TERMINAL) { return 6; }
    if (site.structureType === STRUCTURE_LAB) { return 7; }
    if (site.structureType === STRUCTURE_EXTRACTOR) { return 8; }
    if (site.structureType === STRUCTURE_CONTAINER) { return 9; }
    if (site.structureType === STRUCTURE_ROAD) { return 10; }
    if (site.structureType === STRUCTURE_RAMPART) { return 11; }
    if (site.structureType === STRUCTURE_WALL) { return 12; }
    return 20;
}

function shouldRepairWithCreeps(context: RoomControllerContext): boolean {
    if (context.constructionSites.length === 0) { return true; }
    if (!context.structures.storage) { return true; }
    return context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 5000;
}

function desiredUpgraderWork(rcl: number): number {
    if (rcl >= 8) { return 1; }
    if (rcl >= 7) { return 10; }
    if (rcl >= 5) { return 5; }
    return 2;
}

function shouldReserveUpgrade(context: RoomControllerContext, reservations: JobReservations): boolean {
    if (!context.room.controller) { return false; }

    const rcl = context.room.controller.level;
    if (rcl >= 8) {
        const downgradeTimer = context.room.controller.ticksToDowngrade;
        if (downgradeTimer > 100000) { return false; }
    }

    if (reservations.upgraderWork >= desiredUpgraderWork(rcl)) { return false; }
    if (context.room.energyAvailable === 0 && storedEnergy(context) === 0) { return false; }
    return true;
}

function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }
    return context.mineralPlan?.container != null;
}

function totalStoredTargets(targets: Array<Tombstone | Ruin>): number {
    let total = 0;
    for (const target of targets) {
        total += totalStoredResources(target.store);
    }
    return total;
}

function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }
    return total;
}

function firstStoredResource(store: StoreDefinition): ResourceConstant | null {
    let fallback: ResourceConstant | null = null;
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (store.getUsedCapacity(resource) <= 0) { continue; }
        if (resource !== RESOURCE_ENERGY) { return resource; }
        fallback = resource;
    }
    return fallback;
}

function firstStoredNonEnergyResource(store: StoreDefinition): ResourceConstant | null {
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (resource === RESOURCE_ENERGY) { continue; }
        if (store.getUsedCapacity(resource) > 0) { return resource; }
    }
    return null;
}

function haulerMiningSiteMinPickup(creep: Creep): number {
    return Math.max(1, Math.ceil(creep.store.getCapacity() * 0.5));
}

function isMiningSiteEnergyTarget(
    context: RoomControllerContext,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink
): boolean {
    if (target.structureType === STRUCTURE_LINK) {
        return context.structures.links.source.some((link) => link.id === target.id);
    }
    if (target.structureType !== STRUCTURE_CONTAINER) { return false; }
    if (context.mineralPlan?.container?.id === target.id) { return true; }
    return context.sourcePlans.some((sourcePlan) => sourcePlan.container?.id === target.id);
}

function storedEnergy(context: RoomControllerContext): number {
    const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    return storageEnergy + terminalEnergy;
}

function sumFreeEnergy(structures: EnergyStructure[]): number {
    let total = 0;
    for (const structure of structures) {
        total += structure.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return total;
}

function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}

function setJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null): void {
    if (!target) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType && creep.memory.jobTargetId === target.id) {
        creep.memory.jobRoomName = target.pos.roomName;
        creep.memory.jobResourceType = undefined;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setTravelJob(creep: Creep, roomName: string): void {
    if (creep.memory.jobType === 'travelRoom' && creep.memory.jobRoomName === roomName) { return; }
    creep.memory.jobType = 'travelRoom';
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setResourceJob(
    creep: Creep,
    jobType: CreepJobType,
    target: (RoomObject & { id: string }) | undefined | null,
    resource: ResourceConstant | null
): void {
    if (!target || !resource) {
        clearJob(creep);
        return;
    }

    if (creep.memory.jobType === jobType &&
        creep.memory.jobTargetId === target.id &&
        creep.memory.jobResourceType === resource) {
        creep.memory.jobRoomName = target.pos.roomName;
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = resource;
}

function closest<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }
    return best;
}

function closestReachable<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }
    return creep.pos.findClosestByPath(targets, { ignoreCreeps: false }) as T | null;
}

function bestHealTarget(creep: Creep, targets: Creep[]): Creep | null {
    if (targets.length === 0) { return null; }

    const emergencyTargets = targets.filter((target) => isEmergencyHealTarget(target));
    const pool = emergencyTargets.length > 0 ? emergencyTargets : targets;

    let best = pool[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of pool) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio ||
            (ratio === bestRatio && missing > bestMissing) ||
            (ratio === bestRatio && missing === bestMissing && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestMissing = missing;
            bestRange = range;
        }
    }
    return best;
}

function isEmergencyHealTarget(target: Creep): boolean {
    if (target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO) {
        return true;
    }
    return target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
        filter: isHostile
    }).length > 0;
}

function closestByRange<T extends RoomObject>(origin: RoomObject, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = origin.pos.getRangeTo(best);
    for (const target of targets) {
        const range = origin.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }
    return best;
}

function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}

function rememberActiveAsPrimary(creep: Creep): void {
    const jobType = creep.memory.jobType;
    const targetId = creep.memory.jobTargetId;
    if (!jobType || !targetId) { return; }
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') { return; }
    creep.memory.primaryJobType = jobType;
    creep.memory.primaryTargetId = targetId;
    creep.memory.primaryRoomName = creep.memory.jobRoomName;
    creep.memory.primaryResourceType = creep.memory.jobResourceType;
    creep.memory.primaryAssignedAt = creep.memory.primaryAssignedAt ?? creep.memory.jobAssignedAt ?? Game.time;
}

function rememberPrimaryJob(
    creep: Creep,
    jobType: CreepJobType,
    target: RoomObject & { id: string },
    resource?: ResourceConstant
): void {
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') { return; }
    if (creep.memory.primaryJobType === jobType && creep.memory.primaryTargetId === target.id) { return; }
    creep.memory.primaryJobType = jobType;
    creep.memory.primaryTargetId = target.id;
    creep.memory.primaryRoomName = target.pos.roomName;
    creep.memory.primaryResourceType = resource;
    creep.memory.primaryAssignedAt = Game.time;
}

function clearPrimaryJob(creep: Creep): void {
    creep.memory.primaryJobType = undefined;
    creep.memory.primaryTargetId = undefined;
    creep.memory.primaryRoomName = undefined;
    creep.memory.primaryResourceType = undefined;
    creep.memory.primaryAssignedAt = undefined;
}

function jobTarget<T extends RoomObject>(creep: Creep): T | null {
    const id = creep.memory.jobTargetId;
    if (!id) { return null; }
    return Game.getObjectById(id as Id<any>) as T | null;
}
