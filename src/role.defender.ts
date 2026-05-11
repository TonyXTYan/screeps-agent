import { isHostile } from './hostileUtils';

const DEFENDER_RENEW_THRESHOLD = 800;
const DEFENDER_PARK_RANGE = 5;

export function run(creep: Creep): void {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
        filter: isHostile
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
        let rally = creep.memory.rallySpawnId ? Game.getObjectById<StructureSpawn>(creep.memory.rallySpawnId) : null;
        if (!rally || rally.room.name !== creep.room.name) {
            rally = creep.room.find(FIND_MY_SPAWNS)[0] ?? null;
            if (rally) {
                creep.memory.rallySpawnId = rally.id;
            } else {
                creep.memory.rallySpawnId = undefined;
            }
        }
        if (!rally) { return; }

        const ttl = creep.ticksToLive ?? 0;
        if (ttl > 0 && ttl < DEFENDER_RENEW_THRESHOLD) {
            if (creep.pos.isNearTo(rally)) {
                rally.renewCreep(creep);
            } else {
                creep.moveTo(rally, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else {
            creep.moveTo(rally, { range: DEFENDER_PARK_RANGE, visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
}


