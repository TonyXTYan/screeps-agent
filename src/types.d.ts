type EnergyStructure = StructureExtension | StructureSpawn | StructureContainer | StructureTower;

declare const console: {
    log(...args: unknown[]): void;
};

interface CreepMemory {
    role?: string;
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
}

interface SpawnMemory {
    full?: number;
}
