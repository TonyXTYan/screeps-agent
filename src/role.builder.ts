import * as creepHarvest from './creep.harvest';
import * as roleDoctor from './role.doctor';
import * as towerBasics from './tower.basics';

export function run(creep: Creep): void {
    if (creep.memory.building === undefined) {
        creep.memory.building = creep.store.getUsedCapacity() > 30;
    }

    if (creep.memory.building && creep.store.getUsedCapacity() === 0) {
        creep.memory.building = false;
        creep.say('🔄 harvest');
    }
    if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
        creep.memory.building = true;
        creep.say('🚧 build');
    }

    if (creep.memory.building) {
        if (towerBasics.tryFillTowerUnderSiege(creep)) { return; }

        const target = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

        creep.memory.harvestTargetSourceId = undefined;
        creep.memory.harvestTargetSourceIndex = undefined;

        if (target) {
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffb752' } });
            }
        } else if (!roleDoctor.repairJob(creep)) {
            let counter = 0;
            for (const name in Game.creeps) {
                if (Game.creeps[name].memory.role === 'builder') { counter++; }
            }
            if (counter <= 1) {
                console.log('role.builder: last builder, ' + creep.name + ' so moving it to Spawn 1');
                creep.moveTo(Game.spawns['Spawn1'], { visualizePathStyle: { stroke: '#fafafa' } });
            } else {
                console.log('role.builder: ' + creep.name + ' not doing anything, erasing his memory💾');
                delete Memory.creeps[creep.name];
            }
        }
    } else {
        creepHarvest.run(creep);
    }
}
