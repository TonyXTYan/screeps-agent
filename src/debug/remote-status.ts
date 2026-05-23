import { ensureArchetype } from '../creeps/capabilities';
import { remoteTargetLabel, remoteEnergyTargetClaimCount, remoteNavLabel, remoteMinerPathingLabel, standbyParkLabel } from './labels';
import { remoteSourceMinerCap } from './remote-utils';
import { ownedRooms } from './owned-rooms';

export function printRemoteCreepStatus(filterHome?: string, filterRemote?: string): void {
    for (const room of ownedRooms()) {
        if (filterHome && room.name !== filterHome) { continue; }
        const remotes = room.memory.plan?.remoteRooms;
        if (!remotes) { continue; }

        for (const [remoteName, plan] of Object.entries(remotes)) {
            if (filterRemote && remoteName !== filterRemote) { continue; }
            if (!filterRemote && !filterHome && (!plan.enabled || !plan.debugCreeps)) { continue; }

            const lines: string[] = [];

            for (const name in Game.creeps) {
                const creep = Game.creeps[name];
                if (creep.memory.homeRoom !== room.name) { continue; }
                if (creep.memory.remoteRoom !== remoteName) { continue; }
                if (creep.spawning) { continue; }

                const archetype = ensureArchetype(creep);
                const ttl = creep.ticksToLive ?? -1;
                const curRoom = creep.room?.name ?? '?';
                const storeCap = creep.store.getCapacity();
                const storeInfo = storeCap === 0
                    ? '--'
                    : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
                const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);

                let status: string;
                if (creep.memory.remoteRenewing) {
                    status = 'renewing';
                } else if (creep.memory.remoteStandby) {
                    status = 'standby';
                } else if (curRoom === remoteName) {
                    const mode: Record<string, string> = {
                        remoteMiner: 'mining',
                        remoteHauler: 'hauling',
                        remoteMaintainer: 'maintaining',
                        remoteScout: 'scouting',
                        claimer: creep.memory.remoteMode === 'reserve' ? 'reserving' : 'claiming'
                    };
                    status = mode[archetype] ?? 'on-site';
                } else {
                    status = 'traveling';
                }

                const body = `W${creep.getActiveBodyparts(WORK)}C${creep.getActiveBodyparts(CARRY)}M${creep.getActiveBodyparts(MOVE)}`;
                const tgt = remoteTargetLabel(creep);
                const stn = creep.memory.stationX !== undefined
                    ? ` stn=[${creep.memory.stationX},${creep.memory.stationY}]`
                    : '';
                const job = creep.memory.jobType ? ` job=${creep.memory.jobType}` : '';
                const jtgt = creep.memory.jobTargetId ? ` tgt=${creep.memory.jobTargetId.slice(-8)}` : '';
                const pos = ` pos=[${creep.pos.x},${creep.pos.y}]`;
                const result = creep.memory.lastJobResult !== undefined ? ` res=${creep.memory.lastJobResult}` : '';
                const stuckTicks = creep.memory.travelStuckTicks ?? 0;
                const stuck = stuckTicks > 0 ? ` stuck=${stuckTicks}` : '';
                const pathing = remoteMinerPathingLabel(creep);
                const standbyPark = standbyParkLabel(creep);
                const claimCount = ensureArchetype(creep) === 'remoteHauler' &&
                    creep.memory.jobTargetId &&
                    (creep.memory.jobType === 'withdrawEnergy' || creep.memory.jobType === 'pickupEnergy')
                    ? ` clm=${remoteEnergyTargetClaimCount(creep, creep.memory.jobTargetId)}`
                    : '';
                const nav = remoteNavLabel(creep);

                lines.push(
                    `${archetype.padEnd(16)} ${name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
                    `${curRoom.padEnd(8)} ${status.padEnd(11)} en=${storeInfo.padEnd(7)}` +
                    ` src=${src}` +
                    pos +
                    stn +
                    (tgt ? ` ${tgt}` : '') +
                    ` ${body}` +
                    job +
                    jtgt +
                    result +
                    claimCount +
                    stuck +
                    pathing +
                    standbyPark +
                    nav
                );
            }

            if (lines.length === 0) { continue; }

            const archetypeOrder: Record<string, number> = {
                remoteMiner: 0, remoteHauler: 1, remoteMaintainer: 2,
                remoteScout: 3, claimer: 4
            };
            lines.sort((a, b) => {
                const aType = a.slice(0, 16).trim();
                const bType = b.slice(0, 16).trim();
                return (archetypeOrder[aType] ?? 99) - (archetypeOrder[bType] ?? 99) ||
                    a.slice(17, 31).localeCompare(b.slice(17, 31));
            });

            console.log(`[REMOTE] t=${Game.time} ${remoteName} (home: ${room.name}):`);
            for (const line of lines) {
                console.log(`  ${line}`);
            }

            const sourceSummary: string[] = [];
            for (const [sourceId, sourcePlan] of Object.entries(plan.sources ?? {})) {
                let minerCount = 0;
                let minerWork = 0;
                let haulerCount = 0;
                let haulerCap = 0;

                for (const name in Game.creeps) {
                    const creep = Game.creeps[name];
                    if (creep.memory.homeRoom !== room.name) { continue; }
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

            if (sourceSummary.length > 0) {
                console.log(`  --- Allocation ---`);
                for (const s of sourceSummary) {
                    console.log(s);
                }
            }

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

                for (const name in Game.creeps) {
                    const creep = Game.creeps[name];
                    if (creep.spawning) { continue; }
                    if (creep.memory.homeRoom !== room.name) { continue; }
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

            if (sourceLines.length > 0) {
                console.log(`  --- Source Details ---`);
                for (const line of sourceLines) {
                    console.log(line);
                }
            }

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

            if (droppedLines.length > 0) {
                console.log(`  --- Dropped Resources ---`);
                for (const line of droppedLines) {
                    console.log(line);
                }
            }
        }
    }
}
