import { ensureArchetype } from '../creep.capabilities';

const STRUCT_LABEL: Record<string, string> = {
    [STRUCTURE_SPAWN]: 'spawn',
    [STRUCTURE_EXTENSION]: 'ext',
    [STRUCTURE_ROAD]: 'road',
    [STRUCTURE_WALL]: 'wall',
    [STRUCTURE_RAMPART]: 'ramp',
    [STRUCTURE_STORAGE]: 'store',
    [STRUCTURE_TOWER]: 'tower',
    [STRUCTURE_LINK]: 'link',
    [STRUCTURE_CONTAINER]: 'cont',
    [STRUCTURE_LAB]: 'lab',
    [STRUCTURE_TERMINAL]: 'term',
    [STRUCTURE_NUKER]: 'nuker',
    [STRUCTURE_POWER_SPAWN]: 'pSpawn',
    [STRUCTURE_OBSERVER]: 'obsv',
    [STRUCTURE_EXTRACTOR]: 'extr',
    [STRUCTURE_FACTORY]: 'fact',
};

export function remoteStatusLabel(creep: Creep, archetype: string, currentRoom: string, remoteRoomName: string): string {
    if (creep.memory.remoteRenewing) {
        return 'renewing';
    }
    if (creep.memory.remoteStandby) {
        return 'standby';
    }
    if (currentRoom !== remoteRoomName) {
        return 'traveling';
    }

    const mode: Record<string, string> = {
        remoteMiner: 'mining',
        remoteHauler: 'hauling',
        remoteMaintainer: 'maintaining',
        remoteScout: 'scouting',
        claimer: creep.memory.remoteMode === 'reserve' ? 'reserving' : 'claiming'
    };
    return mode[archetype] ?? 'on-site';
}

export function remoteTargetLabel(creep: Creep): string {
    const targetId = creep.memory.stationaryTargetId;
    if (!targetId) { return ''; }
    const target = Game.getObjectById(targetId as Id<any>);
    if (!target) { return ''; }
    if ('structureType' in (target as any)) {
        return STRUCT_LABEL[(target as any).structureType] ?? (target as any).structureType;
    }
    if (target instanceof Source) {
        return 'src';
    }
    return '';
}

export function remoteEnergyTargetClaimCount(creep: Creep, targetId: string): number {
    const remoteRoom = creep.memory.remoteRoom;
    if (!remoteRoom) { return 0; }

    let claims = 0;
    for (const name in Game.creeps) {
        const other = Game.creeps[name];
        if (other.id === creep.id) { continue; }
        if (ensureArchetype(other) !== 'remoteHauler') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.homeRoom !== creep.memory.homeRoom) { continue; }
        if (other.memory.jobTargetId !== targetId) { continue; }
        if (other.memory.jobType !== 'withdrawEnergy' && other.memory.jobType !== 'pickupEnergy') { continue; }
        if (other.store.getUsedCapacity(RESOURCE_ENERGY) > 0) { continue; }
        claims++;
    }
    return claims;
}

export function remoteMinerPathingLabel(creep: Creep): string {
    if (ensureArchetype(creep) !== 'remoteMiner' || creep.memory.jobType !== 'harvestSource') { return ''; }

    const noProgressTicks = creep.memory.remoteStationNoProgressTicks ?? 0;
    const oscillationTicks = creep.memory.remoteStationOscillationTicks ?? 0;
    const stationStuckTicks = creep.memory.remoteStationStuckTicks ?? 0;
    if (noProgressTicks <= 0 && oscillationTicks <= 0 && stationStuckTicks <= 0) { return ''; }

    const tags: string[] = [];
    if (noProgressTicks > 0) {
        tags.push(`np=${noProgressTicks}${noProgressTicks >= 18 ? '✓' : ''}`);
    }
    if (oscillationTicks > 0) { tags.push(`osc=${oscillationTicks}`); }
    if (stationStuckTicks > 0) { tags.push(`rst=${stationStuckTicks}`); }
    return ` ${tags.join('/')}`;
}

export function standbyParkLabel(creep: Creep): string {
    if (ensureArchetype(creep) !== 'remoteMiner' || !creep.memory.remoteStandby) { return ''; }

    const stuckTicks = creep.memory.standbyParkStuckTicks ?? 0;
    if (stuckTicks <= 0) { return ''; }

    const x = creep.memory.standbyParkLastX;
    const y = creep.memory.standbyParkLastY;
    const atBoundary = x === 0 || x === 49 || y === 0 || y === 49;
    const boundaryStr = atBoundary ? ' boundary' : '';
    return ` park-stuck=${stuckTicks}${boundaryStr}`;
}
