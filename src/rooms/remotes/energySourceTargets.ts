import {
    isRemoteEnergyTargetReachable,
    remoteEnergyAvailableAfterClaims
} from './energyClaims';

export type RemoteEnergySourceTarget = {
    jobType: 'withdrawEnergy' | 'pickupEnergy';
    target: RoomObject & { id: string };
    fromDropped: boolean;
};

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
    if (cfg.containerId) {
        const container = Game.getObjectById(cfg.containerId as Id<StructureContainer>);
        if (container &&
            remoteEnergyAvailableAfterClaims(creep, container) > 0 &&
            isRemoteEnergyTargetReachable(creep, container)) {
            targets.push({ jobType: 'withdrawEnergy', target: container, fromDropped: false });
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

function remoteSourceStationPosition(remotePlan: RemoteRoomPlan, sourceId: string): RoomPosition | null {
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
