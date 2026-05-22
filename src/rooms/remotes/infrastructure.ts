import { closest } from '../../utils/selection';

const REMOTE_AUX_BUILD_RANGE = 8;

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
