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

export function loop(): void {
    console.log('main: ✅ Current game time is: ' + Game.time + ' -------------------------------');

    creepMemoryManagement.run();

    const controlledRooms = ownedRooms();
    for (const room of controlledRooms) {
        populationControl.checkDefenders(room); // runs before roomController to win the spawn slot
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

        // Defenders must run before the job runner — they get misclassified as 'worker'
        // archetype and would receive economic jobs that bypass their combat behavior.
        if (creep.memory.role === 'defender') { roleDefender.run(creep); continue; }

        if (creepJobRunner.run(creep)) { continue; }

        if (fleeFromHostiles(creep)) { continue; }

        if (creep.memory.role === 'builder') { roleBuilder.run(creep); }
        if (creep.memory.role === 'harvester') { roleHarvester.run(creep); }
        if (creep.memory.role === 'upgrader') { roleUpgrader.run(creep); }
        if (creep.memory.role === 'doctor') { roleDoctor.run(creep); }
        if (creep.memory.role === 'manual') { roleManual.run(creep); }
    }
}

function fleeFromHostiles(creep: Creep): boolean {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) { return false; }
    const nearbyHostile = hostiles.find(h => creep.pos.getRangeTo(h) <= 5);
    if (!nearbyHostile) { return false; }

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

function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}
