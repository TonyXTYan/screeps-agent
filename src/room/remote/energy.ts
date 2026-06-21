// Remote energy targeting: source containers, dropped resources, claim management.

import { ensureArchetype } from '../../creep/capabilities';
import { remoteTargetAccessSlots } from './fleet';
import {
    REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY, REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY,
    REMOTE_TARGET_MAX_HAULER_CLAIMS, REMOTE_HAULER_RETARGET_STUCK_TICKS,
    REMOTE_CONTAINER_BUILD_DISTANCE,
} from '../constants';

type RemoteEnergySourceTarget = {
    jobType: 'withdrawEnergy' | 'pickupEnergy';
    target: RoomObject & { id: string };
    fromDropped: boolean;
};

export function remoteHaulerAvoidTargetId(creep: Creep): string | undefined {
    const jobType = creep.memory.jobType;
    if (jobType !== 'withdrawEnergy' && jobType !== 'pickupEnergy') { return undefined; }
    if ((creep.memory.travelStuckTicks ?? 0) < REMOTE_HAULER_RETARGET_STUCK_TICKS) { return undefined; }
    return creep.memory.jobTargetId;
}

export function remoteEnergyClaimCountForTarget(creep: Creep, targetId: string): number {
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

export function remoteEnergyClaimsForTarget(creep: Creep, targetId: string): number {
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

export function remoteEnergyAvailableAfterClaims(
    creep: Creep,
    target: StructureContainer | StructureLink | Resource<RESOURCE_ENERGY>
): number {
    const amount = 'amount' in target
        ? target.amount
        : target.store.getUsedCapacity(RESOURCE_ENERGY);
    return Math.max(0, amount - remoteEnergyClaimsForTarget(creep, target.id));
}

export function shouldAvoidRemoteEnergyTarget(
    creep: Creep,
    target: RoomObject & { id: string },
    avoidTargetId?: string
): boolean {
    if (avoidTargetId && target.id === avoidTargetId) { return true; }

    const accessSlots = remoteTargetAccessSlots(target.pos);
    const claimCap = Math.max(1, Math.min(REMOTE_TARGET_MAX_HAULER_CLAIMS, accessSlots));
    return remoteEnergyClaimCountForTarget(creep, target.id) >= claimCap;
}

export function isRemoteEnergyTargetReachable(
    creep: Creep,
    target: RoomObject & { id: string }
): boolean {
    if (creep.room.name !== target.pos.roomName) { return true; }

    const strict = creep.pos.findClosestByPath([target], { ignoreCreeps: false }) as RoomObject | null;
    if (strict) { return true; }
    const soft = creep.pos.findClosestByPath([target], { ignoreCreeps: true }) as RoomObject | null;
    return soft !== null;
}

export function pickRemoteEnergyTarget<T extends RoomObject & { id: string }>(
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

export function remoteSourceStationPosition(remotePlan: RemoteRoomPlan, sourceId: string): RoomPosition | null {
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

export function remoteSourceContainerIds(remotePlan: RemoteRoomPlan): { [id: string]: true } {
    const ids: { [id: string]: true } = {};
    if (!remotePlan.sources) { return ids; }
    for (const sourceId in remotePlan.sources) {
        const containerId = remotePlan.sources[sourceId]?.containerId;
        if (!containerId) { continue; }
        ids[containerId] = true;
    }
    return ids;
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

export function pickRemoteEnergySourceTarget(
    creep: Creep,
    targets: RemoteEnergySourceTarget[]
): RemoteEnergySourceTarget | null {
    if (targets.length === 0) { return null; }
    const target = pickRemoteEnergyTarget(creep, targets.map(candidate => candidate.target));
    return targets.find(candidate => candidate.target.id === target?.id) ?? null;
}

export function remoteEnergyTargetsForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number,
    skipDroppedResources: boolean
): RemoteEnergySourceTarget[] {
    const cfg = remotePlan.sources?.[sourceId];
    if (!cfg) { return []; }

    const targets: RemoteEnergySourceTarget[] = [];
    const seenIds = new Set<string>();

    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container &&
            remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
            isRemoteEnergyTargetReachable(creep, container)) {
            targets.push({ jobType: 'withdrawEnergy', target: container, fromDropped: false });
            seenIds.add(cfg.containerId);
        }
    }

    // Extra containers near the source (user-placed second containers not tracked by containerId).
    if (creep.room.name === remotePlan.roomName) {
        const source = Game.getObjectById(sourceId as Id<Source>);
        if (source) {
            const extra = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType === STRUCTURE_CONTAINER &&
                    !seenIds.has(s.id) &&
                    s.pos.getRangeTo(source) <= REMOTE_CONTAINER_BUILD_DISTANCE,
            }) as StructureContainer[];
            for (const container of extra) {
                if (remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
                    isRemoteEnergyTargetReachable(creep, container)) {
                    targets.push({ jobType: 'withdrawEnergy', target: container, fromDropped: false });
                }
            }
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

export function remoteEnergyAvailableForSource(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    sourceId: string,
    droppedMinAmount: number
): number {
    return remoteEnergyTargetsForSource(creep, remotePlan, sourceId, droppedMinAmount, false)
        .reduce((total, candidate) =>
            total + remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>), 0);
}

export function bestRemoteEnergyTargetForSource(
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

export function bestCrossSourceRemoteEnergyTarget(
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

export function bestRemoteSourceContainer(creep: Creep, remotePlan: RemoteRoomPlan): StructureContainer | null {
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
        // Compute targets once; derive both availability and best-target from that single result
        // to avoid calling remoteEnergyTargetsForSource (which does room.find) twice.
        const allAssignedTargets = remoteEnergyTargetsForSource(
            creep, remotePlan, assignedSourceId, droppedMinAmount, false
        );
        const assignedAvailable = allAssignedTargets.reduce(
            (total, candidate) =>
                total + remoteEnergyAvailableAfterClaims(creep, candidate.target as StructureContainer | Resource<RESOURCE_ENERGY>),
            0
        );
        const assignedIsDry = assignedAvailable < REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY;
        const targetPool = followDroppedTopUp
            ? remoteEnergyTargetsForSource(creep, remotePlan, assignedSourceId, droppedMinAmount, true)
            : allAssignedTargets;
        const assignedTarget = pickRemoteEnergySourceTarget(
            creep,
            targetPool.filter(c => !shouldAvoidRemoteEnergyTarget(creep, c.target, avoidTargetId))
        );

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
