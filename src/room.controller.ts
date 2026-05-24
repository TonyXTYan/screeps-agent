import { getRoomStructures } from './room.structures';
import { repairStructureFilter } from './repair.rules';
import type { RoomControllerContext } from './local.operations';
import * as remoteOps from './remote.operations';
import * as localOps from './local.operations';

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
        filter: (tombstone) => localOps.totalStoredResources(tombstone.store) > 0
    });
    const ruins = room.find(FIND_RUINS, {
        filter: (ruin) => localOps.totalStoredResources(ruin.store) > 0
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
