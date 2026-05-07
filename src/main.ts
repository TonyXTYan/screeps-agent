import * as roleHarvester from './role.harvester';
import * as roleUpgrader from './role.upgrader';
import * as roleBuilder from './role.builder';
import * as roleDoctor from './role.doctor';
import * as roleManual from './role.manual';
import * as creepRoleBalance from './creep.roleBalance';
import * as creepPopulationControl from './creep.populationControl';
import * as creepMemoryManagement from './creep.memoryManagement';
import * as towerBasics from './tower.basics';

export function loop(): void {
    console.log('main: ✅ Current game time is: ' + Game.time + ' -------------------------------');

    const spawn = Game.spawns['Spawn1'];
    const room = spawn.room;

    creepRoleBalance.trySpawn(spawn);
    creepRoleBalance.balanceBuilderUpgrader(room);
    creepRoleBalance.balanceUpgraderHarvester(room);

    towerBasics.run(room);

    creepMemoryManagement.run();
    creepPopulationControl.check();

    console.log('sync test 1');

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { return; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'doctor') { roleDoctor.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }
}
