import * as roleHarvester from './role.harvester';
import * as roleUpgrader from './role.upgrader';
import * as roleBuilder from './role.builder';
import * as roleDoctor from './role.doctor';
import * as roleManual from './role.manual';
import * as creepMemoryManagement from './creep.memoryManagement';
import * as creepJobRunner from './creep.jobRunner';
import * as roomController from './room.controller';
import * as towerBasics from './tower.basics';

export function loop(): void {
    console.log('main: ✅ Current game time is: ' + Game.time + ' -------------------------------');

    creepMemoryManagement.run();

    const controlledRooms = ownedRooms();
    for (const room of controlledRooms) {
        roomController.run(room);
        towerBasics.run(room);
    }

    console.log('sync test 1');

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning) { continue; }

        if (!creep.memory.jobType) {
            roomController.assignRemoteCreep(creep);
        }

        if (creepJobRunner.run(creep)) { continue; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'doctor') { roleDoctor.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }
}

function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}
