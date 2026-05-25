// Remote maintenance pressure telemetry: event-driven decay/backlog snapshots.

const EMPTY_DECAY = (): RemoteMaintenanceDecayPressure => ({
    roadCount: 0,
    containerCount: 0,
    roadHits: 0,
    roadHitsMax: 0,
    containerHits: 0,
    containerHitsMax: 0,
    roadDecayHitsPerTick: 0,
    containerDecayHitsPerTick: 0,
    totalDecayHitsPerTick: 0,
    roadDecayEnergyPerTick: 0,
    containerDecayEnergyPerTick: 0,
    totalDecayEnergyPerTick: 0
});

const EMPTY_BACKLOG = (): RemoteMaintenanceBacklogPressure => ({
    roadRepairEnergy: 0,
    containerRepairEnergy: 0,
    totalRepairEnergy: 0,
    roadBuildEnergy: 0,
    containerBuildEnergy: 0,
    totalBuildEnergy: 0,
    totalBacklogEnergy: 0
});

export function createEmptyRemoteMaintenancePressure(): RemoteMaintenancePressure {
    return {
        stale: true,
        needsRefresh: false,
        lastMaintainerCount: 0,
        decay: EMPTY_DECAY(),
        backlog: EMPTY_BACKLOG()
    };
}

export function ensureRemoteMaintenancePressure(remotePlan: RemoteRoomPlan): RemoteMaintenancePressure {
    const maintenance = remotePlan.maintenance;
    if (maintenance) {
        maintenance.decay = maintenance.decay ?? EMPTY_DECAY();
        maintenance.backlog = maintenance.backlog ?? EMPTY_BACKLOG();
        maintenance.lastMaintainerCount = maintenance.lastMaintainerCount ?? 0;
        maintenance.needsRefresh = maintenance.needsRefresh ?? false;
        maintenance.stale = maintenance.stale ?? true;
        return maintenance;
    }
    remotePlan.maintenance = createEmptyRemoteMaintenancePressure();
    return remotePlan.maintenance;
}

export function markRemoteMaintenanceRefresh(remotePlan: RemoteRoomPlan, trigger: RemoteMaintenanceTrigger): void {
    const maintenance = ensureRemoteMaintenancePressure(remotePlan);
    maintenance.lastTrigger = trigger;
    maintenance.needsRefresh = true;
}

export function snapshotRemoteMaintainerCount(remotePlan: RemoteRoomPlan, count: number): void {
    const maintenance = ensureRemoteMaintenancePressure(remotePlan);
    maintenance.lastMaintainerCount = Math.max(0, count);
}

export function refreshRemoteMaintenancePressureIfNeeded(remotePlan: RemoteRoomPlan, remoteRoomName: string): boolean {
    const maintenance = ensureRemoteMaintenancePressure(remotePlan);
    if (!maintenance.needsRefresh) { return false; }

    const room = Game.rooms[remoteRoomName];
    if (!room) {
        maintenance.stale = true;
        return false;
    }

    remotePlan.maintenance = computeRemoteMaintenancePressure(room, maintenance);
    return true;
}

function computeRemoteMaintenancePressure(
    room: Room,
    previous: RemoteMaintenancePressure
): RemoteMaintenancePressure {
    const decay = EMPTY_DECAY();
    const backlog = EMPTY_BACKLOG();
    const ownedRoadDecayTime = (globalThis as { ROAD_DECAY_TIME_OWNED?: number }).ROAD_DECAY_TIME_OWNED ?? ROAD_DECAY_TIME;
    const roadDecayTime = room.controller?.my ? ownedRoadDecayTime : ROAD_DECAY_TIME;
    const containerDecayTime = room.controller?.my ? CONTAINER_DECAY_TIME_OWNED : CONTAINER_DECAY_TIME;

    const structures = room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER
    });
    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            decay.roadCount++;
            decay.roadHits += structure.hits;
            decay.roadHitsMax += structure.hitsMax;
            decay.roadDecayHitsPerTick += ROAD_DECAY_AMOUNT / roadDecayTime;
            backlog.roadRepairEnergy += (structure.hitsMax - structure.hits) / REPAIR_POWER;
            continue;
        }
        const container = structure as StructureContainer;
        decay.containerCount++;
        decay.containerHits += container.hits;
        decay.containerHitsMax += container.hitsMax;
        decay.containerDecayHitsPerTick += CONTAINER_DECAY / containerDecayTime;
        backlog.containerRepairEnergy += (container.hitsMax - container.hits) / REPAIR_POWER;
    }

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER
    });
    for (const site of sites) {
        const buildEnergy = site.progressTotal - site.progress;
        if (site.structureType === STRUCTURE_ROAD) {
            backlog.roadBuildEnergy += buildEnergy;
        } else {
            backlog.containerBuildEnergy += buildEnergy;
        }
    }

    decay.totalDecayHitsPerTick = decay.roadDecayHitsPerTick + decay.containerDecayHitsPerTick;
    decay.roadDecayEnergyPerTick = decay.roadDecayHitsPerTick / REPAIR_POWER;
    decay.containerDecayEnergyPerTick = decay.containerDecayHitsPerTick / REPAIR_POWER;
    decay.totalDecayEnergyPerTick = decay.roadDecayEnergyPerTick + decay.containerDecayEnergyPerTick;

    backlog.totalRepairEnergy = backlog.roadRepairEnergy + backlog.containerRepairEnergy;
    backlog.totalBuildEnergy = backlog.roadBuildEnergy + backlog.containerBuildEnergy;
    backlog.totalBacklogEnergy = backlog.totalRepairEnergy + backlog.totalBuildEnergy;

    return {
        observedAt: Game.time,
        stale: false,
        lastTrigger: previous.lastTrigger,
        needsRefresh: false,
        lastMaintainerCount: previous.lastMaintainerCount ?? 0,
        decay,
        backlog
    };
}
