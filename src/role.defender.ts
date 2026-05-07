import * as creepHarvest from './creep.harvest';

export function run(creep: Creep): void {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);

    if (creep.memory.attacking && hostiles.length === 0) {
        creep.memory.attacking = false;
        creep.say('😴');
    } else if (!creep.memory.attacking && hostiles.length > 0) {
        creep.memory.attacking = true;
        creep.say('⚔️');
    }

    if (creep.memory.attacking) {
        const target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (!target) { return; }
        creep.rangedAttack(target);
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 5, visualizePathStyle: { stroke: '#ff0000' } });
        }
    } else {
        creepHarvest.run(creep);
    }
}
