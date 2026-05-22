import { ensureArchetype } from '../creep.capabilities';
import { remoteNavLabel } from './remoteStatusNav';

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

export type RemoteStatusEntry = {
    archetype: string;
    creepName: string;
    line: string;
};

export function buildRemoteStatusEntry(creep: Creep, remoteRoomName: string): RemoteStatusEntry {
    const archetype = ensureArchetype(creep);
    const ttl = creep.ticksToLive ?? -1;
    const curRoom = creep.room?.name ?? '?';
    const storeCap = creep.store.getCapacity();
    const storeInfo = storeCap === 0
        ? '--'
        : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
    const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);
    const status = remoteStatusLabel(creep, archetype, curRoom, remoteRoomName);

    const body = `W${creep.getActiveBodyparts(WORK)}C${creep.getActiveBodyparts(CARRY)}M${creep.getActiveBodyparts(MOVE)}`;
    const target = remoteTargetLabel(creep);
    const station = creep.memory.stationX !== undefined
        ? ` stn=[${creep.memory.stationX},${creep.memory.stationY}]`
        : '';
    const job = creep.memory.jobType ? ` job=${creep.memory.jobType}` : '';
    const jobTarget = creep.memory.jobTargetId ? ` tgt=${creep.memory.jobTargetId.slice(-8)}` : '';
    const pos = ` pos=[${creep.pos.x},${creep.pos.y}]`;
    const result = creep.memory.lastJobResult !== undefined ? ` res=${creep.memory.lastJobResult}` : '';
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const stuck = stuckTicks > 0 ? ` stuck=${stuckTicks}` : '';
    const pathing = remoteMinerPathingLabel(creep);
    const standbyPark = standbyParkLabel(creep);
    const claimCount = archetype === 'remoteHauler' &&
        creep.memory.jobTargetId &&
        (creep.memory.jobType === 'withdrawEnergy' || creep.memory.jobType === 'pickupEnergy')
        ? ` clm=${remoteEnergyTargetClaimCount(creep, creep.memory.jobTargetId)}`
        : '';
    const nav = remoteNavLabel(creep);

    return {
        archetype,
        creepName: creep.name,
        line: `${archetype.padEnd(16)} ${creep.name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${curRoom.padEnd(8)} ${status.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            ` src=${src}` +
            pos +
            station +
            (target ? ` ${target}` : '') +
            ` ${body}` +
            job +
            jobTarget +
            result +
            claimCount +
            stuck +
            pathing +
            standbyPark +
            nav
    };
}

function remoteStatusLabel(creep: Creep, archetype: string, currentRoom: string, remoteRoomName: string): string {
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

function remoteTargetLabel(creep: Creep): string {
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

function remoteEnergyTargetClaimCount(creep: Creep, targetId: string): number {
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

function remoteMinerPathingLabel(creep: Creep): string {
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

function standbyParkLabel(creep: Creep): string {
    if (ensureArchetype(creep) !== 'remoteMiner' || !creep.memory.remoteStandby) { return ''; }

    const stuckTicks = creep.memory.standbyParkStuckTicks ?? 0;
    if (stuckTicks <= 0) { return ''; }

    const x = creep.memory.standbyParkLastX;
    const y = creep.memory.standbyParkLastY;
    const atBoundary = x === 0 || x === 49 || y === 0 || y === 49;
    const boundaryStr = atBoundary ? ' boundary' : '';
    return ` park-stuck=${stuckTicks}${boundaryStr}`;
}
