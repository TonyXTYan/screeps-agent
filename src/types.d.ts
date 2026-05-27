type EnergyStructure =
    StructureExtension |
    StructureSpawn |
    StructureContainer |
    StructureTower |
    StructureStorage |
    StructureTerminal |
    StructureLink;

type WithdrawStructure =
    StructureContainer |
    StructureStorage |
    StructureTerminal |
    StructureLink |
    Tombstone |
    Ruin;

type CreepArchetype =
    'worker' |
    'miner' |
    'hauler' |
    'patrol' |
    'doctor' |
    'claimer' |
    'remoteMiner' |
    'remoteHauler' |
    'remoteMaintainer' |
    'remoteScout' |
    'mineralMiner';

type CreepJobType =
    'harvestSource' |
    'withdrawEnergy' |
    'withdrawResource' |
    'pickupEnergy' |
    'pickupResource' |
    'depositEnergy' |
    'depositResource' |
    'refillSpawn' |
    'refillTower' |
    'build' |
    'repair' |
    'upgrade' |
    'heal' |
    'mineMineral' |
    'depositMineral' |
    'reserveController' |
    'claimController' |
    'travelRoom' |
    'idle';

type RemoteRoomMode = 'harvest' | 'reserve' | 'claim';
type RemoteRouteHealth = 'healthy' | 'degraded';
type EnergyRecoveryReason = 'none' | 'spawn' | 'tower' | 'spawn+tower' | 'hysteresis';

interface RemoteSourcePlan {
    sourceId: string;
    stationX?: number;
    stationY?: number;
    containerId?: string;
    containerSiteId?: string;
    containerClearedAt?: number;
    pathSerialized?: string;
    pathDistance?: number;
    pathUpdatedAt?: number;
    workDemand?: number;
    haulerCapacityDemand?: number;
    assignedMinerWork?: number;
    assignedHaulerCapacity?: number;
    lastSeen?: number;
    routeAccessible?: boolean;
    routeHealth?: RemoteRouteHealth;
    lastStallAt?: number;
    stallCount?: number;
    lastStallX?: number;
    lastStallY?: number;
    lastStallRoom?: string;
    blockedApproachX?: number;
    blockedApproachY?: number;
    blockedApproachRoom?: string;
    stationFailures?: number;
    roadCursor?: number;
    lastRoadPlanAt?: number;
    lastHarvestedAt?: number;
}

interface RoomStructureMemory {
    updatedAt: number;
    spawns: string[];
    extensions: string[];
    towers: string[];
    containers: string[];
    storage?: string;
    links: {
        source: string[];
        hub: string[];
        controller: string[];
        sink: string[];
        other: string[];
    };
    extractor?: string;
    labs: string[];
    terminal?: string;
    factory?: string;
    observer?: string;
    powerSpawn?: string;
    nuker?: string;
}

interface RoomLoadMemory {
    updatedAt: number;
    rcl: number;
    energyAvailable: number;
    energyCapacity: number;
    storedEnergy: number;
    sourceCount: number;
    minerWork: number;
    minerWorkDemand: number;
    haulerCapacity: number;
    haulerCapacityDemand: number;
    workerWork: number;
    workerWorkDemand: number;
    spawnEnergyDeficit: number;
    towerEnergyDeficit: number;
    constructionSites: number;
    repairTargets: number;
    mineralReady: boolean;
    salvageResources: number;
    mineralMinerWork: number;
    mineralMinerWorkDemand: number;
}

interface SourcePlanMemory {
    sourceId: string;
    containerId?: string;
    linkId?: string;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

interface MineralPlanMemory {
    mineralId: string;
    extractorId?: string;
    containerId?: string;
    linkId?: string;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

type RemoteMaintenanceTrigger = 'setup' | 'maintainerDeath' | 'maintainerTtl500' | 'memoryAudit';

interface RemoteMaintenanceDecayPressure {
    roadCount: number;
    containerCount: number;
    roadHits: number;
    roadHitsMax: number;
    containerHits: number;
    containerHitsMax: number;
    roadDecayHitsPerTick: number;
    containerDecayHitsPerTick: number;
    totalDecayHitsPerTick: number;
    roadDecayEnergyPerTick: number;
    containerDecayEnergyPerTick: number;
    totalDecayEnergyPerTick: number;
}

interface RemoteMaintenanceBacklogPressure {
    roadRepairEnergy: number;
    containerRepairEnergy: number;
    totalRepairEnergy: number;
    roadBuildEnergy: number;
    containerBuildEnergy: number;
    totalBuildEnergy: number;
    totalBacklogEnergy: number;
}

interface RemoteMaintenancePressure {
    observedAt?: number;
    stale: boolean;
    lastTrigger?: RemoteMaintenanceTrigger;
    needsRefresh: boolean;
    lastMaintainerCount: number;
    decay: RemoteMaintenanceDecayPressure;
    backlog: RemoteMaintenanceBacklogPressure;
}

interface RemoteRoomPlan {
    enabled: boolean;
    roomName: string;
    mode: RemoteRoomMode;
    reserve?: boolean;
    buildRoads?: boolean;
    maintainRoads?: boolean;
    debugPaths?: boolean;
    debugCreeps?: boolean;
    dangerUntil?: number;
    manualPauseUntil?: number;
    lastScouted?: number;
    lastSeenHostiles?: number;
    lastSeenInvaderCoreAt?: number;
    lastSeenHostileControllerAt?: number;
    skipReason?: string;
    lastPatrolDangerNotifyAt?: number;
    maintenance?: RemoteMaintenancePressure;
    sources?: { [sourceId: string]: RemoteSourcePlan };
}

interface RoomPlanMemory {
    remoteRooms?: { [roomName: string]: RemoteRoomPlan };
    claimTargets?: string[];
    lastRcl?: number;
    sources?: { [sourceId: string]: SourcePlanMemory };
    mineral?: MineralPlanMemory;
}

declare const console: {
    log(...args: unknown[]): void;
};

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
    patrolRoom?: string;
    patrolRotateAt?: number;
    patrolRouteIndex?: number;
    patrolLoiterRoom?: string;
    patrolLoiterUntil?: number;
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
    legacyDefenseMigrationDone?: boolean;
}
