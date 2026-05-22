import { RoomStructureCache } from '../room.structures';

export interface RoomControllerContext {
    room: Room;
    structures: RoomStructureCache;
    sources: Source[];
    mineral: Mineral | undefined;
    creeps: Creep[];
    droppedEnergy: Resource<RESOURCE_ENERGY>[];
    droppedResources: Resource<ResourceConstant>[];
    tombstones: Tombstone[];
    ruins: Ruin[];
    constructionSites: ConstructionSite[];
    repairTargets: AnyStructure[];
    injuredCreeps: Creep[];
    sourcePlans: SourcePlan[];
    mineralPlan: MineralPlan | null;
}

export interface SpawnRequest {
    archetype: CreepArchetype;
    reason: string;
    sourceId?: string;
    mineralId?: string;
    stationaryTargetId?: string;
    staticMining?: boolean;
    hasContainer?: boolean;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
    workRatio?: number;
    minClaimParts?: number;
    maxClaimParts?: number;
    remoteStandby?: boolean;
}

export interface PendingSpawnRequest extends SpawnRequest {
    plannedBody?: BodyPartConstant[];
}

export interface ResourceTarget {
    target: WithdrawStructure;
    resource: ResourceConstant;
    amount: number;
}

export interface SourcePlan {
    source: Source;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

export interface MineralPlan {
    mineral: Mineral;
    extractor: StructureExtractor | undefined;
    container: StructureContainer | null;
    link: StructureLink | null;
    requiredWork: number;
    assignedWork: number;
    staticMining: boolean;
}

export interface JobReservations {
    resources: { [targetId: string]: number };
    dropped: { [targetId: string]: number };
    energySinks: { [targetId: string]: number };
    constructionProgress: { [targetId: string]: number };
    repairProgress: { [targetId: string]: number };
    sourceWork: { [sourceId: string]: number };
    sourceMinerCount: { [sourceId: string]: number };
    mineralWork: number;
    upgraderWork: number;
}

export type RemoteEnergySourceTarget = {
    jobType: 'withdrawEnergy' | 'pickupEnergy';
    target: RoomObject & { id: string };
    fromDropped: boolean;
};
