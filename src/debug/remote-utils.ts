export function remoteSourceMinerCap(sourceId: string, sourcePlan: RemoteSourcePlan): number {
    if (sourcePlan.containerId || sourcePlan.containerSiteId) { return 1; }
    if (sourcePlan.stationX != null && sourcePlan.stationY != null) { return 1; }

    const source = Game.getObjectById(sourceId as Id<Source>);
    if (!source) { return 2; }

    const room = Game.rooms[source.pos.roomName];
    if (!room) { return 2; }
    const terrain = room.getTerrain();
    let slots = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) { continue; }
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }
            slots++;
        }
    }
    return Math.max(1, Math.min(2, slots));
}
