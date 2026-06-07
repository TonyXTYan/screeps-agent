import * as roleHarvester from './role/harvester';
import * as roleUpgrader from './role/upgrader';
import * as roleBuilder from './role/builder';
import * as rolePatrol from './role/patrol';
import * as roleManual from './role/manual';
import * as creepMemoryManagement from './creep/memoryManagement';
import * as creepJobRunner from './creep/jobRunner';
import * as roomController from './room/controller';
import * as towerBasics from './tower/basics';
import * as memoryAudit from './memoryAudit';
import * as debug from './debug';
import {
    createEmptyRemoteMaintenancePressure,
    markRemoteMaintenanceRefresh,
} from './room/remote/maintenance';
import { findHostiles, isHostile } from './hostileUtils';
import { bodyCost, ensureArchetype, planBodyForArchetype, BODY_BUDGET_RATIO, BODY_MIN_BUDGET } from './creep/capabilities';
import { BUILD_COMMIT } from './env';
import { acquireRenewSpawn, nearestSpawn } from './spawn/renewal';
import { wrapWithProfiler } from './profiler';
import { REMOTE_HOSTILE_EVADE_DISTANCE } from './room/constants';
import { nearestExitTileToRoom } from './creep/movement';

const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const HOME_RENEW_MIN_BODY_COST = 1000;
const HOME_RENEW_START_TTL = 250;
const HOME_RENEW_STOP_TTL = 1300;
const HOME_RENEW_CRITICAL_TTL = 120;
const HOME_RENEW_RECOVERY_STOP_TTL = 350;
// Only stationary in-room workers/haulers benefit from renewal. Static miners and
// mineral miners must stay on their source — pulling them home idles the source and
// ties up the spawn — so they always spawn fresh. Combat/claim creeps are excluded
// elsewhere (CLAIM guard, patrol's own role path) and want full-TTL fresh bodies.
const HOME_RENEWABLE_ARCHETYPES: ReadonlySet<CreepArchetype> = new Set<CreepArchetype>(['worker', 'hauler']);
// Stop renewing a body the room has outgrown: if a fresh creep would be this much
// larger (RCL/extension growth since spawn), let it die and respawn at the new size.
const HOME_RENEW_STALE_BODY_RATIO = 0.8;
const STANDBY_MINER_PARK_MIN_RANGE = 2;
const STANDBY_MINER_PARK_MAX_RANGE = 4;
const DEBUG_PATH_SCAN_INTERVAL = 25;
const DEFAULT_ROLE_PATH_STYLE = {
    fill: 'transparent',
    lineStyle: 'dashed' as const,
    strokeWidth: 0.15,
    opacity: 0.45
};
const ROLE_PATH_COLORS: { [role: string]: string } = {
    remoteMiner: '#f59e0b',
    remoteHauler: '#22d3ee',
    remoteMaintainer: '#34d399',
    remoteScout: '#a78bfa',
    claimer: '#f472b6',
    miner: '#eab308',
    hauler: '#38bdf8',
    worker: '#22c55e',
    doctor: '#ef4444',
    patrol: '#f97316',
    builder: '#22c55e',
    harvester: '#eab308',
    upgrader: '#60a5fa',
    manual: '#f97316'
};
type RemoteMiningConsoleApi = {
    activate: (homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions) => string;
    configure: (homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions) => string;
    pause: (homeRoom: string, remoteRoom: string, ticks?: number) => string;
    disable: (homeRoom: string, remoteRoom: string) => string;
    status: (homeRoom: string, remoteRoom?: string) => string;
};
type RemoteMiningOptions = {
    reserve?: boolean;
    buildRoads?: boolean;
    maintainRoads?: boolean;
    debugPaths?: boolean;
    debugCreeps?: boolean;
};

let debugPathsEnabled = false;
let debugPathsLastScannedAt: number | undefined;
let moveDebugHookInstalled = false;
const hostileRetreatCostCache = new Map<string, { tick: number; matrix: CostMatrix }>();

function detectCodeChange(): boolean {
    const lastCommit = (Memory as { lastBuildCommit?: string }).lastBuildCommit;
    const changed = lastCommit !== BUILD_COMMIT;
    if (changed) {
        const now = new Date().toISOString();
        console.log(`[main] ====== Code change ====== Game.time=${Game.time} (${now}): Last:${lastCommit ?? 'none'} → New:${BUILD_COMMIT}`);
        (Memory as { lastBuildCommit?: string }).lastBuildCommit = BUILD_COMMIT;
    }
    return changed;
}

export function loop(): void {
    wrapWithProfiler(loopBody);
}

function loopBody(): void {
    if (debugPathsLastScannedAt !== undefined && Game.time < debugPathsLastScannedAt) {
        debugPathsLastScannedAt = undefined;
    }
    if (debugPathsLastScannedAt === undefined ||
        Game.time - debugPathsLastScannedAt >= DEBUG_PATH_SCAN_INTERVAL) {
        refreshDebugPathEnabled();
    }
    installConsoleHelpers();
    debug.installDebugHelpers();
    installMoveDebugHook();
    if (Game.cpu.bucket >= 10000) {
        const pixelResult = typeof Game.cpu.generatePixel === 'function' ? Game.cpu.generatePixel() : 'n/a';
        console.log('main: ✅ .time=' + Game.time + ', cpu.bucket=' + Game.cpu.bucket + ', generationPixel=' + pixelResult);
    }

    

    creepMemoryManagement.run();
    if (detectCodeChange() && Game.cpu.bucket >= 0) {
        memoryAudit.runFullAudit();
    }

    const controlledRooms = debug.ownedRooms();
    for (const room of controlledRooms) {
        roomController.run(room);
        towerBasics.run(room);
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        if (creep.memory.remoteRoom) { roomController.assignRemoteCreep(creep); }
        tryRenewStandbyMiner(creep);

        if (creep.memory.role === 'patrol') { rolePatrol.run(creep); continue; }

        if (fleeFromHostiles(creep)) { continue; }
        if (tryRenewHomeCreep(creep)) { continue; }
        if (creepJobRunner.run(creep)) { continue; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }

    debug.tickRemoteCreepLog();
    debug.tickAutoDebug();
}

declare global {
    var remoteMining: RemoteMiningConsoleApi | undefined;
    var debug: {
        trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
        dumpRemote: (homeRoom: string, remoteRoom: string) => string;
        dumpHome: (homeRoom: string) => string;
    } | undefined;
    var runMemoryAudit: () => number;
}

function installConsoleHelpers(): void {
    if (globalThis.remoteMining) { return; }
    globalThis.runMemoryAudit = memoryAudit.runFullAudit;
    globalThis.remoteMining = {
        activate(homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions): string {
            const room = Memory.rooms[homeRoom] ?? (Memory.rooms[homeRoom] = {});
            room.plan = room.plan ?? {};
            room.plan.remoteRooms = room.plan.remoteRooms ?? {};
            room.plan.remoteRooms[remoteRoom] = {
                enabled: true,
                roomName: remoteRoom,
                mode: 'harvest',
                reserve: options?.reserve ?? true,
                buildRoads: options?.buildRoads ?? true,
                maintainRoads: options?.maintainRoads ?? true,
                debugPaths: options?.debugPaths ?? false,
                debugCreeps: options?.debugCreeps ?? false,
                maintenance: createEmptyRemoteMaintenancePressure()
            };
            markRemoteMaintenanceRefresh(room.plan.remoteRooms[remoteRoom], 'setup');
            return `remoteMining: activated ${homeRoom} -> ${remoteRoom}`;
        },
        configure(homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            if (options?.reserve !== undefined) { plan.reserve = options.reserve; }
            if (options?.buildRoads !== undefined) { plan.buildRoads = options.buildRoads; }
            if (options?.maintainRoads !== undefined) { plan.maintainRoads = options.maintainRoads; }
            if (options?.debugPaths !== undefined) { plan.debugPaths = options.debugPaths; }
            if (options?.debugCreeps !== undefined) { plan.debugCreeps = options.debugCreeps; }
            return `remoteMining: configured ${homeRoom} -> ${remoteRoom}`;
        },
        pause(homeRoom: string, remoteRoom: string, ticks: number = 1500): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.manualPauseUntil = Game.time + Math.max(1, ticks);
            return `remoteMining: paused ${homeRoom} -> ${remoteRoom} until ${plan.manualPauseUntil}`;
        },
        disable(homeRoom: string, remoteRoom: string): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.enabled = false;
            return `remoteMining: disabled ${homeRoom} -> ${remoteRoom}`;
        },
        status(homeRoom: string, remoteRoom?: string): string {
            const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};
            if (!remoteRoom) { return JSON.stringify(remotes, null, 2); }
            return JSON.stringify(remotes[remoteRoom] ?? null, null, 2);
        }
    };
}

function installMoveDebugHook(): void {
    if (!debugPathsEnabled) {
        if (!moveDebugHookInstalled) { return; }
        const proto = Creep.prototype as Creep & {
            _baseMoveTo?: (...args: any[]) => number;
        };
        if (proto._baseMoveTo) {
            proto.moveTo = proto._baseMoveTo as Creep['moveTo'];
            delete proto._baseMoveTo;
        }
        moveDebugHookInstalled = false;
        return;
    }
    if (moveDebugHookInstalled) { return; }
    const proto = Creep.prototype as Creep & {
        _baseMoveTo?: (...args: any[]) => number;
    };
    proto._baseMoveTo = proto.moveTo;

    proto.moveTo = function (this: Creep, ...args: any[]): CreepMoveReturnCode {
        const color = debugPathColorForCreep(this);
        if (!color) {
            return proto._baseMoveTo!.apply(this, args as [any, any, any]) as CreepMoveReturnCode;
        }

        const patchedArgs = args.slice();
        const optsIndex = typeof patchedArgs[0] === 'number' && typeof patchedArgs[1] === 'number' ? 2 : 1;
        patchedArgs[optsIndex] = mergeRolePathStyle(patchedArgs[optsIndex] as MoveToOpts | undefined, color);
        return proto._baseMoveTo!.apply(this, patchedArgs as [any, any, any]) as CreepMoveReturnCode;
    } as Creep['moveTo'];
    moveDebugHookInstalled = true;
}

function anyRemoteDebugPathsEnabled(): boolean {
    for (const roomName in Memory.rooms) {
        const remotes = Memory.rooms[roomName]?.plan?.remoteRooms;
        if (!remotes) { continue; }
        for (const remoteName in remotes) {
            const remote = remotes[remoteName];
            if (remote.enabled && remote.debugPaths) { return true; }
        }
    }
    return false;
}

function refreshDebugPathEnabled(): void {
    debugPathsEnabled = anyRemoteDebugPathsEnabled();
    debugPathsLastScannedAt = Game.time;
}

function debugPathColorForCreep(creep: Creep): string | null {
    const homeRoom = creep.memory.homeRoom;
    if (!homeRoom) { return null; }

    const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};
    let enabled = false;
    const assignedRemoteRoom = creep.memory.remoteRoom;
    if (assignedRemoteRoom) {
        const assignedPlan = remotes[assignedRemoteRoom];
        enabled = Boolean(assignedPlan && assignedPlan.enabled && assignedPlan.debugPaths);
    }
    if (!enabled) {
        enabled = Object.keys(remotes).some((roomName) =>
            roomName === creep.room.name &&
            remotes[roomName].enabled &&
            remotes[roomName].debugPaths);
    }
    if (!enabled) { return null; }

    const key = creep.memory.archetype ?? creep.memory.role ?? 'worker';
    return ROLE_PATH_COLORS[key] ?? '#ffffff';
}

function mergeRolePathStyle(opts: MoveToOpts | undefined, color: string): MoveToOpts {
    const current = opts?.visualizePathStyle ?? {};
    return {
        ...(opts ?? {}),
        visualizePathStyle: {
            ...DEFAULT_ROLE_PATH_STYLE,
            ...current,
            stroke: color
        }
    };
}

function fleeFromHostiles(creep: Creep): boolean {
    if (creep.memory.role === 'patrol') { return false; }
    const hostiles = findHostiles(creep.room);
    if (hostiles.length === 0) { return false; }
    const nearbyHostile = hostiles.find(h => creep.pos.getRangeTo(h) <= REMOTE_HOSTILE_EVADE_DISTANCE);
    if (!nearbyHostile) { return false; }

    const emergencyTarget = emergencyHealTarget(creep);
    if (emergencyTarget) {
        creep.say('🩺');
        const healCode = creep.heal(emergencyTarget);
        if (healCode === ERR_NOT_IN_RANGE) {
            creep.rangedHeal(emergencyTarget);
            creep.moveTo(emergencyTarget, { visualizePathStyle: { stroke: '#ff4d4d' } });
        }
        return true;
    }

    emergencyHealWhileRetreating(creep);

    creep.say('😱');
    if (directedRetreatToHomeStep(creep, hostiles)) {
        return true;
    }

    const result = PathFinder.search(
        creep.pos,
        hostiles.map(h => ({ pos: h.pos, range: REMOTE_HOSTILE_EVADE_DISTANCE })),
        { flee: true, maxRooms: 1 }
    );
    if (result.path.length > 0) {
        creep.move(creep.pos.getDirectionTo(result.path[0]));
    } else if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
        creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom), { visualizePathStyle: { stroke: '#ff4d4d' } });
    } else {
        nudgeFromEdge(creep);
    }
    return true;
}

function directedRetreatToHomeStep(creep: Creep, hostiles: Creep[]): boolean {
    const homeRoom = creep.memory.homeRoom;
    if (!homeRoom || creep.room.name === homeRoom) { return false; }
    if (creep.memory.jobType !== 'travelRoom' || creep.memory.jobRoomName !== homeRoom) { return false; }

    const exit = nearestExitTileToRoom(creep, homeRoom);
    if (!exit) { return false; }

    const retreat = PathFinder.search(
        creep.pos,
        [{ pos: exit, range: 0 }],
        {
            maxRooms: 1,
            roomCallback: (roomName) => {
                if (roomName !== creep.room.name) { return false; }
                return cachedHostileRetreatCosts(creep.room, hostiles);
            }
        }
    );
    if (retreat.path.length === 0) { return false; }
    const next = retreat.path[0];
    if (next.getRangeTo(creep.pos) > 1) { return false; }

    creep.move(creep.pos.getDirectionTo(next));
    return true;
}

function cachedHostileRetreatCosts(room: Room, hostiles: Creep[]): CostMatrix {
    const cached = hostileRetreatCostCache.get(room.name);
    if (cached && cached.tick === Game.time) {
        return cached.matrix;
    }

    const matrix = buildHostileRetreatCosts(room, hostiles);
    hostileRetreatCostCache.set(room.name, { tick: Game.time, matrix });
    return matrix;
}

function buildHostileRetreatCosts(room: Room, hostiles: Creep[]): CostMatrix {
    const matrix = new PathFinder.CostMatrix();

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER) { continue; }
        if (structure.structureType === STRUCTURE_RAMPART && (structure as StructureRampart).my) { continue; }
        matrix.set(structure.pos.x, structure.pos.y, 255);
    }

    for (const hostile of hostiles) {
        for (let dx = -REMOTE_HOSTILE_EVADE_DISTANCE; dx <= REMOTE_HOSTILE_EVADE_DISTANCE; dx++) {
            for (let dy = -REMOTE_HOSTILE_EVADE_DISTANCE; dy <= REMOTE_HOSTILE_EVADE_DISTANCE; dy++) {
                const x = hostile.pos.x + dx;
                const y = hostile.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) { continue; }
                if (Math.max(Math.abs(dx), Math.abs(dy)) > REMOTE_HOSTILE_EVADE_DISTANCE) { continue; }
                matrix.set(x, y, 255);
            }
        }
    }

    return matrix;
}

function emergencyHealTarget(creep: Creep): Creep | null {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return null; }
    const injured = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
    });
    if (injured.length === 0) { return null; }

    const emergency = injured.filter((target) =>
        target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO ||
        target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
            filter: isHostile
        }).length > 0);
    if (emergency.length === 0) { return null; }

    return mostCriticalCreep(creep, emergency);
}



function emergencyHealWhileRetreating(creep: Creep): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return; }

    const critical = mostCriticalInRange(creep, 1);
    if (critical) {
        creep.heal(critical);
        return;
    }

    const ranged = mostCriticalInRange(creep, 3);
    if (ranged) {
        creep.rangedHeal(ranged);
    }
}

function mostCriticalInRange(creep: Creep, range: number): Creep | null {
    const injured = creep.pos.findInRange(FIND_MY_CREEPS, range, {
        filter: c => c.hits < c.hitsMax
    });
    if (injured.length === 0) { return null; }

    return mostCriticalCreep(creep, injured);
}

function mostCriticalCreep(creep: Creep, injured: Creep[]): Creep | null {
    if (injured.length === 0) { return null; }
    let best = injured[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of injured) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio ||
            (ratio === bestRatio && missing > bestMissing) ||
            (ratio === bestRatio && missing === bestMissing && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestMissing = missing;
            bestRange = range;
        }
    }
    return best;
}

function nudgeFromEdge(creep: Creep): void {
    if (creep.pos.x === 0 && creep.pos.y === 0) {
        creep.move(BOTTOM_RIGHT);
        return;
    }
    if (creep.pos.x === 0 && creep.pos.y === 49) {
        creep.move(TOP_RIGHT);
        return;
    }
    if (creep.pos.x === 49 && creep.pos.y === 0) {
        creep.move(BOTTOM_LEFT);
        return;
    }
    if (creep.pos.x === 49 && creep.pos.y === 49) {
        creep.move(TOP_LEFT);
        return;
    }
    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
    }
}

function tryRenewHomeCreep(creep: Creep): boolean {
    if (creep.memory.remoteRoom) { return false; }

    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }

    if (creep.body.some(b => b.type === CLAIM)) { return false; }

    const archetype = ensureArchetype(creep);
    if (!HOME_RENEWABLE_ARCHETYPES.has(archetype)) { return false; }

    const currentBodyCost = bodyCost(creep.body.map(b => b.type));
    if (currentBodyCost < HOME_RENEW_MIN_BODY_COST) { return false; }

    const homeRoomName = creep.memory.homeRoom ?? creep.room.name;
    if (creep.room.name !== homeRoomName) { return false; }
    const room = Game.rooms[homeRoomName];
    if (!room) { return false; }

    // Body-staleness guard: budget mirrors the spawn planner (capacity × ratio). If a
    // fresh body would be meaningfully larger, prefer replacement over renew.
    const plannableBudget = Math.max(BODY_MIN_BUDGET, Math.floor(room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const plannableCost = bodyCost(planBodyForArchetype(archetype, plannableBudget));
    if (currentBodyCost < plannableCost * HOME_RENEW_STALE_BODY_RATIO) { return false; }

    const renewBlockedByEconomy =
        room.memory.energyRecoveryActive === true ||
        room.energyAvailable < Math.floor(room.energyCapacityAvailable * 0.9);
    const renewStopTtl = renewBlockedByEconomy ? HOME_RENEW_RECOVERY_STOP_TTL : HOME_RENEW_STOP_TTL;

    // During recovery, only critically low local creeps may start renewing;
    // active recovery renews stop early so creeps return to emergency work.
    if (renewBlockedByEconomy && !creep.memory.renewing && ttl > HOME_RENEW_CRITICAL_TTL) {
        return false;
    }

    if (!creep.memory.renewing && ttl <= HOME_RENEW_START_TTL) {
        creep.memory.renewing = true;
    }
    if (creep.memory.renewing && ttl >= renewStopTtl) {
        creep.memory.renewing = false;
    }
    if (!creep.memory.renewing) { return false; }

    const spawn = acquireRenewSpawn(creep, room);

    if (!spawn) {
        if (ttl <= HOME_RENEW_CRITICAL_TTL) {
            const anySpawn = nearestSpawn(creep, room);
            if (anySpawn && !creep.pos.isNearTo(anySpawn)) {
                creep.moveTo(anySpawn, { range: 1, visualizePathStyle: { stroke: '#f5f57a' } });
            }
            return true;
        }
        creep.memory.renewing = false;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { range: 1, visualizePathStyle: { stroke: '#f5f57a' } });
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        return true;
    }

    creep.memory.renewing = false;
    return false;
}

function tryRenewStandbyMiner(creep: Creep): void {
    if (!creep.memory.remoteStandby) { return; }
    if (creep.memory.assignedSourceId || creep.memory.sourceId) { return; }

    const homeSpawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS) as StructureSpawn | null;
    if (!homeSpawn) { return; }
    parkStandbyMinerAwayFromSpawn(creep, homeSpawn);
}

function parkStandbyMinerAwayFromSpawn(creep: Creep, spawn: StructureSpawn): void {
    const range = creep.pos.getRangeTo(spawn);
    if (range >= STANDBY_MINER_PARK_MIN_RANGE && range <= STANDBY_MINER_PARK_MAX_RANGE) { return; }

    const park = standbyMinerParkingTarget(creep, spawn);
    if (!park) { return; }
    creep.moveTo(park, { reusePath: 6, visualizePathStyle: { stroke: '#d1d5db' } });
}

function standbyMinerParkingTarget(creep: Creep, spawn: StructureSpawn): RoomPosition | null {
    const terrain = creep.room.getTerrain();
    let best: RoomPosition | null = null;
    let bestRange = Infinity;

    for (let dx = -STANDBY_MINER_PARK_MAX_RANGE; dx <= STANDBY_MINER_PARK_MAX_RANGE; dx++) {
        for (let dy = -STANDBY_MINER_PARK_MAX_RANGE; dy <= STANDBY_MINER_PARK_MAX_RANGE; dy++) {
            const x = spawn.pos.x + dx;
            const y = spawn.pos.y + dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) { continue; }

            const rangeFromSpawn = Math.max(Math.abs(dx), Math.abs(dy));
            if (rangeFromSpawn < STANDBY_MINER_PARK_MIN_RANGE || rangeFromSpawn > STANDBY_MINER_PARK_MAX_RANGE) { continue; }
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

            const pos = new RoomPosition(x, y, creep.room.name);
            if (pos.lookFor(LOOK_CREEPS).some((other) => other.id !== creep.id)) { continue; }
            const blocked = pos.lookFor(LOOK_STRUCTURES).some((structure) =>
                structure.structureType !== STRUCTURE_ROAD &&
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART);
            if (blocked) { continue; }

            const rangeFromCreep = creep.pos.getRangeTo(pos);
            if (rangeFromCreep < bestRange) {
                best = pos;
                bestRange = rangeFromCreep;
            }
        }
    }

    return best;
}
