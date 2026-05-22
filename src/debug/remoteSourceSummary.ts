import { ensureArchetype } from '../creep.capabilities';

export function printRemoteSourceSummary(room: Room, remoteName: string, plan: RemoteRoomPlan): void {
    const sourceSummary: string[] = [];
    for (const [sourceId, sourcePlan] of Object.entries(plan.sources ?? {})) {
        const { minerCount, minerWork, haulerCount, haulerCap } = countSourceAssignedCreeps(room.name, remoteName, sourceId);

        const shortId = sourceId.slice(-8);
        const wd = sourcePlan.workDemand ?? '?';
        const hd = sourcePlan.haulerCapacityDemand ?? '?';
        const dist = sourcePlan.pathDistance ?? '?';
        const minerCap = remoteSourceMinerCap(sourceId, sourcePlan);
        const overload = minerCount > minerCap ? '!' : '';
        const route = sourcePlan.routeAccessible === false
            ? 'blocked'
            : sourcePlan.routeAccessible === true ? 'ok' : '?';
        const routeHealth = sourcePlan.routeHealth === 'degraded' ? '/degraded' : '';
        const station = sourcePlan.stationX !== undefined && sourcePlan.stationY !== undefined
            ? `  stn=[${sourcePlan.stationX},${sourcePlan.stationY}]`
            : '';
        const site = sourcePlan.containerSiteId && !sourcePlan.containerId
            ? `  site=${sourcePlan.containerSiteId.slice(-8)}`
            : '';
        const blocked = sourcePlan.blockedApproachX !== undefined && sourcePlan.blockedApproachRoom !== undefined
            ? `  blk=[${sourcePlan.blockedApproachX},${sourcePlan.blockedApproachY}]@${sourcePlan.blockedApproachRoom}`
            : '';
        const failures = (sourcePlan.stationFailures ?? 0) > 0
            ? `  fails=${sourcePlan.stationFailures}`
            : '';
        const stalls = (sourcePlan.stallCount ?? 0) > 0
            ? `  stalls=${sourcePlan.stallCount}`
            : '';
        sourceSummary.push(
            `  src=${shortId}  miners=${minerCount}/${minerCap}${overload} (${minerWork}W)` +
            `  haulers=${haulerCount} (${haulerCap}C)` +
            `  demand=${wd}W/${hd}C  dist=${dist}  route=${route}${routeHealth}` +
            station +
            site +
            blocked +
            failures +
            stalls
        );
    }

    if (sourceSummary.length === 0) { return; }

    console.log(`  --- Allocation ---`);
    for (const line of sourceSummary) {
        console.log(line);
    }
}

function countSourceAssignedCreeps(
    homeRoomName: string,
    remoteName: string,
    sourceId: string
): { minerCount: number; minerWork: number; haulerCount: number; haulerCap: number } {
    let minerCount = 0;
    let minerWork = 0;
    let haulerCount = 0;
    let haulerCap = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom !== homeRoomName) { continue; }
        if (creep.memory.remoteRoom !== remoteName) { continue; }
        if (creep.spawning) { continue; }
        const src = creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '';
        if (src !== sourceId) { continue; }

        const archetype = ensureArchetype(creep);
        if (archetype === 'remoteMiner') {
            minerCount++;
            minerWork += creep.getActiveBodyparts(WORK);
        } else if (archetype === 'remoteHauler') {
            haulerCount++;
            haulerCap += creep.store.getCapacity();
        }
    }

    return { minerCount, minerWork, haulerCount, haulerCap };
}

function remoteSourceMinerCap(sourceId: string, sourcePlan: RemoteSourcePlan): number {
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
