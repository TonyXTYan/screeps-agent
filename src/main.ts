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
import * as memoryAudit from './memoryAudit';
import * as debug from './debug';
import { detectCodeChange } from './bootstrap/codeChange';
import { installConsoleHelpers } from './bootstrap/consoleApi';
import { fleeFromHostiles } from './combat/flee';
import { maintainMoveDebugHook } from './debug/pathVisuals';
import { tryRenewHomeCreep, tryRenewStandbyMiner } from './creeps/renewal';

export function loop(): void {
    maintainMoveDebugHook();
    installConsoleHelpers();
    debug.installDebugHelpers();
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
        populationControl.checkDefenders(room); // runs before roomController to win the spawn slot
        roomController.run(room);
        towerBasics.run(room);
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        if (creep.memory.remoteRoom) { roomController.assignRemoteCreep(creep); }
        tryRenewStandbyMiner(creep);

        // Defenders must run before the job runner — they get misclassified as 'worker'
        // archetype and would receive economic jobs that bypass their combat behavior.
        if (creep.memory.role === 'defender') { roleDefender.run(creep); continue; }

        if (fleeFromHostiles(creep)) { continue; }
        if (tryRenewHomeCreep(creep)) { continue; }
        if (creepJobRunner.run(creep)) { continue; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'doctor') { roleDoctor.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }

    debug.tickRemoteCreepLog();
    debug.tickAutoDebug();
}
