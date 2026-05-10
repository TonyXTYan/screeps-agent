import { bodyCost, ensureArchetype, getCreepCapabilities, planBodyForArchetype } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from './room.structures';
import { repairStructureFilter, wallRampartRepairCap } from './role.doctor';

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
    minerDuty?: 'active' | 'standby';
    mineralId?: string;
    stationaryTargetId?: string;
    staticMining?: boolean;
    hasContainer?: boolean;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    workRatio?: number;
    minClaimParts?: number;
    remoteStandby?: boolean;
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
const MINERAL_MINING_STORAGE_FLOOR = 3000;
const MINERAL_WORK_DEMAND = 5;
const LINK_TRANSFER_THRESHOLD = 400;
const BUILD_RESERVATION_TICKS = 10;
const REPAIR_RESERVATION_TICKS = 5;
const REMOTE_DANGER_TICKS = 50;
const REMOTE_PATH_REFRESH_INTERVAL = 5000;
const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
const REMOTE_ROAD_SITES_PER_TICK = 4;
const REMOTE_MAX_UNFINISHED_ROAD_SITES = 3;
const REMOTE_CONTAINER_BUILD_DISTANCE = 1;
const REMOTE_SCOUT_KEEP_COUNT = 2;
const REMOTE_SCOUT_WANDER_TICKS = 120;
const REMOTE_SCOUT_CROWD_THRESHOLD = 4;
const REMOTE_PLANNING_LOG_INTERVAL = 100;
const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const MINER_STANDBY_COUNT = 1;
const MINER_SWAP_TTL_THRESHOLD = 180;
const REMOTE_AUX_BUILD_RANGE = 8;
const REMOTE_RENEW_MIN_TTL = 220;
const REMOTE_RENEW_BUFFER_TICKS = 80;
const REMOTE_RENEW_HYSTERESIS = 140;
const REMOTE_REPLACEMENT_BUFFER_TICKS = 60;
const REMOTE_STANDBY_COUNT = 1;
const REMOTE_STANDBY_DISPATCH_TTL = 300;
const MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 500;

export function run(room: Room): void {
    const context = buildContext(room);

    initialiseRoomPlan(room);
    updateRemoteRoomPlans(room);
    rememberRcl(room);
    manageMinerStandby(context);
    updatePlanAssignments(context);
    rememberLoad(context);
    rememberPlans(context);
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

    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const capabilities = getCreepCapabilities(creep);
    if (manageRemoteRenewal(creep, archetype, capabilities, homeRoom, remoteRoom, remotePlan)) {
        return true;
    }

    if (archetype === 'remoteHauler' && energyUsed > 0) {
        if (creep.room.name === remoteRoom && capabilities.repair > 0) {
            const opportunisticRepair = closest(creep, creep.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax
            }) as AnyStructure[]);
            if (opportunisticRepair) {
                setJob(creep, 'repair', opportunisticRepair);
                return true;
            }
        }
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }

        const structures = getRoomStructures(creep.room);
        const sink = structures.storage ?? closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        setJob(creep, 'depositEnergy', sink);
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

        if (armedHostilesInRoom(creep.room).length > 0 && creep.room.name !== homeRoom) {
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

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const remoteBuildSite = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? closestRemoteInfrastructureSite(creep, archetype === 'remoteMaintainer')
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
        if (creep.memory.remoteStandby) {
            if (creep.room.name === homeRoom) {
                const homeFleet = creepsForHomeRoom(homeRoom);
                const dyingMiner = findDyingRemoteMiner(homeFleet, remoteRoom);
                if (dyingMiner) {
                    const dyingSourceId = dyingMiner.memory.assignedSourceId ?? dyingMiner.memory.sourceId;
                    if (dyingSourceId) {
                        const alreadyReplaced = homeFleet.some(
                            c => c.id !== dyingMiner.id &&
                                ensureArchetype(c) === 'remoteMiner' &&
                                c.memory.remoteRoom === remoteRoom &&
                                !c.memory.remoteStandby &&
                                (c.memory.assignedSourceId ?? c.memory.sourceId) === dyingSourceId
                        );
                        if (!alreadyReplaced) {
                            creep.memory.remoteStandby = undefined;
                            creep.memory.sourceId = dyingSourceId;
                            creep.memory.assignedSourceId = dyingSourceId;
                            setTravelJob(creep, remoteRoom);
                            return true;
                        }
                    }
                }
                setJob(creep, 'idle', Game.rooms[homeRoom]?.storage
                    ?? creep.pos.findClosestByRange(FIND_MY_SPAWNS));
                return true;
            }
            creep.memory.remoteStandby = undefined;
        }

        let assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;

        const sources = creep.room.find(FIND_SOURCES);
        const otherMinerSourceIds = new Set<string>();
        for (const other of creep.room.find(FIND_MY_CREEPS)) {
            if (other.id === creep.id) { continue; }
            if (ensureArchetype(other) !== 'remoteMiner') { continue; }
            const sid = other.memory.assignedSourceId ?? other.memory.sourceId;
            if (sid) { otherMinerSourceIds.add(sid); }
        }

        if (assignedSourceId && otherMinerSourceIds.has(assignedSourceId)) {
            const uncovered = sources.find(s => !otherMinerSourceIds.has(s.id));
            if (uncovered) {
                assignedSourceId = uncovered.id;
            }
        }

        let stationaryTargetId: string | undefined;
        if (assignedSourceId) {
            const sourceCfg = remotePlan.sources?.[assignedSourceId];
            if (sourceCfg?.containerId) {
                stationaryTargetId = sourceCfg.containerId;
                creep.memory.stationX = undefined;
                creep.memory.stationY = undefined;
            } else if (sourceCfg?.stationX != null && sourceCfg?.stationY != null) {
                stationaryTargetId = undefined;
                creep.memory.stationX = sourceCfg.stationX;
                creep.memory.stationY = sourceCfg.stationY;
            } else {
                stationaryTargetId = assignedSourceId;
                creep.memory.stationX = undefined;
                creep.memory.stationY = undefined;
            }
        }
        const source = assignedSourceId
            ? Game.getObjectById(assignedSourceId as Id<Source>) ?? closest(creep, sources)
            : closest(creep, sources);
        if (source) {
            creep.memory.sourceId = source.id;
            creep.memory.assignedSourceId = source.id;
            creep.memory.stationaryTargetId = stationaryTargetId ?? source.id;
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    if (archetype === 'remoteHauler') {
        const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
        if (assignedSourceId) {
            const sourceCfg = remotePlan.sources?.[assignedSourceId];
            if (sourceCfg?.containerId) {
                const sourceContainer = Game.getObjectById(sourceCfg.containerId as Id<StructureContainer>);
                if (sourceContainer && sourceContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    setJob(creep, 'withdrawEnergy', sourceContainer);
                    return true;
                }
            }
        }

        const droppedEnergy = closest(creep, creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
        }) as Resource<RESOURCE_ENERGY>[]);
        if (droppedEnergy) {
            setJob(creep, 'pickupEnergy', droppedEnergy);
            return true;
        }

        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                (structure as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        }) as StructureContainer[];
        const container = closest(creep, containers);
        if (container) {
            setJob(creep, 'withdrawEnergy', container);
            return true;
        }
    }

    if (archetype === 'remoteMaintainer') {
        const site = closest(creep, creep.room.find(FIND_CONSTRUCTION_SITES));
        if (site && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'build', site);
            return true;
        }
        const repair = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax
        }) as AnyStructure[]);
        if (repair && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'repair', repair);
            return true;
        }
        const source = closest(creep, creep.room.find(FIND_SOURCES));
        if (source && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            setJob(creep, 'harvestSource', source);
            return true;
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
        setJob(creep, 'depositEnergy', sink);
        return true;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && capabilities.harvest > 0) {
        const source = closest(creep, creep.room.find(FIND_SOURCES));
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    setTravelJob(creep, homeRoom);
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
        const hostiles = armedHostilesInRoom(visible);
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
        remote.skipReason = undefined;

        if (!remote.sources) { remote.sources = {}; }
        let roadsPlaced = 0;
        let unfinishedRoadSites = visible.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === STRUCTURE_ROAD
        }).length;
        for (const source of visible.find(FIND_SOURCES)) {
            const existing = remote.sources[source.id] ?? (remote.sources[source.id] = { sourceId: source.id });
            existing.lastSeen = Game.time;
            const station = findStationForSource(visible, source);
            if (station) {
                existing.stationX = station.x;
                existing.stationY = station.y;
            }
            const container = closestByRange(source, visible.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE
            }) as StructureContainer[]);
            existing.containerId = container?.id;
            existing.workDemand = sourceWorkDemand(source);
            const anchor = homeRoom.storage ?? homeRoom.find(FIND_MY_SPAWNS)[0];
            let latestPath: RoomPosition[] = [];
            const pathStale = !existing.pathUpdatedAt || Game.time - existing.pathUpdatedAt > REMOTE_PATH_REFRESH_INTERVAL;
            const cachedPath = deserializeRemotePath(existing.pathSerialized);
            const hasCachedPath = cachedPath.length > 0;
            if (anchor && station && (!existing.pathDistance || !hasCachedPath || pathStale)) {
                const route = PathFinder.search(anchor.pos, { pos: station, range: 1 }, { maxRooms: 8 });
                if (!route.incomplete) {
                    latestPath = route.path;
                    existing.pathDistance = route.path.length;
                    existing.pathSerialized = serializeRemotePath(route.path);
                    existing.pathUpdatedAt = Game.time;
                } else {
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
            if (remote.buildRoads &&
                latestPath.length > 0 &&
                roadsPlaced < REMOTE_ROAD_SITES_PER_TICK &&
                unfinishedRoadSites < REMOTE_MAX_UNFINISHED_ROAD_SITES) {
                for (const step of latestPath) {
                    if (roadsPlaced >= REMOTE_ROAD_SITES_PER_TICK || unfinishedRoadSites >= REMOTE_MAX_UNFINISHED_ROAD_SITES) { break; }
                    if (step.x <= 1 || step.y <= 1 || step.x >= 48 || step.y >= 48) { continue; }
                    if (step.roomName !== visible.name && step.roomName !== homeRoom.name) { continue; }
                    const room = Game.rooms[step.roomName];
                    if (!room) { continue; }
                    if (isOwnedByMe(room, myUsername)) { continue; }
                    const terrain = room.getTerrain();
                    if (terrain.get(step.x, step.y) === TERRAIN_MASK_WALL) { continue; }
                    const pos = new RoomPosition(step.x, step.y, step.roomName);
                    const blocked = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                        s.structureType !== STRUCTURE_ROAD &&
                        s.structureType !== STRUCTURE_CONTAINER &&
                        s.structureType !== STRUCTURE_RAMPART);
                    if (blocked) { continue; }
                    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { continue; }
                    const code = pos.createConstructionSite(STRUCTURE_ROAD);
                    if (code === OK) {
                        roadsPlaced++;
                        unfinishedRoadSites++;
                    } else if (code === ERR_FULL) {
                        break;
                    } else if (Game.time % REMOTE_PLANNING_LOG_INTERVAL === 0) {
                        console.log('room.controller: failed to place remote road in ' + step.roomName + ' at ' + step.x + ',' + step.y + ' code=' + code);
                    }
                }
            }
        }
    }
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

    if (archetype === 'remoteMaintainer') { return true; }
    if (archetype === 'remoteHauler' || archetype === 'remoteMiner') { return true; }
    return false;
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
    if (archetype === 'remoteMiner' || archetype === 'remoteHauler') {
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

    const spawn = closest(creep, homeRoom.find(FIND_MY_SPAWNS, {
        filter: (s) => !s.spawning
    }));
    if (!spawn) {
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

function findStationForSource(room: Room, source: Source): RoomPosition | null {
    const around = room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
    for (const tile of around) {
        if (tile.x === source.pos.x && tile.y === source.pos.y) { continue; }
        if (tile.terrain === 'wall') { continue; }
        return new RoomPosition(tile.x, tile.y, room.name);
    }
    return null;
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
        haulerCapacityDemand: desiredHaulerCapacity(context),
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

    const senders = [
        ...context.structures.links.source,
        ...context.structures.links.hub.filter((link) => spawnEnergyPressure(context) === 0),
        ...context.structures.links.other
    ];

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

function manageMinerStandby(context: RoomControllerContext): void {
    const miners = context.creeps.filter((creep) => ensureArchetype(creep) === 'miner');
    if (miners.length === 0) { return; }

    for (const miner of miners) {
        if (miner.memory.minerDuty !== 'standby') {
            miner.memory.minerDuty = 'active';
        }
    }

    if (context.sourcePlans.length === 0 || miners.length <= context.sourcePlans.length) {
        for (const miner of miners) {
            miner.memory.minerDuty = 'active';
        }
        return;
    }

    const anchor = context.structures.spawns[0];
    let standby = miners.find((creep) => isStandbyMiner(creep)) ?? null;
    if (!standby || standby.spawning) {
        standby = chooseStandbyMiner(miners, anchor);
    }
    if (!standby) { return; }

    for (const miner of miners) {
        miner.memory.minerDuty = miner.id === standby.id ? 'standby' : 'active';
    }

    const retiring = activeMinerNearDeath(miners, standby);
    if (!retiring) { return; }
    if (!standby.ticksToLive || !retiring.ticksToLive || standby.ticksToLive <= retiring.ticksToLive) { return; }

    const retiringSourceId = retiring.memory.assignedSourceId ?? retiring.memory.sourceId;
    if (!retiringSourceId) { return; }

    retiring.memory.minerDuty = 'standby';
    retiring.memory.sourceId = undefined;
    retiring.memory.assignedSourceId = undefined;
    clearStaticMiningMemory(retiring);

    standby.memory.minerDuty = 'active';
    standby.memory.sourceId = retiringSourceId;
    standby.memory.assignedSourceId = retiringSourceId;
    const sourcePlan = context.sourcePlans.find((plan) => plan.source.id === retiringSourceId);
    if (sourcePlan) {
        setStaticHarvestMemory(standby, sourcePlan);
    } else {
        clearStaticMiningMemory(standby);
    }
}

function chooseStandbyMiner(miners: Creep[], anchor: StructureSpawn | undefined): Creep | null {
    const candidates = miners.filter((creep) => !creep.spawning);
    if (candidates.length === 0) { return null; }

    const unassigned = candidates.filter((creep) => !(creep.memory.assignedSourceId ?? creep.memory.sourceId));
    const pool = unassigned.length > 0 ? unassigned : candidates;

    let best = pool[0];
    let bestTtl = best.ticksToLive ?? 0;
    let bestRange = anchor ? best.pos.getRangeTo(anchor) : 0;
    for (const candidate of pool) {
        const ttl = candidate.ticksToLive ?? 0;
        const range = anchor ? candidate.pos.getRangeTo(anchor) : 0;
        if (ttl > bestTtl || (ttl === bestTtl && range < bestRange)) {
            best = candidate;
            bestTtl = ttl;
            bestRange = range;
        }
    }
    return best;
}

function activeMinerNearDeath(miners: Creep[], standby: Creep): Creep | null {
    let retiring: Creep | null = null;
    let lowestTtl = Infinity;
    for (const miner of miners) {
        if (miner.id === standby.id) { continue; }
        if (miner.spawning || isStandbyMiner(miner)) { continue; }
        const ttl = miner.ticksToLive ?? 0;
        if (ttl > MINER_SWAP_TTL_THRESHOLD) { continue; }
        if (!(miner.memory.assignedSourceId ?? miner.memory.sourceId)) { continue; }
        if (ttl < lowestTtl) {
            retiring = miner;
            lowestTtl = ttl;
        }
    }
    return retiring;
}

function assignJob(context: RoomControllerContext, creep: Creep, reservations: JobReservations): void {
    const capabilities = getCreepCapabilities(creep);
    const archetype = ensureArchetype(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();
    const hasMinerals = totalUsed > energyUsed;

    if (hasMinerals) {
        const resourceSink = resourceDepositTarget(context);
        if (resourceSink) {
            setResourceJob(creep, 'depositResource', resourceSink, firstStoredResource(creep.store));
            return;
        }
    }

    if (archetype === 'miner' && isStandbyMiner(creep)) {
        creep.memory.sourceId = undefined;
        creep.memory.assignedSourceId = undefined;
        clearStaticMiningMemory(creep);
        setJob(creep, 'idle', context.structures.storage ?? context.room.controller ?? context.structures.spawns[0]);
        return;
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

    if (energyUsed > 0) {
        assignEnergySpendingJob(context, creep, archetype, capabilities, reservations);
        return;
    }

    if (capabilities.haul > 0) {
        const salvage = salvageWithdrawalTarget(context, creep, reservations);
        if (salvage) {
            reserveResourceTarget(reservations, salvage.target.id, Math.min(creep.store.getFreeCapacity(), salvage.amount));
            setResourceJob(creep, 'withdrawResource', salvage.target, salvage.resource);
            return;
        }

        const dropped = droppedResourceTarget(context, creep, reservations);
        if (dropped) {
            reserveDroppedTarget(reservations, dropped.id, Math.min(creep.store.getFreeCapacity(), dropped.amount));
            setResourceJob(creep, 'pickupResource', dropped, dropped.resourceType);
            return;
        }

        const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype);
        if (withdrawalTarget) {
            setJob(creep, 'withdrawEnergy', withdrawalTarget);
            return;
        }
    }

    if (capabilities.harvest > 0) {
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

function assignEnergySpendingJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>,
    reservations: JobReservations
): void {
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

    const resumed = resumePrimaryEnergyJob(context, creep, capabilities, reservations);
    if (resumed) { return; }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const sink = energyDepositTarget(context, creep);
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

    const sink = energyDepositTarget(context, creep);
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

function runSpawnPlanner(context: RoomControllerContext): void {
    const freeSpawns = context.structures.spawns.filter((s) => !s.spawning);
    if (freeSpawns.length === 0) { return; }

    const pending: SpawnRequest[] = [];
    const rcl = context.room.controller?.level ?? 0;

    for (const spawn of context.structures.spawns) {
        if (!spawn.spawning) continue;
        const memory = Memory.creeps[spawn.spawning.name];
        if (!memory || !memory.archetype) continue;
        pending.push({
            archetype: memory.archetype,
            sourceId: memory.sourceId ?? memory.assignedSourceId,
            minerDuty: memory.minerDuty,
            remoteRoom: memory.remoteRoom,
            remoteStandby: memory.remoteStandby,
            reason: 'currently spawning'
        });
    }

    let remainingEnergy = context.room.energyAvailable;

    for (const spawn of freeSpawns) {
        let spawned = false;
        while (!spawned) {
            const request = chooseSpawnRequest(context, pending);
            if (!request) { break; }

            const maxBudget = context.room.energyCapacityAvailable;
            const body = planBodyForArchetype(request.archetype, maxBudget, {
                staticMining: request.staticMining,
                hasContainer: request.hasContainer,
                workRatio: request.workRatio,
                minClaimParts: request.minClaimParts
            });

            if (body.length === 0) {
                if (Game.time % 25 === 0) {
                    console.log('room.controller: waiting for energy to spawn ' + request.archetype + ' for ' + request.reason);
                }
                pending.push(request);
                continue;
            }

            const cost = bodyCost(body);

            if (cost > remainingEnergy) {
                const affordableBody = planBodyForArchetype(request.archetype, remainingEnergy, {
                    staticMining: request.staticMining,
                    hasContainer: request.hasContainer,
                    workRatio: request.workRatio,
                    minClaimParts: request.minClaimParts
                });
                if (affordableBody.length > 0) {
                    const affordableCost = bodyCost(affordableBody);
                    const fleetCount = countFleetForArchetype(context.creeps, request.archetype);
                    if (meetsMinimumBody(affordableBody, request.archetype, rcl, fleetCount) && affordableCost <= remainingEnergy) {
                        const aName = request.archetype + '-' + spawn.name + '-' + Game.time + (pending.length > 0 ? '-' + pending.length : '');
                        const aRole = legacyRoleForArchetype(request.archetype);
                        const aCode = spawn.spawnCreep(affordableBody, aName, {
                            memory: {
                                archetype: request.archetype,
                                role: aRole,
                                sourceId: request.sourceId,
                                assignedSourceId: request.sourceId,
                                minerDuty: request.minerDuty,
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
                            pending.push(request);
                            remainingEnergy -= affordableCost;
                            spawned = true;
                        } else if (aCode !== ERR_BUSY && Game.time % 25 === 0) {
                            console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + aCode);
                            break;
                        } else {
                            pending.push(request);
                            continue;
                        }
                    } else {
                        if (Game.time % 25 === 0) {
                            console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                        }
                        pending.push(request);
                        continue;
                    }
                } else {
                    if (Game.time % 25 === 0) {
                        console.log('room.controller: insufficient energy for ' + request.archetype + ' for ' + request.reason + ' need=' + cost + ' have=' + remainingEnergy);
                    }
                    pending.push(request);
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
                        minerDuty: request.minerDuty,
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
                    pending.push(request);
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


function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 4) { return 1; }
    const remainingWork = context.constructionSites.reduce(
        (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 6 && remainingWork > 30000) { return 3; }
    if (remainingWork > 10000) { return 2; }
    return 1;
}

function chooseSpawnRequest(context: RoomControllerContext, pending: SpawnRequest[] = []): SpawnRequest | null {
    const capacities = measureCapabilities(context.creeps);
    const haulerCapacityDemand = desiredHaulerCapacity(context);
    const workerWorkDemand = desiredWorkerWork(context);

    if (context.creeps.length === 0) {
        return { archetype: 'worker', reason: 'emergency recovery' };
    }

    const pendingSourceIds = new Set(
        pending.filter(r => r.archetype === 'miner' && r.sourceId).map(r => r.sourceId!)
    );
    const pendingStandbyMiners = pending.filter(r => r.archetype === 'miner' && r.minerDuty === 'standby').length;
    const sourceDeficit = sourceSpawnDeficit(context, pendingSourceIds);
    if (sourceDeficit) {
        return {
            archetype: 'miner',
            reason: 'source harvest deficit ' + sourceDeficit.source.id,
            sourceId: sourceDeficit.source.id,
            minerDuty: 'active',
            stationaryTargetId: stationaryTargetIdForSource(sourceDeficit),
            staticMining: sourceDeficit.staticMining
        };
    }

    if (standbyMinerDeficit(context, pendingStandbyMiners) > 0) {
        return {
            archetype: 'miner',
            minerDuty: 'standby',
            reason: 'standby miner coverage ' + standbyMinerCount(context.creeps) + '/' + MINER_STANDBY_COUNT
        };
    }

    if (capacities.heal === 0 && !pending.some(r => r.archetype === 'doctor') &&
        context.room.energyCapacityAvailable >= 450) {
        return { archetype: 'doctor', reason: 'no heal-capable creep' };
    }

    if (capacities.haulerCapacity < haulerCapacityDemand && !pending.some(r => r.archetype === 'hauler')) {
        return { archetype: 'hauler', reason: 'haul deficit ' + capacities.haulerCapacity + '/' + haulerCapacityDemand };
    }

    if (capacities.workerWork < workerWorkDemand && !pending.some(r => r.archetype === 'worker')) {
        return { archetype: 'worker', reason: 'worker deficit ' + capacities.workerWork + '/' + workerWorkDemand, workRatio: workerWorkRatio(context) };
    }

    if (mineralReadyToMine(context) && context.mineralPlan &&
        capacities.mineralMinerWork < context.mineralPlan.requiredWork &&
        !pending.some(r => r.archetype === 'mineralMiner')) {
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
        return { archetype: 'claimer', reason: 'configured claim target ' + claimTargets[0], remoteRoom: claimTargets[0], remoteMode: 'claim' };
    }

    return remoteSpawnRequest(context, capacities, pending);
}

function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: ReturnType<typeof measureCapabilities>,
    pending: SpawnRequest[] = []
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
                return { archetype: 'remoteScout', reason: 'remote scout ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
            }
            continue;
        }
        if (remote.mode === 'harvest' && remote.reserve !== false && remoteClaimerCount(homeFleet, roomName, 'reserve', 2) === 0 &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName)) {
            return {
                archetype: 'claimer',
                reason: 'remote reserve ' + roomName,
                remoteRoom: roomName,
                remoteMode: 'reserve',
                minClaimParts: 2
            };
        }
        if (remote.mode === 'harvest' && remote.sources) {
            const numSources = Object.keys(remote.sources).length;
            const totalRoomHaulers = countRemoteHaulersForRoom(homeFleet, roomName);
            for (const sourceId in remote.sources) {
                const sourcePlan = remote.sources[sourceId];
                const targetMinerWork = sourcePlan.workDemand ?? 3;
                const minerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteMiner');
                const minerProjectedWork = projectedRemoteMinerWork(homeFleet, roomName, sourceId, minerCoverageHorizon);
                const minerCount = countRemoteMinersForSource(homeFleet, roomName, sourceId);
                if (minerProjectedWork < targetMinerWork &&
                    minerCount < 2 &&
                    !pending.some(r => r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    return {
                        archetype: 'remoteMiner',
                        reason: 'remote source handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + minerProjectedWork + '/' + targetMinerWork,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId,
                        staticMining: true,
                        hasContainer: !!sourcePlan.containerId
                    };
                }

                const targetHaulerCapacity = sourcePlan.haulerCapacityDemand ?? 150;
                const haulerCoverageHorizon = remoteSourceReplacementHorizon(context, sourcePlan, 'remoteHauler');
                const haulerProjectedCapacity = projectedRemoteHaulerCapacity(homeFleet, roomName, sourceId, haulerCoverageHorizon);
                if (haulerProjectedCapacity < targetHaulerCapacity &&
                    totalRoomHaulers < 2 * numSources &&
                    !pending.some(r => r.archetype === 'remoteHauler' && r.remoteRoom === roomName && r.sourceId === sourceId)) {
                    return {
                        archetype: 'remoteHauler',
                        reason: 'remote haul handoff deficit ' + roomName + ':' + sourceId +
                            ' projected=' + haulerProjectedCapacity + '/' + targetHaulerCapacity,
                        remoteRoom: roomName,
                        remoteMode: remote.mode,
                        sourceId
                    };
                }
            }

            if (remote.maintainRoads !== false && remoteNeedsMaintainer(roomName) &&
                !hasRemoteMaintainer(homeFleet, roomName) &&
                !pending.some(r => r.archetype === 'remoteMaintainer' && r.remoteRoom === roomName)) {
                return { archetype: 'remoteMaintainer', reason: 'remote maintenance ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
            }

            const sourceCount = Object.keys(remote.sources).length;
            const activeRemoteMiners = countActiveRemoteMinersForRoom(homeFleet, roomName);
            const standbyRemoteMiners = countRemoteStandbyMiners(homeFleet, roomName);
            if (activeRemoteMiners >= sourceCount && standbyRemoteMiners < REMOTE_STANDBY_COUNT &&
                !pending.some(r => r.archetype === 'remoteMiner' && r.remoteRoom === roomName && r.remoteStandby)) {
                return {
                    archetype: 'remoteMiner',
                    reason: 'remote standby ' + roomName,
                    remoteRoom: roomName,
                    remoteMode: remote.mode,
                    remoteStandby: true,
                    staticMining: true,
                    hasContainer: false
                };
            }
        }
        if ((remote.mode === 'reserve' || remote.mode === 'claim') &&
            remoteClaimerCount(homeFleet, roomName, remote.mode, remote.mode === 'reserve' ? 2 : 1) === 0 &&
            !pending.some(r => r.archetype === 'claimer' && r.remoteRoom === roomName)) {
            return {
                archetype: 'claimer',
                reason: 'configured remote ' + remote.mode + ' ' + roomName,
                remoteRoom: roomName,
                remoteMode: remote.mode,
                minClaimParts: remote.mode === 'reserve' ? 2 : undefined
            };
        }
    }

    return null;
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
        if (!ttl || ttl > REMOTE_STANDBY_DISPATCH_TTL) { continue; }
        if (ttl < lowestTtl) {
            best = creep;
            lowestTtl = ttl;
        }
    }
    return best;
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
    const hostiles = armedHostilesInRoom(creep.room);
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
        if (creep.memory.remoteRenewing) { continue; }
        if (!creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        total += getCreepCapabilities(creep).harvest;
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
        if (creep.memory.remoteRenewing) { continue; }
        if (!creep.spawning && (creep.ticksToLive ?? 0) <= horizonTicks) { continue; }
        total += getCreepCapabilities(creep).haul;
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
            hasContainer: !!sourcePlan.containerId
        })
        : planBodyForArchetype('remoteHauler', context.room.energyCapacityAvailable);
    const spawnTime = Math.max(1, spawnBody.length * CREEP_SPAWN_TIME);
    return oneWayDistance + spawnTime + REMOTE_REPLACEMENT_BUFFER_TICKS;
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
    if (room.find(FIND_CONSTRUCTION_SITES).length > 0) { return true; }
    return room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.7
    }).length > 0;
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
            if (!isStandbyMiner(creep)) {
                minerWork += capabilities.harvest;
            }
        }
        else if (archetype === 'hauler') { haulerCapacity += capabilities.haul; }
        else if (archetype === 'mineralMiner') { mineralMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteMiner') { remoteMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteHauler') { remoteHaulerCapacity += capabilities.haul; }
        else if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { /* tracked separately */ }
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

function desiredHaulerCapacity(context: RoomControllerContext): number {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 10 ? 300 : 0;
    const rawDemand = context.sources.length * base + rclBonus + salvageBonus;

    const maxCarryPerHauler = 2 * Math.floor(context.room.energyCapacityAvailable / 150) * CARRY_CAPACITY;
    const maxHaulerCreeps = Math.max(2, Math.ceil(rawDemand / Math.max(1, maxCarryPerHauler)) + 1);
    return Math.min(rawDemand, maxCarryPerHauler * maxHaulerCreeps);
}

function desiredWorkerWork(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (context.constructionSites.length > 0) {
        return Math.min(12, 4 + context.constructionSites.length);
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
        .filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO);
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
        if (sourceId && ensureArchetype(creep) === 'miner' && !isStandbyMiner(creep)) {
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

    if (archetype === 'miner' && isStandbyMiner(creep) && jobType !== 'idle') {
        clearJob(creep);
        creep.memory.interruptReason = 'standby';
        return false;
    }

    const capabilities = getCreepCapabilities(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();

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

        if ((jobType === 'build' || jobType === 'repair') &&
            capabilities.upgrade > 0 &&
            context.room.controller &&
            shouldReserveUpgrade(context, reservations)) {
            clearJob(creep);
            creep.memory.interruptReason = 'controller';
            return false;
        }

        if (jobType === 'upgrade' &&
            context.constructionSites.length > 0 &&
            capabilities.build > 0 &&
            !shouldReserveUpgrade(context, reservations)) {
            clearJob(creep);
            creep.memory.interruptReason = 'build';
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
        return capabilities.harvest > 0 && source.energyCapacity > 0;
    }
    if (jobType === 'mineMineral') {
        const mineral = target as Mineral;
        return capabilities.harvest > 0 && mineral.mineralAmount > 0 && mineralReadyToMine(context);
    }
    if (jobType === 'withdrawEnergy') {
        const storeTarget = target as StructureContainer | StructureStorage | StructureTerminal | StructureLink;
        return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            storeTarget.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
    }
    if (jobType === 'withdrawResource') {
        const storeTarget = target as WithdrawStructure;
        const resource = creep.memory.jobResourceType ?? firstStoredResource(storeTarget.store);
        if (!resource || creep.store.getFreeCapacity() === 0) { return false; }
        const remaining = (storeTarget.store.getUsedCapacity(resource) ?? 0) - (reservations.resources[storeTarget.id] ?? 0);
        return remaining > 0;
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
    if (archetype === 'miner' || archetype === 'mineralMiner') { return false; }
    if (refillSpawnTarget(context, creep, reservations)) { return true; }
    return refillTowerTarget(context, creep, reservations) !== null;
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

function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

function energyDepositTarget(context: RoomControllerContext, creep: Creep): StructureStorage | StructureTerminal | StructureContainer | null {
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
    archetype: CreepArchetype
): StructureContainer | StructureStorage | StructureTerminal | StructureLink | null {
    const sourceContainers = context.structures.containers
        .filter((container) => container.store.getUsedCapacity(RESOURCE_ENERGY) >= Math.min(200, creep.store.getFreeCapacity(RESOURCE_ENERGY)));
    const sourceLinks = context.structures.links.source
        .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0);

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const localDemandLinks = spawnEnergyPressure(context) > 0
            ? [...context.structures.links.sink, ...context.structures.links.hub]
                .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
            : [];
        return closest(creep, [...localDemandLinks, ...sourceContainers]);
    }

    const controllerOrHubLink = closest(creep, [...context.structures.links.controller, ...context.structures.links.hub]
        .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0));
    if (controllerOrHubLink) { return controllerOrHubLink; }

    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    return closest(creep, [...sourceContainers, ...sourceLinks]);
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

function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
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
    const container = closestByRange(mineral, structures.containers.filter((structure) => structure.pos.getRangeTo(mineral) <= 1));
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
        if (assignedMiners === 0) { return plan; }
    }
    return null;
}

function standbyMinerDeficit(context: RoomControllerContext, pendingStandbyMiners: number = 0): number {
    if (context.sourcePlans.length === 0) { return 0; }
    const activeMiners = activeMinerCount(context.creeps);
    if (activeMiners < context.sourcePlans.length) { return 0; }
    const desired = MINER_STANDBY_COUNT;
    const totalStandby = standbyMinerCount(context.creeps) + pendingStandbyMiners;
    return Math.max(0, desired - totalStandby);
}

function activeMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        if (isStandbyMiner(creep)) { continue; }
        count++;
    }
    return count;
}

function standbyMinerCount(creeps: Creep[]): number {
    let count = 0;
    for (const creep of creeps) {
        if (ensureArchetype(creep) !== 'miner') { continue; }
        if (!isStandbyMiner(creep)) { continue; }
        count++;
    }
    return count;
}

function assignedSourceMinerCount(creeps: Creep[], sourceId: string): number {
    let count = 0;
    for (const creep of creeps) {
        if ((creep.memory.assignedSourceId ?? creep.memory.sourceId) !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'miner') { continue; }
        if (isStandbyMiner(creep)) { continue; }
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
        if (isStandbyMiner(creep)) { continue; }
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
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax;
        if (capabilities.repair <= 0 || structure.hits >= maxHits || remainingRepairProgress(structure, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
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
    const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax;
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
    if (reservations.upgraderWork >= desiredUpgraderWork(context.room.controller.level)) { return false; }
    if (context.room.energyAvailable === 0 && storedEnergy(context) === 0) { return false; }
    return true;
}

function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }
    if (!context.structures.storage && !context.structures.terminal) { return false; }
    return storedEnergy(context) >= MINERAL_MINING_STORAGE_FLOOR;
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

function isStandbyMiner(creep: Creep): boolean {
    return ensureArchetype(creep) === 'miner' && creep.memory.minerDuty === 'standby';
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
        filter: isArmedHostile
    }).length > 0;
}

function armedHostilesInRoom(room: Room): Creep[] {
    return room.find(FIND_HOSTILE_CREEPS, {
        filter: isArmedHostile
    });
}

function isArmedHostile(creep: Creep): boolean {
    return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;
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
