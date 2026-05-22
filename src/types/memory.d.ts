interface CreepMemory {
    role?: string;
    archetype?: CreepArchetype;
    jobType?: CreepJobType;
    jobTargetId?: string;
    jobRoomName?: string;
    jobAssignedAt?: number;
    jobResourceType?: ResourceConstant;
    primaryJobType?: CreepJobType;
    primaryTargetId?: string;
    primaryRoomName?: string;
    primaryResourceType?: ResourceConstant;
    primaryAssignedAt?: number;
    interruptReason?: string;
    homeRoom?: string;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    sourceId?: string;
    assignedSourceId?: string;
    assignedMineralId?: string;
    stationaryTargetId?: string;
    staticMining?: boolean;
    lastJobResult?: number;
    harvestTargetSourceIndex?: number;
    harvestTargetSourceId?: string;
    building?: boolean;
    repairing?: boolean;
    dumping?: boolean;
    upgrading?: boolean;
    attacking?: boolean;
    stationaryWorking?: boolean;
    rallySpawnId?: string;
    stationX?: number;
    stationY?: number;
    scoutWanderRoom?: string;
    scoutWanderUntil?: number;
    renewing?: boolean;
    remoteRenewing?: boolean;
    remoteStandby?: boolean;
    remoteHaulerRenewAfterTrip?: boolean;
    remoteHaulerReturning?: boolean;
    remoteHaulerIdleUntil?: number;
    remoteHaulerLastPickupWasDropped?: boolean;
    remoteHaulerWanderX?: number;
    remoteHaulerWanderY?: number;
    remoteHaulerWanderUntil?: number;
    travelLastX?: number;
    travelLastY?: number;
    travelLastRoom?: string;
    travelStuckTicks?: number;
    remoteStationStuckSourceId?: string;
    remoteStationPrevX?: number;
    remoteStationPrevY?: number;
    remoteStationPrevRoom?: string;
    remoteStationLastX?: number;
    remoteStationLastY?: number;
    remoteStationLastRoom?: string;
    remoteStationBestRange?: number;
    remoteStationNoProgressTicks?: number;
    remoteStationOscillationTicks?: number;
    remoteStationStuckTicks?: number;
    trafficYieldX?: number;
    trafficYieldY?: number;
    trafficYieldRoom?: string;
    trafficYieldUntil?: number;
    standbyParkStuckTicks?: number;
    standbyParkLastX?: number;
    standbyParkLastY?: number;
}

interface RoomMemory {
    sources?: { [id: string]: [number, number, number] };
    structures?: RoomStructureMemory;
    load?: RoomLoadMemory;
    plan?: RoomPlanMemory;
    energyRecoveryActive?: boolean;
    energyRecoveryReason?: EnergyRecoveryReason;
    debug_tower?: boolean;
    debug_home?: boolean;
    debug_remotes?: boolean;
}

interface SpawnMemory {
    full?: number;
}

interface Memory {
    lastBuildCommit?: string;
}
