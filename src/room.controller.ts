import { BODY_BUDGET_RATIO, ensureArchetype, getBodyCapabilities } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from './room.structures';
import { repairStructureFilter, wallRampartRepairCap } from './repair.rules';
import { isHostile } from './hostileUtils';
import { reserveRenewSpawns } from './spawn.renewal';
import * as remoteOps from './remote.operations';
import * as localOps from './local.operations';

// Local copies of functions/types referenced across files
function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }
    return total;
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

// ─── Shared constants (matching local.operations.ts) ───

const TOWER_RESERVE_RATIO = 0.7;
const TOWER_RECOVERY_RATIO = 0.55;
const TOWER_HAULER_DEPOSIT_RATIO = 0.9;
const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;
const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const REMOTE_HOME_RECOVERY_STORED_ENERGY = 500;
const REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED = 5000;
const REMOTE_THROTTLE_STORED_ENERGY = 1;
const REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5;

export function run(room: Room): void {
    const context = buildContext(room);

    localOps.initialiseRoomPlan(room);
    remoteOps.updateRemoteRoomPlans(room);
    remoteOps.garbageCollectDisabledRemotes(room);
    localOps.rememberRcl(room);
    localOps.updatePlanAssignments(context);
    localOps.rememberLoad(context);
    localOps.rememberPlans(context);
    // Refresh hysteresis state once per tick so force-pull logic and debug reflect
    // current room energy conditions even when no branch queries it later.
    localOps.roomNeedsCriticalEnergyRecovery(context);
    localOps.runLinks(context);
    reportPassiveInfrastructure(context);
    localOps.assignJobs(context);
    localOps.runSpawnPlanner(context);
}

export function assignRemoteCreep(creep: Creep): boolean {
    return remoteOps.assignRemoteCreep(creep);
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
    const sourcePlans = localOps.buildSourcePlans(sources, structures);
    const mineralPlan = minerals[0] ? localOps.buildMineralPlan(minerals[0], structures) : null;

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

function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
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
        ' stored=' + localOps.storedEnergy(context) +
        ' terminalEnergy=' + terminalEnergy +
        ' labs=' + (labMinerals || 'none') +
        ' remotes=' + Object.keys(context.room.memory.plan?.remoteRooms ?? {}).length);
}

// ─── Creep job primitives ───

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

// ─── Utility search functions ───

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

// ─── Healing helpers ───

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

// ─── Legacy role mapping ───

function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}

// ─── Primary job memory helpers ───

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
