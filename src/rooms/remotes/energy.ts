import { remoteEnergyAvailableAfterClaims } from './energyClaims';
import {
    bestCrossSourceRemoteEnergyTarget,
    bestRemoteEnergyTargetForSource,
    bestRemoteSourceContainer,
    pickRemoteEnergyTarget,
    remoteEnergyAvailableForSource,
    remoteSourceContainerIds,
    type RemoteEnergySourceTarget
} from './energyTargets';

export const REMOTE_HAULER_RETARGET_STUCK_TICKS = 4;

const REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY = 50;
const REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY = 1000;

export function findRemoteEnergySource(
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

export function remoteEnergyTargetPathLength(
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
