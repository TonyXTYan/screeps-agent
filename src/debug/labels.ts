import { ensureArchetype } from '../creeps/capabilities';
import { STRUCT_LABEL } from './constants';

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

function targetLabel(creep: Creep): string {
    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return ''; }
    const target = Game.getObjectById(targetId as Id<any>);
    if (!target) { return ''; }
    if ('structureType' in (target as any)) {
        return STRUCT_LABEL[(target as any).structureType] ?? (target as any).structureType;
    }
    if ('mineralType' in (target as any)) {
        return (target as any).mineralType;
    }
    if ('resourceType' in (target as any)) {
        const rt = (target as any).resourceType;
        return rt === RESOURCE_ENERGY ? 'energy' : rt;
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

function exitDirectionLabel(direction: number): string {
    if (direction === TOP) { return 'N'; }
    if (direction === RIGHT) { return 'E'; }
    if (direction === BOTTOM) { return 'S'; }
    if (direction === LEFT) { return 'W'; }
    return '?';
}

function remoteHarvestStationLabel(creep: Creep): string {
    if (creep.memory.jobType !== 'harvestSource') { return ''; }
    const x = creep.memory.stationX;
    const y = creep.memory.stationY;
    const roomName = creep.memory.remoteRoom;
    if (x == null || y == null || !roomName || creep.room.name !== roomName) { return ''; }

    const stationPos = new RoomPosition(x, y, roomName);
    const range = creep.pos.getRangeTo(stationPos);
    const route = PathFinder.search(
        creep.pos,
        { pos: stationPos, range: 0 },
        { maxRooms: 1, maxOps: 2000 }
    );
    return route.incomplete ? ` stnR=${range} stnP=X` : ` stnR=${range} stnP=${route.path.length}`;
}

function remoteNavLabel(creep: Creep): string {
    const jobType = creep.memory.jobType;
    const jobRoom = creep.memory.jobRoomName;

    if (jobType === 'travelRoom' && jobRoom) {
        const dir = Game.map.findExit(creep.room, jobRoom);
        const onEdge = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
        const dirLabel = typeof dir === 'number' ? exitDirectionLabel(dir) : '?';
        return ` to=${jobRoom} ex=${dirLabel}${onEdge ? ' edge' : ''}`;
    }

    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return ''; }
    const target = Game.getObjectById(targetId as Id<any>) as (RoomObject & { id: string }) | null;
    if (!target) { return ' trg=[?]'; }

    const targetPos = target.pos;
    let label = ` trg=[${targetPos.x},${targetPos.y}]`;
    if (creep.room.name !== targetPos.roomName) {
        label += ` to=${targetPos.roomName}`;
        return label;
    }

    const range = creep.pos.getRangeTo(targetPos);
    label += ` r=${range}`;
    label += remoteHarvestStationLabel(creep);

    const shouldPathInspect = jobType === 'withdrawEnergy' ||
        jobType === 'withdrawResource' ||
        jobType === 'pickupEnergy' ||
        jobType === 'pickupResource' ||
        jobType === 'travelRoom';
    if (!shouldPathInspect) { return label; }

    const desiredRange = jobType === 'withdrawEnergy' ||
        jobType === 'withdrawResource' ||
        jobType === 'pickupEnergy' ||
        jobType === 'pickupResource'
        ? 1
        : 0;
    const route = PathFinder.search(
        creep.pos,
        { pos: targetPos, range: desiredRange },
        { maxRooms: 1, maxOps: 2000 }
    );
    if (route.incomplete) {
        label += ' p=X';
    } else {
        const pathLen = route.path.length;
        const isLong = pathLen > Math.max(25, range * 4);
        label += isLong ? ` p=!${pathLen}` : ` p=${pathLen}`;
    }
    return label;
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

export { remoteTargetLabel, targetLabel, remoteEnergyTargetClaimCount, exitDirectionLabel, remoteNavLabel, remoteMinerPathingLabel, standbyParkLabel };
