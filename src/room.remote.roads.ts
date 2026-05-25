// Remote road and infrastructure placement: site selection, road cursor, build eligibility.

import { closest } from './room.targeting';
import { sameRoomPosition, isRemoteExitApproach, isSwampPathStep, isOwnedByMe } from './room.remote.routing';
import { REMOTE_AUX_BUILD_RANGE, REMOTE_PLANNING_LOG_INTERVAL } from './room.constants';

export function preferredRemoteInfrastructureSite(
    creep: Creep,
    archetype: CreepArchetype,
    selectedSite: ConstructionSite | null
): ConstructionSite | null {
    if (archetype !== 'remoteMaintainer') { return selectedSite; }

    const currentSite = currentRemoteInfrastructureBuildSite(creep);
    if (currentSite) { return currentSite; }
    return selectedSite;
}

export function currentRemoteInfrastructureBuildSite(creep: Creep): ConstructionSite | null {
    if (creep.memory.jobType !== 'build') { return null; }
    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return null; }

    const site = Game.getObjectById(targetId as Id<ConstructionSite>);
    if (!site) { return null; }
    if (site.progress >= site.progressTotal) { return null; }
    if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER) { return null; }
    return site;
}

export function isRemoteMinerSittingOnContainer(creep: Creep): boolean {
    const stationaryTargetId = creep.memory.stationaryTargetId;
    if (stationaryTargetId) {
        const station = Game.getObjectById(stationaryTargetId as Id<StructureContainer>);
        if (station && station.structureType === STRUCTURE_CONTAINER && creep.pos.isEqualTo(station.pos)) {
            return true;
        }
    }

    return creep.pos.lookFor(LOOK_STRUCTURES).some((structure) => structure.structureType === STRUCTURE_CONTAINER);
}

export function shouldBuildRemoteInfrastructure(
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

export function placeRemoteRoadSites(
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

export function prioritizedRemoteRoadSteps(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[]): RoomPosition[] {
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

export function canPlaceRemoteRoadSite(
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

export function advanceRemoteRoadCursor(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[], placed: RoomPosition): void {
    const index = latestPath.findIndex((step) => sameRoomPosition(step, placed));
    if (index < 0) { return; }
    sourcePlan.roadCursor = (index + 1) % latestPath.length;
}

export function closestRemoteInfrastructureSite(creep: Creep, allowLongRange: boolean): ConstructionSite | null {
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
