type EnergyStructure =
    StructureExtension |
    StructureSpawn |
    StructureContainer |
    StructureTower |
    StructureStorage |
    StructureTerminal |
    StructureLink;

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
    'pickupEnergy' |
    'depositEnergy' |
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
    homeRoom?: string;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    sourceId?: string;
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
