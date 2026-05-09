import * as roleHarvester from './role.harvester';
import * as roleUpgrader from './role.upgrader';
import * as roleBuilder from './role.builder';
import * as roleDoctor from './role.doctor';
import * as roleDefender from './role.defender';
import * as roleManual from './role.manual';
import * as creepMemoryManagement from './creep.memoryManagement';
import * as creepJobRunner from './creep.jobRunner';
import * as populationControl from './creep.populationControl';
import * as roomController from './room.controller';
import * as towerBasics from './tower.basics';

const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;
const STANDBY_MINER_RENEW_THRESHOLD = 1450;

export function loop(): void {
    installConsoleHelpers();
    console.log('main: ✅ Current game time is: ' + Game.time + ' -------------------------------');

    creepMemoryManagement.run();

    const controlledRooms = ownedRooms();
    for (const room of controlledRooms) {
        populationControl.checkDefenders(room); // runs before roomController to win the spawn slot
        roomController.run(room);
        towerBasics.run(room);
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        roomController.assignRemoteCreep(creep);
        tryRenewStandbyMiner(creep);

        // Defenders must run before the job runner — they get misclassified as 'worker'
        // archetype and would receive economic jobs that bypass their combat behavior.
        if (creep.memory.role === 'defender') { roleDefender.run(creep); continue; }

        if (fleeFromHostiles(creep)) { continue; }
        if (creepJobRunner.run(creep)) { continue; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'doctor') { roleDoctor.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }
}

declare const globalThis: {
    remoteMining?: {
        activate: (homeRoom: string, remoteRoom: string, options?: {
            reserve?: boolean;
            buildRoads?: boolean;
            maintainRoads?: boolean;
        }) => string;
        pause: (homeRoom: string, remoteRoom: string, ticks?: number) => string;
        disable: (homeRoom: string, remoteRoom: string) => string;
        status: (homeRoom: string, remoteRoom?: string) => string;
    };
};

function installConsoleHelpers(): void {
    if (globalThis.remoteMining) { return; }
    globalThis.remoteMining = {
        activate(homeRoom: string, remoteRoom: string, options?: { reserve?: boolean; buildRoads?: boolean; maintainRoads?: boolean }): string {
            const room = Memory.rooms[homeRoom] ?? (Memory.rooms[homeRoom] = {});
            room.plan = room.plan ?? {};
            room.plan.remoteRooms = room.plan.remoteRooms ?? {};
            room.plan.remoteRooms[remoteRoom] = {
                enabled: true,
                roomName: remoteRoom,
                mode: 'harvest',
                reserve: options?.reserve ?? true,
                buildRoads: options?.buildRoads ?? true,
                maintainRoads: options?.maintainRoads ?? true
            };
            return `remoteMining: activated ${homeRoom} -> ${remoteRoom}`;
        },
        pause(homeRoom: string, remoteRoom: string, ticks: number = 1500): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.dangerUntil = Game.time + Math.max(1, ticks);
            return `remoteMining: paused ${homeRoom} -> ${remoteRoom} until ${plan.dangerUntil}`;
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

function fleeFromHostiles(creep: Creep): boolean {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) { return false; }
    const nearbyHostile = hostiles.find(h => creep.pos.getRangeTo(h) <= 5);
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
    const result = PathFinder.search(
        creep.pos,
        hostiles.map(h => ({ pos: h.pos, range: 5 })),
        { flee: true, maxRooms: 1 }
    );
    if (result.path.length > 0) {
        creep.move(creep.pos.getDirectionTo(result.path[0]));
    }
    return true;
}

function emergencyHealTarget(creep: Creep): Creep | null {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return null; }
    const injured = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
    });
    if (injured.length === 0) { return null; }

    const emergency = injured.filter((target) =>
        target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO ||
        target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS).length > 0);
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

function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}

function tryRenewStandbyMiner(creep: Creep): void {
    if (creep.memory.minerDuty !== 'standby') { return; }
    if (!creep.ticksToLive || creep.ticksToLive >= STANDBY_MINER_RENEW_THRESHOLD) { return; }

    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
        filter: (s) => !s.spawning
    }) as StructureSpawn | null;
    if (!spawn) { return; }

    if (creep.pos.isNearTo(spawn)) {
        spawn.renewCreep(creep);
        return;
    }

    creep.moveTo(spawn, { visualizePathStyle: { stroke: '#fafafa' } });
}
