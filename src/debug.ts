import { ensureArchetype } from './creep.capabilities';

const DEBUG_CREEP_INTERVAL = 10;
let debugCreepsLastPrintedAt: number | undefined;

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
    if (noProgressTicks > 0) { tags.push(`np=${noProgressTicks}`); }
    if (oscillationTicks > 0) { tags.push(`osc=${oscillationTicks}`); }
    if (stationStuckTicks > 0) { tags.push(`rst=${stationStuckTicks}`); }
    return ` ${tags.join('/')}`;
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

export function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}

function printRemoteCreepStatus(filterHome?: string, filterRemote?: string): void {
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
                sourceSummary.push(
                    `  src=${shortId}  miners=${minerCount}/${minerCap}${overload} (${minerWork}W)` +
                    `  haulers=${haulerCount} (${haulerCap}C)` +
                    `  demand=${wd}W/${hd}C  dist=${dist}  route=${route}${routeHealth}` +
                    station +
                    site
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

function printMineralStatus(room: Room): void {
    const mineral = room.find(FIND_MINERALS)[0];
    if (!mineral) { return; }

    const extractor = room.find(FIND_MY_STRUCTURES).find((s) => s.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor | undefined;
    const containers = room.find(FIND_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
    const adjacentContainers = containers.filter((c) => c.pos.getRangeTo(mineral) <= 1);

    let containerStr = 'none adjacent';
    if (adjacentContainers.length > 0) {
        const c = adjacentContainers[0];
        const mineralAmount = c.store.getUsedCapacity(mineral.mineralType);
        const cap = c.store.getCapacity();
        containerStr = `${c.id.slice(-8)} at [${c.pos.x},${c.pos.y}] ${mineral.mineralType}=${mineralAmount}/${cap}`;
    } else if (containers.length > 0) {
        const nearby = containers.filter((c) => c.pos.getRangeTo(mineral) <= 3);
        if (nearby.length > 0) {
            const c = nearby[0];
            const range = c.pos.getRangeTo(mineral);
            containerStr = `${c.id.slice(-8)} at range ${range} (too far)`;
        }
    }

    console.log(`[MINERAL] t=${Game.time} ${mineral.id.slice(-8)} at [${mineral.pos.x},${mineral.pos.y}]  ` +
        `amount=${mineral.mineralAmount}  type=${mineral.mineralType}  ` +
        `extractor=${extractor ? 'yes' : 'no'}  ` +
        `container=${containerStr}`);
}

function printHomeCreepStatus(homeRoom: string): void {
    const room = Game.rooms[homeRoom];
    if (room) { printMineralStatus(room); }

    const archetypes: string[] = [];
    const counts: Record<string, number> = {};
    const lines: string[] = [];

    const statusLabels: Record<string, string> = {
        harvestSource: 'harvestSrc',
        withdrawEnergy: 'withdraw',
        depositEnergy: 'deposit',
        pickupEnergy: 'pickup',
        refillSpawn: 'refill',
        refillTower: 'refillTow',
        build: 'build',
        repair: 'repair',
        upgrade: 'upgrade',
        heal: 'heal',
        mineMineral: 'mineMin',
        depositMineral: 'depositMin',
        withdrawResource: 'wdRsrc',
        depositResource: 'depRsrc',
        pickupResource: 'puRsrc',
        reserveController: 'reserve',
        claimController: 'claim',
        travelRoom: 'traveling',
        idle: 'IDLE'
    };

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom !== homeRoom) { continue; }
        if (creep.memory.remoteRoom) { continue; }
        if (creep.spawning) { continue; }

        const archetype = ensureArchetype(creep);
        if (!counts[archetype]) {
            counts[archetype] = 0;
            archetypes.push(archetype);
        }
        counts[archetype]++;

        const ttl = creep.ticksToLive ?? -1;
        const storeCap = creep.store.getCapacity();
        const storeInfo = storeCap === 0
            ? '--'
            : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
        const jobLabel = statusLabels[creep.memory.jobType ?? ''] ?? creep.memory.jobType ?? '-';
        const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);
        const w = creep.getActiveBodyparts(WORK);
        const c = creep.getActiveBodyparts(CARRY);
        const m = creep.getActiveBodyparts(MOVE);
        const bodyStr = `W${w}C${c}M${m}`;
        const tgt = targetLabel(creep);
        const intReason = creep.memory.interruptReason;
        const intStr = intReason ? ` i=${intReason}` : '';
        const primaryJob = creep.memory.primaryJobType;
        const primaryStr = (primaryJob && primaryJob !== creep.memory.jobType)
            ? ` pri=${statusLabels[primaryJob] ?? primaryJob}`
            : '';

        let extra = '';
        if (tgt) extra += ` ${tgt}`;
        extra += ` ${bodyStr}`;
        if (intStr) extra += intStr;
        if (primaryStr) extra += primaryStr;

        lines.push(
            `${archetype.padEnd(16)} ${name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${jobLabel.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            extra +
            (src ? ` src=${src}` : '')
        );
    }

    let enStr = room ? `en=${room.energyAvailable}/${room.energyCapacityAvailable}` : '';
    if (room) {
        const parts: string[] = [];
        const storage = room.storage;
        if (storage) {
            parts.push(`storage=${storage.store.getUsedCapacity(RESOURCE_ENERGY)}`);
        }
        const containers = room.find(FIND_STRUCTURES).filter(
            s => s.structureType === STRUCTURE_CONTAINER
        ) as StructureContainer[];
        if (containers.length > 0) {
            const containerEnergy = containers
                .map(c => `${c.store.getUsedCapacity(RESOURCE_ENERGY)}`)
                .join('+');
            parts.push(`containers=${containerEnergy}`);
        }
        const links = room.find(FIND_STRUCTURES).filter(
            s => s.structureType === STRUCTURE_LINK
        ) as StructureLink[];
        if (links.length > 0) {
            const linkEnergy = links
                .map(l => `${l.store.getUsedCapacity(RESOURCE_ENERGY)}`)
                .join('+');
            parts.push(`links=${linkEnergy}`);
        }
        if (parts.length > 0) {
            enStr += '  ' + parts.join('  ');
        }
    }

    if (lines.length === 0) {
        console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
        return;
    }

    const fleetSummary = archetypes
        .sort()
        .map(a => `${a}=${counts[a]}`)
        .join('  ');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
    console.log(`  ${fleetSummary}  total=${total}`);
    for (const line of lines) {
        console.log(`  ${line}`);
    }
}

export type DebugConsoleApi = {
    trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
    dumpRemote: (homeRoom: string, remoteRoom: string) => string;
    dumpHome: (homeRoom: string) => string;
};

export function tickAutoDebug(): void {
    const tick = Game.time % 10;
    if (tick === 0){
        console.log(`--- Shard ${Game.shard.name} --- Tick ${Game.time} --- ${new Date().toLocaleTimeString()} --- ${Game.cpu.bucket} bucket --- ${Game.market.credits} credits ---`);
    } else if (tick === 1) {
        for (const room of ownedRooms()) {
            if (room.memory.debug_home) { printHomeCreepStatus(room.name); }
        }
    } else if (tick === 2) {
        for (const room of ownedRooms()) {
            if (room.memory.debug_remotes) { printRemoteCreepStatus(room.name); }
        }
    }
}

export function tickRemoteCreepLog(): void {
    if (debugCreepsLastPrintedAt === undefined ||
        Game.time - debugCreepsLastPrintedAt >= DEBUG_CREEP_INTERVAL) {
        printRemoteCreepStatus();
        debugCreepsLastPrintedAt = Game.time;
    }
}

export function installDebugHelpers(): void {
    if (globalThis.debug) { return; }
    globalThis.debug = {
        trackRemote(homeRoom: string, remoteRoom: string, on?: boolean): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `debug: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.debugCreeps = on ?? !plan.debugCreeps;
            return `debug: trackRemote ${homeRoom} -> ${remoteRoom} = ${plan.debugCreeps}`;
        },
        dumpRemote(homeRoom: string, remoteRoom: string): string {
            printRemoteCreepStatus(homeRoom, remoteRoom);
            return `debug: dumpRemote ${homeRoom} -> ${remoteRoom}`;
        },
        dumpHome(homeRoom: string): string {
            printHomeCreepStatus(homeRoom);
            return `debug: dumpHome ${homeRoom}`;
        }
    };
}
