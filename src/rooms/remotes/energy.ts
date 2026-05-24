import {
    pickRemoteFallbackEnergyTarget,
    remoteHaulerAvoidTargetId as remoteHaulerAvoidTargetIdForStuck
} from './energyFallback';
import {
    bestCrossSourceRemoteEnergyTarget,
    bestRemoteEnergyTargetForSource,
    remoteEnergyAvailableForSource,
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

    return pickRemoteFallbackEnergyTarget(
        creep,
        remotePlan,
        avoidTargetId,
        droppedMinAmount,
        followDroppedTopUp,
        droppedFirst
    );
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
    return remoteHaulerAvoidTargetIdForStuck(creep, REMOTE_HAULER_RETARGET_STUCK_TICKS);
}
