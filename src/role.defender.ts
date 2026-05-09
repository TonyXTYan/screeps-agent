import * as creepHarvest from './creep.harvest';

export function run(creep: Creep): void {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
        filter: isArmedHostile
    });

    if (creep.memory.attacking && hostiles.length === 0) {
        creep.memory.attacking = false;
        creep.say('😴');
    } else if (!creep.memory.attacking && hostiles.length > 0) {
        creep.memory.attacking = true;
        creep.say('⚔️');
    }

    if (creep.memory.attacking) {
        const target = creep.pos.findClosestByRange(hostiles);
        if (!target) { return; }
        creep.rangedAttack(target);
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 5, visualizePathStyle: { stroke: '#ff0000' } });
        }
    } else {
        if (creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0) {
            creepHarvest.run(creep);
            return;
        }
        let rally = creep.memory.rallySpawnId ? Game.getObjectById<StructureSpawn>(creep.memory.rallySpawnId) : null;
        if (!rally || rally.room.name !== creep.room.name) {
            rally = creep.room.find(FIND_MY_SPAWNS)[0] ?? null;
            if (rally) {
                creep.memory.rallySpawnId = rally.id;
            } else {
                creep.memory.rallySpawnId = undefined;
            }
        }
        if (rally) {
            creep.moveTo(rally, { reusePath: 20, visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
}

function isArmedHostile(creep: Creep): boolean {
    return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;
}
