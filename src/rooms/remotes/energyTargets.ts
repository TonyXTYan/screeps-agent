import {
    isRemoteEnergyTargetReachable,
    remoteEnergyAvailableAfterClaims,
    shouldAvoidRemoteEnergyTarget
} from './energyClaims';
import {
    remoteEnergyTargetsForSource,
    type RemoteEnergySourceTarget
} from './energySourceTargets';
import {
    pickRemoteEnergyCandidateByTarget,
    pickRemoteEnergyTarget
} from './remoteEnergyTargetPicker';

export { pickRemoteEnergyTarget } from './remoteEnergyTargetPicker';
export {
    remoteEnergyAvailableForSource,
    remoteSourceContainerIds,
    type RemoteEnergySourceTarget
} from './energySourceTargets';

export function bestRemoteSourceContainer(
    creep: Creep,
    remotePlan: RemoteRoomPlan,
    avoidTargetId: string | undefined
): StructureContainer | null {
    if (!remotePlan.sources) { return null; }

    const assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;

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

function pickRemoteEnergySourceTarget(
    creep: Creep,
    targets: RemoteEnergySourceTarget[]
): RemoteEnergySourceTarget | null {
    return pickRemoteEnergyCandidateByTarget(creep, targets);
}
