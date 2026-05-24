import { remoteEnergyAvailableAfterClaims } from './energyClaims';
import {
    bestRemoteSourceContainer,
    pickRemoteEnergyTarget,
    remoteSourceContainerIds,
    type RemoteEnergySourceTarget
} from './energyTargets';

export function remoteHaulerAvoidTargetId(
    creep: Creep,
    stuckTicksThreshold: number
): string | undefined {
    const jobType = creep.memory.jobType;
    if (jobType !== 'withdrawEnergy' && jobType !== 'pickupEnergy') { return undefined; }
    if ((creep.memory.travelStuckTicks ?? 0) < stuckTicksThreshold) { return undefined; }
    return creep.memory.jobTargetId;
}

export function pickRemoteFallbackEnergyTarget(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    avoidTargetId: string | undefined,
    droppedMinAmount: number,
    followDroppedTopUp: boolean,
    droppedFirst: boolean
): RemoteEnergySourceTarget | null {
    const sourceContainerIds = remoteSourceContainerIds(remotePlan);

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

    const bestContainer = bestRemoteSourceContainer(creep, remotePlan, avoidTargetId);
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
