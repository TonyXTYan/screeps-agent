import { isRemoteExitApproach, isSwampPathStep, sameRoomPosition } from './pathing';

export function placeRemoteRoadSites(
    homeRoom: Room,
    visibleRemote: Room,
    sourcePlan: RemoteSourcePlan,
    latestPath: RoomPosition[],
    myUsername: string | undefined,
    siteLimit: number,
    maxToPlace: number,
    unfinishedRoadSites: number,
    logInterval: number
): number {
    let placed = 0;
    const steps = prioritizedRemoteRoadSteps(sourcePlan, latestPath);
    for (const step of steps) {
        if (placed >= maxToPlace || unfinishedRoadSites + placed >= siteLimit) { break; }
        if (!canPlaceRemoteRoadSite(homeRoom, visibleRemote, step, myUsername)) { continue; }

        const code = step.createConstructionSite(STRUCTURE_ROAD);
        if (code === OK) {
            placed++;
            sourcePlan.lastRoadPlanAt = Game.time;
            advanceRemoteRoadCursor(sourcePlan, latestPath, step);
        } else if (code === ERR_FULL) {
            break;
        } else if (Game.time % logInterval === 0) {
            console.log('room.controller: failed to place remote road in ' + step.roomName + ' at ' + step.x + ',' + step.y + ' code=' + code);
        }
    }
    return placed;
}

function prioritizedRemoteRoadSteps(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[]): RoomPosition[] {
    const steps: RoomPosition[] = [];
    const addUnique = (pos: RoomPosition | undefined): void => {
        if (!pos) { return; }
        if (steps.some((step) => sameRoomPosition(step, pos))) { return; }
        steps.push(pos);
    };

    for (const step of latestPath) {
        if (isRemoteExitApproach(step)) { addUnique(step); }
    }
    for (const step of latestPath) {
        if (isSwampPathStep(step)) { addUnique(step); }
    }
    if (sourcePlan.lastStallX !== undefined &&
        sourcePlan.lastStallY !== undefined &&
        sourcePlan.lastStallRoom) {
        addUnique(new RoomPosition(sourcePlan.lastStallX, sourcePlan.lastStallY, sourcePlan.lastStallRoom));
    }

    const start = Math.max(0, sourcePlan.roadCursor ?? 0) % Math.max(1, latestPath.length);
    for (let offset = 0; offset < latestPath.length; offset++) {
        addUnique(latestPath[(start + offset) % latestPath.length]);
    }

    return steps;
}

function canPlaceRemoteRoadSite(
    homeRoom: Room,
    visibleRemote: Room,
    pos: RoomPosition,
    myUsername: string | undefined
): boolean {
    if (pos.x <= 0 || pos.y <= 0 || pos.x >= 49 || pos.y >= 49) { return false; }
    if (pos.roomName !== visibleRemote.name && pos.roomName !== homeRoom.name) { return false; }
    const room = Game.rooms[pos.roomName];
    if (!room) { return false; }
    if (isOwnedByMe(room, myUsername)) { return false; }
    if (room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL) { return false; }

    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (structures.some((s) => s.structureType === STRUCTURE_ROAD)) { return false; }
    if (structures.some((s) => s.structureType !== STRUCTURE_RAMPART)) { return false; }
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return false; }
    return true;
}

function advanceRemoteRoadCursor(sourcePlan: RemoteSourcePlan, latestPath: RoomPosition[], placed: RoomPosition): void {
    const index = latestPath.findIndex((step) => sameRoomPosition(step, placed));
    if (index < 0) { return; }
    sourcePlan.roadCursor = (index + 1) % latestPath.length;
}

function isOwnedByMe(room: Room, myUsername?: string): boolean {
    if (!myUsername) { return false; }
    return room.controller?.owner?.username === myUsername;
}
