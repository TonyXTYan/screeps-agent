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
    'doctor' |
    'claimer' |
    'remoteMiner' |
    'remoteHauler' |
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
    dangerUntil?: number;
    lastScouted?: number;
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
    stationaryWorking?: boolean;
}

interface RoomMemory {
    sources?: { [id: string]: [number, number, number] };
    structures?: RoomStructureMemory;
    load?: RoomLoadMemory;
    plan?: RoomPlanMemory;
}

interface SpawnMemory {
    full?: number;
}
