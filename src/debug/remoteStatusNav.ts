export function remoteNavLabel(creep: Creep): string {
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

function exitDirectionLabel(direction: number): string {
    if (direction === TOP) { return 'N'; }
    if (direction === RIGHT) { return 'E'; }
    if (direction === BOTTOM) { return 'S'; }
    if (direction === LEFT) { return 'W'; }
    return '?';
}
