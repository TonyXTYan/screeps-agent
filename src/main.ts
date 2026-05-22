import * as roleHarvester from './creeps/roles/harvester';
import * as roleUpgrader from './creeps/roles/upgrader';
import * as roleBuilder from './creeps/roles/builder';
import * as roleDoctor from './creeps/roles/doctor';
import * as roleDefender from './combat/defender';
import * as roleManual from './creeps/roles/manual';
import * as creepMemoryManagement from './creeps/memory';
import * as creepJobRunner from './jobs/runner';
import * as populationControl from './creeps/population';
import * as roomController from './room/controller';
import * as towerBasics from './tower/basics';
import * as memoryAudit from './audit/memory';
import * as debug from './debug/index';
import { installConsoleHelpers } from './console/api';
import { installMoveDebugHook, refreshDebugPathScan } from './debug/paths';
import { fleeFromHostiles } from './combat/flee';
import { tryRenewHomeCreep } from './renewal/home';
import { tryRenewStandbyMiner } from './renewal/standby';
import { BUILD_COMMIT } from './env';

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
    refreshDebugPathScan();
    installConsoleHelpers(memoryAudit.runFullAudit);
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
        populationControl.checkDefenders(room);
        roomController.run(room);
        towerBasics.run(room);
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        if (creep.memory.remoteRoom) { roomController.assignRemoteCreep(creep); }
        tryRenewStandbyMiner(creep);

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
