import * as creepRoleBalance from './creep.roleBalance';

export function check(): void {
    const specification = creepRoleBalance.specification;
    const spawn = Game.spawns['Spawn1'];
    const room = spawn.room;

    const totalEnergyAvailable = creepRoleBalance.countEnergy(spawn).available;
    creepRoleBalance.balanceSpec(specification['harvester'], totalEnergyAvailable);

    const roles = creepRoleBalance.creepsType(room);
    const harvesters = roles.harvester;
    const builders = roles.builder;
    const upgraders = roles.upgrader;
    const doctors = roles.doctor;

    console.log('creep.populationControl: Have harvester: ' + harvesters.length
        + ', builders: ' + builders.length
        + ', upgraders: ' + upgraders.length
        + ', doctors: ' + doctors.length);

    const energy = Math.max(totalEnergyAvailable, 300);

    if (harvesters.length < 2) {
        const newName = 'Harvester' + Game.time;
        const o = spawn.spawnCreep(creepRoleBalance.balanceSpec(specification.harvester, energy), newName, { memory: { role: 'harvester' } });
        console.log('creep.populationControl: Spawning new harvester: ' + newName + ', returned: ' + o);
    }

    if (builders.length < 1) {
        const newName = 'Builder' + Game.time;
        const o = spawn.spawnCreep(creepRoleBalance.balanceSpec(specification.builder, energy), newName, { memory: { role: 'builder' } });
        console.log('creep.populationControl: Spawning new builder: ' + newName + ', returned: ' + o);
    }

    if (upgraders.length < 1) {
        const newName = 'Upgrader' + Game.time;
        const o = spawn.spawnCreep(creepRoleBalance.balanceSpec(specification.upgrader, energy), newName, { memory: { role: 'upgrader', upgrading: false } });
        console.log('creep.populationControl: Spawning new upgrader: ' + newName + ', returned: ' + o);
    }

    if (doctors.length < 1 && totalEnergyAvailable >= 500) {
        const newName = 'Doctor' + Game.time;
        const o = spawn.spawnCreep(creepRoleBalance.balanceSpec(specification.doctor, totalEnergyAvailable), newName, { memory: { role: 'doctor' } });
        console.log('creep.populationControl: Spawning new doctor: ' + newName + ', returned: ' + o);
    }

    if (spawn.spawning) {
        const spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            spawn.pos.x + 1,
            spawn.pos.y,
            { align: 'left', opacity: 0.8 }
        );
    }
}
