import { isHostile } from './hostileUtils';
import { acquireRenewSpawn, nearestSpawn } from './spawn.renewal';

const DEFENDER_RENEW_REQUEST = 800;
const DEFENDER_RENEW_FULL = 1000;

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
            rally = nearestSpawn(creep, creep.room);
            if (rally) {
                creep.memory.rallySpawnId = rally.id;
            } else {
                creep.memory.rallySpawnId = undefined;
            }
        }
        if (!rally) { return; }

        const ttl = creep.ticksToLive ?? 0;
        const needsRenew = ttl > 0 && ttl < DEFENDER_RENEW_FULL && (ttl < DEFENDER_RENEW_REQUEST || creep.pos.isNearTo(rally));
        if (needsRenew) {
            const renewSpawn = acquireRenewSpawn(creep, creep.room);
            if (!renewSpawn) {
                creep.moveTo(rally, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
                return;
            }
            if (creep.pos.isNearTo(renewSpawn)) {
                const code = renewSpawn.renewCreep(creep);
                if (code !== OK) {
                    creep.moveTo(renewSpawn, { range: 10, visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                creep.moveTo(renewSpawn, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else if (creep.pos.getRangeTo(rally) < 10) {
            creep.moveTo(rally, { range: 10, visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
}
