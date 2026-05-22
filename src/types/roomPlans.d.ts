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
    lastScouted?: number;
    lastSeenHostiles?: number;
    skipReason?: string;
    sources?: { [sourceId: string]: RemoteSourcePlan };
}

interface RoomPlanMemory {
    remoteRooms?: { [roomName: string]: RemoteRoomPlan };
    claimTargets?: string[];
    lastRcl?: number;
    sources?: { [sourceId: string]: SourcePlanMemory };
    mineral?: MineralPlanMemory;
}
