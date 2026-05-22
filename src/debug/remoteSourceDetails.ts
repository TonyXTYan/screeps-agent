import { ensureArchetype } from '../creep.capabilities';

export function printRemoteSourceDetails(room: Room, remoteName: string, plan: RemoteRoomPlan): void {
    const sourceLines: string[] = [];
    for (const [sourceId, sourcePlan] of Object.entries(plan.sources ?? {})) {
        const shortId = sourceId.slice(-8);

        const source = Game.getObjectById(sourceId as Id<Source>);
        if (source) {
            sourceLines.push(
                `  src=${shortId}  pos=[${source.pos.x},${source.pos.y}]` +
                `  energy=${source.energy}/${source.energyCapacity}` +
                `  regen=${source.ticksToRegeneration ?? 0}`
            );
        } else {
            const pos = sourcePlan.stationX !== undefined
                ? `${sourcePlan.stationX},${sourcePlan.stationY}`
                : '?';
            sourceLines.push(`  src=${shortId}  station=[${pos}]  (not visible)`);
        }

        if (sourcePlan.containerId) {
            const container = Game.getObjectById(sourcePlan.containerId as Id<StructureContainer>);
            if (container) {
                const energy = container.store.getUsedCapacity(RESOURCE_ENERGY);
                const cap = container.store.getCapacity(RESOURCE_ENERGY);
                sourceLines.push(
                    `    container=${sourcePlan.containerId.slice(-8)} at [${container.pos.x},${container.pos.y}]` +
                    `  energy=${energy}/${cap}  hp=${container.hits}/${container.hitsMax}`
                );
            } else {
                sourceLines.push(`    container=${sourcePlan.containerId.slice(-8)}  (not visible)`);
            }
        }

        if (sourcePlan.containerSiteId && !sourcePlan.containerId) {
            const site = Game.getObjectById(sourcePlan.containerSiteId as Id<ConstructionSite>);
            if (site) {
                sourceLines.push(
                    `    containerSite=${sourcePlan.containerSiteId.slice(-8)} at [${site.pos.x},${site.pos.y}]` +
                    `  progress=${site.progress}/${site.progressTotal}`
                );
            } else {
                sourceLines.push(`    containerSite=${sourcePlan.containerSiteId.slice(-8)}  (not visible)`);
            }
        }

        appendRemoteMinerLines(sourceLines, room.name, remoteName, sourceId);
    }

    if (sourceLines.length === 0) { return; }

    console.log(`  --- Source Details ---`);
    for (const line of sourceLines) {
        console.log(line);
    }
}

export function printRemoteDroppedResources(remoteName: string): void {
    const droppedLines: string[] = [];
    const remoteRoomObj = Game.rooms[remoteName];
    if (remoteRoomObj) {
        const droppedResources = remoteRoomObj.find(FIND_DROPPED_RESOURCES);
        for (const resource of droppedResources) {
            droppedLines.push(
                `  dropped=${resource.resourceType}` +
                `  amount=${resource.amount}` +
                `  pos=[${resource.pos.x},${resource.pos.y}]`
            );
        }
    }

    if (droppedLines.length === 0) { return; }

    console.log(`  --- Dropped Resources ---`);
    for (const line of droppedLines) {
        console.log(line);
    }
}

function appendRemoteMinerLines(
    sourceLines: string[],
    homeRoomName: string,
    remoteName: string,
    sourceId: string
): void {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }
        if (creep.memory.homeRoom !== homeRoomName) { continue; }
        if (creep.memory.remoteRoom !== remoteName) { continue; }
        const src = creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '';
        if (src !== sourceId) { continue; }
        if (ensureArchetype(creep) !== 'remoteMiner') { continue; }

        const ttl = creep.ticksToLive ?? -1;
        const work = creep.getActiveBodyparts(WORK);
        let status: string;
        if (creep.memory.remoteRenewing) {
            status = 'renewing';
        } else if (creep.memory.remoteStandby) {
            status = 'standby';
        } else if (creep.room?.name === remoteName) {
            status = 'mining';
        } else {
            status = 'traveling';
        }

        const creepPos = creep.room ? `${creep.pos.x},${creep.pos.y}` : '?,?';
        sourceLines.push(`    miner=${name}  W=${work}  TTL=${ttl}  ${status}  pos=[${creepPos}]`);
    }
}
