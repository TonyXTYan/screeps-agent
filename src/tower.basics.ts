import { repairStructureFilter } from './role.doctor';

export function run(room: Room): void {
    const towers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    const rcl = room.controller?.level ?? 0;

    for (const tower of towers) {
        const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        const energyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY)!;

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (energyRatio > 0.1) {
            const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: (c) => c.hits < c.hitsMax
            });
            const closestVeryUrgentDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < 500 && s.hitsMax > 500
            });
            const closestUrgentDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < 10 * 1000 && s.hitsMax > 10 * 1000
            });
            // Non-defense structures only: walls/ramparts handled separately below
            const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => repairStructureFilter(s as AnyStructure, rcl) &&
                    s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
            });
            const closestAbsoluteDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < s.hitsMax &&
                    s.structureType !== STRUCTURE_WALL &&
                    s.structureType !== STRUCTURE_RAMPART
            });

            if (closestDamagedCreep) {
                tower.heal(closestDamagedCreep);
            } else if (closestVeryUrgentDamagedStructure) {
                tower.repair(closestVeryUrgentDamagedStructure);
            } else if (closestUrgentDamagedStructure) {
                tower.repair(closestUrgentDamagedStructure);
            } else if (closestDamagedStructure) {
                tower.repair(closestDamagedStructure);
            } else if (closestAbsoluteDamagedStructure && energyRatio > 0.5) {
                tower.repair(closestAbsoluteDamagedStructure);
            } else if (energyRatio >= 0.9) {
                // Only invest in walls/ramparts when well-charged and nothing else needs attention
                const closestDefenseStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: (s) => repairStructureFilter(s as AnyStructure, rcl) &&
                        (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
                });
                if (closestDefenseStructure) {
                    tower.repair(closestDefenseStructure);
                } else {
                    console.log('tower.basics: ' + tower + ' is idle');
                }
            } else {
                console.log('tower.basics: ' + tower + ' is idle');
            }
        }
    }
}

export function tryFillTowerUnderSiege(creep: Creep): boolean {
    if (creep.room.find(FIND_HOSTILE_CREEPS).length === 0) { return false; }

    const tower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER &&
            (s as StructureTower).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureTower | null;

    if (!tower) { return false; }

    creep.say('🔴tower');
    if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(tower, { visualizePathStyle: { stroke: '#ff6600' } });
    }
    return true;
}
