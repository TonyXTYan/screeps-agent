import { bodyCost, ensureArchetype, getCreepCapabilities, planBodyForArchetype } from './creep.capabilities';
import { clearJob } from './creep.jobRunner';
import { getRoomStructures, RoomStructureCache } from './room.structures';
import { repairStructureFilter } from './role.doctor';

interface RoomControllerContext {
    room: Room;
    structures: RoomStructureCache;
    sources: Source[];
    mineral: Mineral | undefined;
    creeps: Creep[];
    droppedEnergy: Resource<RESOURCE_ENERGY>[];
    droppedResources: Resource<ResourceConstant>[];
    tombstones: Tombstone[];
    ruins: Ruin[];
    constructionSites: ConstructionSite[];
    repairTargets: AnyStructure[];
    injuredCreeps: Creep[];
}

interface SpawnRequest {
    archetype: CreepArchetype;
    reason: string;
    remoteRoom?: string;
    remoteMode?: RemoteRoomMode;
}

interface ResourceTarget {
    target: WithdrawStructure;
    resource: ResourceConstant;
}

const TOWER_RESERVE_RATIO = 0.7;
const MINERAL_MINING_STORAGE_FLOOR = 3000;
const MINERAL_WORK_DEMAND = 5;
const LINK_TRANSFER_THRESHOLD = 400;

export function run(room: Room): void {
    const context = buildContext(room);

    initialiseRoomPlan(room);
    rememberRcl(room);
    rememberLoad(context);
    runLinks(context);
    reportPassiveInfrastructure(context);
    assignJobs(context);
    runSpawnPlanner(context);
}

export function assignRemoteCreep(creep: Creep): boolean {
    const archetype = ensureArchetype(creep);
    if (archetype !== 'remoteMiner' && archetype !== 'remoteHauler' && archetype !== 'claimer') { return false; }

    const homeRoom = creep.memory.homeRoom;
    const remoteRoom = creep.memory.remoteRoom;
    if (!homeRoom || !remoteRoom) { return false; }

    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (archetype === 'remoteHauler' && energyUsed > 0) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }

        const structures = getRoomStructures(creep.room);
        const sink = structures.storage ?? closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        setJob(creep, 'depositEnergy', sink);
        return true;
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    if (archetype === 'claimer' && creep.room.controller) {
        const jobType: CreepJobType = creep.memory.remoteMode === 'reserve' ? 'reserveController' : 'claimController';
        setJob(creep, jobType, creep.room.controller);
        return true;
    }

    if (archetype === 'remoteMiner') {
        const source = closest(creep, creep.room.find(FIND_SOURCES));
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }

    if (archetype === 'remoteHauler') {
        const droppedEnergy = closest(creep, creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
        }) as Resource<RESOURCE_ENERGY>[]);
        if (droppedEnergy) {
            setJob(creep, 'pickupEnergy', droppedEnergy);
            return true;
        }

        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                (structure as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0
        }) as StructureContainer[];
        const container = closest(creep, containers);
        if (container) {
            setJob(creep, 'withdrawEnergy', container);
            return true;
        }
    }

    setTravelJob(creep, homeRoom);
    return true;
}

function buildContext(room: Room): RoomControllerContext {
    const structures = getRoomStructures(room);
    const sources = room.find(FIND_SOURCES);
    const minerals = room.find(FIND_MINERALS);
    const creeps = room.find(FIND_MY_CREEPS);
    const droppedResources = room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.amount > 0
    }) as Resource<ResourceConstant>[];
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
    }) as Resource<RESOURCE_ENERGY>[];
    const tombstones = room.find(FIND_TOMBSTONES, {
        filter: (tombstone) => totalStoredResources(tombstone.store) > 0
    });
    const ruins = room.find(FIND_RUINS, {
        filter: (ruin) => totalStoredResources(ruin.store) > 0
    });
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const repairTargets = room.find(FIND_STRUCTURES, { filter: repairStructureFilter });
    const injuredCreeps = room.find(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });

    return {
        room,
        structures,
        sources,
        mineral: minerals[0],
        creeps,
        droppedEnergy,
        droppedResources,
        tombstones,
        ruins,
        constructionSites,
        repairTargets,
        injuredCreeps
    };
}

function initialiseRoomPlan(room: Room): void {
    if (!room.memory.plan) {
        room.memory.plan = {};
    }
    if (!room.memory.plan.remoteRooms) {
        room.memory.plan.remoteRooms = {};
    }
    if (!room.memory.plan.claimTargets) {
        room.memory.plan.claimTargets = [];
    }
}

function rememberRcl(room: Room): void {
    const rcl = room.controller?.level ?? 0;
    if (room.memory.plan && room.memory.plan.lastRcl !== rcl) {
        console.log('room.controller: ' + room.name + ' reached or observed RCL ' + rcl);
        room.memory.plan.lastRcl = rcl;
    }
}

function rememberLoad(context: RoomControllerContext): void {
    const capacities = measureCapabilities(context.creeps);
    const spawnEnergyDeficit = sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
    const towerEnergyDeficit = sumFreeEnergy(context.structures.towers.filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO));
    const mineralReady = mineralReadyToMine(context);
    const salvageResources = totalStoredTargets(context.tombstones) +
        totalStoredTargets(context.ruins) +
        context.droppedResources.reduce((total, resource) => total + resource.amount, 0);

    context.room.memory.load = {
        updatedAt: Game.time,
        rcl: context.room.controller?.level ?? 0,
        energyAvailable: context.room.energyAvailable,
        energyCapacity: context.room.energyCapacityAvailable,
        storedEnergy: storedEnergy(context),
        sourceCount: context.sources.length,
        minerWork: capacities.minerWork,
        minerWorkDemand: totalSourceWorkDemand(context.sources),
        haulerCapacity: capacities.haulerCapacity,
        haulerCapacityDemand: desiredHaulerCapacity(context),
        workerWork: capacities.workerWork,
        workerWorkDemand: desiredWorkerWork(context),
        spawnEnergyDeficit,
        towerEnergyDeficit,
        constructionSites: context.constructionSites.length,
        repairTargets: context.repairTargets.length,
        mineralReady,
        salvageResources,
        mineralMinerWork: capacities.mineralMinerWork,
        mineralMinerWorkDemand: mineralReady ? MINERAL_WORK_DEMAND : 0
    };
}

function runLinks(context: RoomControllerContext): void {
    const receivers = linkReceivers(context);
    if (receivers.length === 0) { return; }

    const senders = [
        ...context.structures.links.source,
        ...context.structures.links.hub.filter((link) => spawnEnergyPressure(context) === 0),
        ...context.structures.links.other
    ];

    for (const link of senders) {
        if (link.cooldown > 0) { continue; }
        if (link.store.getUsedCapacity(RESOURCE_ENERGY) < LINK_TRANSFER_THRESHOLD) { continue; }

        const receiver = receivers.find((candidate) =>
            candidate.id !== link.id &&
            candidate.store.getFreeCapacity(RESOURCE_ENERGY) >= LINK_TRANSFER_THRESHOLD);
        if (!receiver) { continue; }

        const code = link.transferEnergy(receiver);
        if (code !== OK && Game.time % 25 === 0) {
            console.log('room.controller: source link transfer failed in ' + context.room.name + ' with code ' + code);
        }
    }
}

function reportPassiveInfrastructure(context: RoomControllerContext): void {
    if (Game.time % 100 !== 0) { return; }

    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const labMinerals = context.structures.labs
        .map((lab) => lab.mineralType ? lab.mineralType + ':' + lab.store.getUsedCapacity(lab.mineralType) : 'empty')
        .join(',');

    console.log('room.controller: ' + context.room.name +
        ' RCL ' + (context.room.controller?.level ?? 0) +
        ' stored=' + storedEnergy(context) +
        ' terminalEnergy=' + terminalEnergy +
        ' labs=' + (labMinerals || 'none') +
        ' remotes=' + Object.keys(context.room.memory.plan?.remoteRooms ?? {}).length);
}

function assignJobs(context: RoomControllerContext): void {
    const sourceAssignments = sourceAssignmentCounts(context);

    for (const creep of context.creeps) {
        if (creep.spawning) { continue; }
        ensureArchetype(creep);
        assignJob(context, creep, sourceAssignments);
    }
}

function assignJob(context: RoomControllerContext, creep: Creep, sourceAssignments: { [sourceId: string]: number }): void {
    const capabilities = getCreepCapabilities(creep);
    const archetype = ensureArchetype(creep);
    const energyUsed = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalUsed = creep.store.getUsedCapacity();
    const hasMinerals = totalUsed > energyUsed;

    if (hasMinerals) {
        const resourceSink = resourceDepositTarget(context);
        if (resourceSink) {
            setResourceJob(creep, 'depositResource', resourceSink, firstStoredResource(creep.store));
            return;
        }
    }

    if (capabilities.heal > 0 && context.injuredCreeps.length > 0) {
        setJob(creep, 'heal', closest(creep, context.injuredCreeps));
        return;
    }

    if (energyUsed > 0) {
        assignEnergySpendingJob(context, creep, archetype, capabilities);
        return;
    }

    if (archetype === 'miner' || archetype === 'remoteMiner') {
        const source = assignedSource(creep, context.sources, sourceAssignments);
        if (source && capabilities.harvest > 0) {
            setJob(creep, 'harvestSource', source);
            return;
        }
    }

    if (archetype === 'mineralMiner' && capabilities.harvest > 0 && context.mineral && mineralReadyToMine(context)) {
        setJob(creep, 'mineMineral', context.mineral);
        return;
    }

    if (capabilities.haul > 0) {
        const salvage = salvageWithdrawalTarget(context, creep);
        if (salvage) {
            setResourceJob(creep, 'withdrawResource', salvage.target, salvage.resource);
            return;
        }

        const dropped = closest(creep, context.droppedResources);
        if (dropped) {
            setResourceJob(creep, 'pickupResource', dropped, dropped.resourceType);
            return;
        }

        const withdrawalTarget = energyWithdrawalTarget(context, creep, archetype);
        if (withdrawalTarget) {
            setJob(creep, 'withdrawEnergy', withdrawalTarget);
            return;
        }
    }

    if (capabilities.harvest > 0) {
        const source = assignedSource(creep, context.sources, sourceAssignments);
        if (source) {
            setJob(creep, 'harvestSource', source);
            return;
        }
    }

    if (capabilities.reserve > 0 && context.room.controller) {
        setJob(creep, 'reserveController', context.room.controller);
        return;
    }

    setJob(creep, 'idle', context.structures.storage ?? context.structures.spawns[0]);
}

function assignEnergySpendingJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: ReturnType<typeof getCreepCapabilities>
): void {
    const spawnTarget = closest(creep, refillSpawnTargets(context));
    if (spawnTarget) {
        setJob(creep, 'refillSpawn', spawnTarget);
        return;
    }

    const towerTarget = closest(creep, refillTowerTargets(context));
    if (towerTarget) {
        setJob(creep, 'refillTower', towerTarget);
        return;
    }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const sink = context.structures.storage ?? context.structures.terminal ?? context.structures.containers[0];
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
            return;
        }
    }

    if (capabilities.build > 0 && context.constructionSites.length > 0) {
        setJob(creep, 'build', bestConstructionSite(creep, context.constructionSites));
        return;
    }

    if (capabilities.repair > 0 && context.repairTargets.length > 0 && shouldRepairWithCreeps(context)) {
        setJob(creep, 'repair', closest(creep, context.repairTargets));
        return;
    }

    if (capabilities.upgrade > 0 && context.room.controller) {
        setJob(creep, 'upgrade', context.room.controller);
        return;
    }

    const sink = context.structures.storage ?? context.structures.terminal ?? context.structures.containers[0];
    setJob(creep, 'depositEnergy', sink);
}

function runSpawnPlanner(context: RoomControllerContext): void {
    const spawn = context.structures.spawns.find((candidate) => !candidate.spawning);
    if (!spawn) { return; }

    const request = chooseSpawnRequest(context);
    if (!request) { return; }

    const body = planBodyForArchetype(request.archetype, context.room.energyAvailable);
    if (body.length === 0) {
        if (Game.time % 25 === 0) {
            console.log('room.controller: waiting for energy to spawn ' + request.archetype + ' for ' + request.reason);
        }
        return;
    }

    const cost = bodyCost(body);
    if (cost > context.room.energyAvailable) { return; }

    const name = request.archetype + '-' + Game.time;
    const role = legacyRoleForArchetype(request.archetype);
    const code = spawn.spawnCreep(body, name, {
        memory: {
            archetype: request.archetype,
            role,
            homeRoom: context.room.name,
            remoteRoom: request.remoteRoom,
            remoteMode: request.remoteMode
        }
    });

    if (code === OK) {
        console.log('room.controller: spawning ' + name + ' for ' + request.reason + ' cost=' + cost);
    } else if (code !== ERR_BUSY && Game.time % 25 === 0) {
        console.log('room.controller: spawn request for ' + request.archetype + ' failed with code ' + code);
    }
}

function chooseSpawnRequest(context: RoomControllerContext): SpawnRequest | null {
    const capacities = measureCapabilities(context.creeps);
    const minerWorkDemand = totalSourceWorkDemand(context.sources);
    const haulerCapacityDemand = desiredHaulerCapacity(context);
    const workerWorkDemand = desiredWorkerWork(context);

    if (context.creeps.length === 0) {
        return { archetype: 'worker', reason: 'emergency recovery' };
    }

    if (capacities.minerWork < minerWorkDemand) {
        return { archetype: 'miner', reason: 'source harvest deficit ' + capacities.minerWork + '/' + minerWorkDemand };
    }

    if (capacities.haulerCapacity < haulerCapacityDemand) {
        return { archetype: 'hauler', reason: 'haul deficit ' + capacities.haulerCapacity + '/' + haulerCapacityDemand };
    }

    if (capacities.heal === 0 && context.room.energyAvailable >= 500) {
        return { archetype: 'doctor', reason: 'no heal-capable creep' };
    }

    if (capacities.workerWork < workerWorkDemand) {
        return { archetype: 'worker', reason: 'worker deficit ' + capacities.workerWork + '/' + workerWorkDemand };
    }

    if (mineralReadyToMine(context) && capacities.mineralMinerWork < MINERAL_WORK_DEMAND) {
        return { archetype: 'mineralMiner', reason: 'passive mineral extraction' };
    }

    const claimTargets = context.room.memory.plan?.claimTargets ?? [];
    if (claimTargets.length > 0 && capacities.claim === 0) {
        return { archetype: 'claimer', reason: 'configured claim target ' + claimTargets[0], remoteRoom: claimTargets[0], remoteMode: 'claim' };
    }

    return remoteSpawnRequest(context, capacities);
}

function remoteSpawnRequest(
    context: RoomControllerContext,
    capacities: ReturnType<typeof measureCapabilities>
): SpawnRequest | null {
    const remoteRooms = context.room.memory.plan?.remoteRooms ?? {};
    for (const roomName in remoteRooms) {
        const remote = remoteRooms[roomName];
        if (!remote.enabled) { continue; }
        if (remote.dangerUntil && remote.dangerUntil > Game.time) { continue; }
        if (remote.mode === 'harvest' && capacities.remoteMinerWork === 0) {
            return { archetype: 'remoteMiner', reason: 'configured remote harvest ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
        }
        if (remote.mode === 'harvest' && capacities.remoteHaulerCapacity === 0) {
            return { archetype: 'remoteHauler', reason: 'configured remote haul ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
        }
        if ((remote.mode === 'reserve' || remote.mode === 'claim') && capacities.claim === 0) {
            return { archetype: 'claimer', reason: 'configured remote ' + remote.mode + ' ' + roomName, remoteRoom: roomName, remoteMode: remote.mode };
        }
    }

    return null;
}

function measureCapabilities(creeps: Creep[]): {
    minerWork: number;
    haulerCapacity: number;
    workerWork: number;
    heal: number;
    claim: number;
    mineralMinerWork: number;
    remoteMinerWork: number;
    remoteHaulerCapacity: number;
} {
    let minerWork = 0;
    let haulerCapacity = 0;
    let workerWork = 0;
    let heal = 0;
    let claim = 0;
    let mineralMinerWork = 0;
    let remoteMinerWork = 0;
    let remoteHaulerCapacity = 0;

    for (const creep of creeps) {
        if (creep.spawning) { continue; }
        const archetype = ensureArchetype(creep);
        const capabilities = getCreepCapabilities(creep);

        if (archetype === 'miner') { minerWork += capabilities.harvest; }
        else if (archetype === 'hauler') { haulerCapacity += capabilities.haul; }
        else if (archetype === 'mineralMiner') { mineralMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteMiner') { remoteMinerWork += capabilities.harvest; }
        else if (archetype === 'remoteHauler') { remoteHaulerCapacity += capabilities.haul; }
        else { workerWork += capabilities.work; }

        heal += capabilities.heal;
        claim += capabilities.claim;
    }

    return {
        minerWork,
        haulerCapacity,
        workerWork,
        heal,
        claim,
        mineralMinerWork,
        remoteMinerWork,
        remoteHaulerCapacity
    };
}

function desiredHaulerCapacity(context: RoomControllerContext): number {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 3 ? 300 : 0;
    return context.sources.length * base + rclBonus + salvageBonus;
}

function desiredWorkerWork(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (context.constructionSites.length > 0) {
        return Math.min(12, 4 + context.constructionSites.length);
    }
    if (rcl >= 8) { return 8; }
    if (rcl >= 7) { return 6; }
    return 4;
}

function refillSpawnTargets(context: RoomControllerContext): EnergyStructure[] {
    return [...context.structures.spawns, ...context.structures.extensions]
        .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
}

function refillTowerTargets(context: RoomControllerContext): EnergyStructure[] {
    return context.structures.towers
        .filter((tower) => towerEnergyRatio(tower) < TOWER_RESERVE_RATIO);
}

function salvageWithdrawalTarget(context: RoomControllerContext, creep: Creep): ResourceTarget | null {
    const targets: WithdrawStructure[] = [...context.tombstones, ...context.ruins];
    let best: ResourceTarget | null = null;
    let bestRange = Infinity;

    for (const target of targets) {
        const resource = firstStoredResource(target.store);
        if (!resource) { continue; }

        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = { target, resource };
            bestRange = range;
        }
    }

    return best;
}

function resourceDepositTarget(context: RoomControllerContext): StructureTerminal | StructureStorage | StructureContainer | null {
    if (context.structures.terminal && context.structures.terminal.store.getFreeCapacity() > 0) {
        return context.structures.terminal;
    }
    if (context.structures.storage && context.structures.storage.store.getFreeCapacity() > 0) {
        return context.structures.storage;
    }
    return context.structures.containers.find((container) => container.store.getFreeCapacity() > 0) ?? null;
}

function energyWithdrawalTarget(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype
): StructureContainer | StructureStorage | StructureTerminal | StructureLink | null {
    const sourceContainers = context.structures.containers
        .filter((container) => container.store.getUsedCapacity(RESOURCE_ENERGY) >= Math.min(200, creep.store.getFreeCapacity(RESOURCE_ENERGY)));
    const sourceLinks = context.structures.links.source
        .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0);

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const localDemandLinks = spawnEnergyPressure(context) > 0
            ? [...context.structures.links.sink, ...context.structures.links.hub]
                .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
            : [];
        return closest(creep, [...localDemandLinks, ...sourceContainers, ...sourceLinks]);
    }

    const controllerOrHubLink = closest(creep, [...context.structures.links.controller, ...context.structures.links.hub]
        .filter((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) > 0));
    if (controllerOrHubLink) { return controllerOrHubLink; }

    if (context.structures.storage && context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return context.structures.storage;
    }

    return closest(creep, [...sourceContainers, ...sourceLinks]);
}

function linkReceivers(context: RoomControllerContext): StructureLink[] {
    const receivers: StructureLink[] = [];
    const spawnPressure = spawnEnergyPressure(context);
    const controllerNeedsEnergy = context.room.controller !== undefined &&
        context.structures.links.controller.some((link) => link.store.getUsedCapacity(RESOURCE_ENERGY) < 400);

    if (spawnPressure > 0) {
        receivers.push(...context.structures.links.sink, ...context.structures.links.hub);
    }

    if (controllerNeedsEnergy) {
        receivers.push(...context.structures.links.controller);
    }

    receivers.push(...context.structures.links.hub, ...context.structures.links.controller);
    return uniqueLinks(receivers);
}

function uniqueLinks(links: StructureLink[]): StructureLink[] {
    const seen: { [id: string]: boolean } = {};
    const result: StructureLink[] = [];
    for (const link of links) {
        if (seen[link.id]) { continue; }
        seen[link.id] = true;
        result.push(link);
    }
    return result;
}

function spawnEnergyPressure(context: RoomControllerContext): number {
    return sumFreeEnergy([...context.structures.spawns, ...context.structures.extensions]);
}

function totalSourceWorkDemand(sources: Source[]): number {
    let demand = 0;
    for (const source of sources) {
        demand += sourceWorkDemand(source);
    }
    return demand;
}

function sourceWorkDemand(source: Source): number {
    return Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
}

function assignedSource(creep: Creep, sources: Source[], counts: { [sourceId: string]: number }): Source | null {
    if (sources.length === 0) { return null; }

    if (creep.memory.sourceId) {
        const current = Game.getObjectById<Source>(creep.memory.sourceId as Id<Source>);
        if (current) { return current; }
    }

    let best = sources[0];
    let bestCount = counts[best.id] ?? 0;
    for (const source of sources) {
        const count = counts[source.id] ?? 0;
        if (count < bestCount) {
            best = source;
            bestCount = count;
        }
    }

    creep.memory.sourceId = best.id;
    counts[best.id] = (counts[best.id] ?? 0) + 1;
    return best;
}

function sourceAssignmentCounts(context: RoomControllerContext): { [sourceId: string]: number } {
    const counts: { [sourceId: string]: number } = {};
    for (const source of context.sources) {
        counts[source.id] = 0;
    }

    for (const creep of context.creeps) {
        if (creep.spawning || !creep.memory.sourceId) { continue; }
        counts[creep.memory.sourceId] = (counts[creep.memory.sourceId] ?? 0) + 1;
    }

    return counts;
}

function bestConstructionSite(creep: Creep, sites: ConstructionSite[]): ConstructionSite {
    let best = sites[0];
    let bestPriority = constructionPriority(best);
    let bestRange = creep.pos.getRangeTo(best);

    for (const site of sites) {
        const priority = constructionPriority(site);
        const range = creep.pos.getRangeTo(site);
        if (priority < bestPriority || (priority === bestPriority && range < bestRange)) {
            best = site;
            bestPriority = priority;
            bestRange = range;
        }
    }

    return best;
}

function constructionPriority(site: ConstructionSite): number {
    if (site.structureType === STRUCTURE_TOWER) { return 1; }
    if (site.structureType === STRUCTURE_SPAWN) { return 2; }
    if (site.structureType === STRUCTURE_EXTENSION) { return 3; }
    if (site.structureType === STRUCTURE_STORAGE) { return 4; }
    if (site.structureType === STRUCTURE_LINK) { return 5; }
    if (site.structureType === STRUCTURE_TERMINAL) { return 6; }
    if (site.structureType === STRUCTURE_LAB) { return 7; }
    if (site.structureType === STRUCTURE_EXTRACTOR) { return 8; }
    if (site.structureType === STRUCTURE_CONTAINER) { return 9; }
    if (site.structureType === STRUCTURE_ROAD) { return 10; }
    if (site.structureType === STRUCTURE_RAMPART) { return 11; }
    if (site.structureType === STRUCTURE_WALL) { return 12; }
    return 20;
}

function shouldRepairWithCreeps(context: RoomControllerContext): boolean {
    if (context.constructionSites.length === 0) { return true; }
    if (!context.structures.storage) { return true; }
    return context.structures.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 5000;
}

function mineralReadyToMine(context: RoomControllerContext): boolean {
    if (!context.structures.extractor || !context.mineral || context.mineral.mineralAmount === 0) { return false; }
    if (!context.structures.storage && !context.structures.terminal) { return false; }
    return storedEnergy(context) >= MINERAL_MINING_STORAGE_FLOOR;
}

function totalStoredTargets(targets: Array<Tombstone | Ruin>): number {
    let total = 0;
    for (const target of targets) {
        total += totalStoredResources(target.store);
    }
    return total;
}

function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }
    return total;
}

function firstStoredResource(store: StoreDefinition): ResourceConstant | null {
    let fallback: ResourceConstant | null = null;
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (store.getUsedCapacity(resource) <= 0) { continue; }
        if (resource !== RESOURCE_ENERGY) { return resource; }
        fallback = resource;
    }
    return fallback;
}

function storedEnergy(context: RoomControllerContext): number {
    const storageEnergy = context.structures.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = context.structures.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    return storageEnergy + terminalEnergy;
}

function sumFreeEnergy(structures: EnergyStructure[]): number {
    let total = 0;
    for (const structure of structures) {
        total += structure.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    return total;
}

function towerEnergyRatio(tower: StructureTower): number {
    return tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
}

function setJob(creep: Creep, jobType: CreepJobType, target: (RoomObject & { id: string }) | undefined | null): void {
    if (!target) {
        clearJob(creep);
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setTravelJob(creep: Creep, roomName: string): void {
    creep.memory.jobType = 'travelRoom';
    creep.memory.jobTargetId = undefined;
    creep.memory.jobRoomName = roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = undefined;
}

function setResourceJob(
    creep: Creep,
    jobType: CreepJobType,
    target: (RoomObject & { id: string }) | undefined | null,
    resource: ResourceConstant | null
): void {
    if (!target || !resource) {
        clearJob(creep);
        return;
    }

    creep.memory.jobType = jobType;
    creep.memory.jobTargetId = target.id;
    creep.memory.jobRoomName = target.pos.roomName;
    creep.memory.jobAssignedAt = Game.time;
    creep.memory.jobResourceType = resource;
}

function closest<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }
    return best;
}

function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'doctor') { return 'doctor'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner') { return 'harvester'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}
