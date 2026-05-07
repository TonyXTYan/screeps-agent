import { repairStructureFilter } from './role.doctor';

export function run(room: Room): void {
    const towers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    for (const tower of towers) {
        const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        const energyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY)!;

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (energyRatio > 0.1) {
            const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, { filter: repairStructureFilter });
            const closestAbsoluteDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < s.hitsMax
            });
            const closestVeryUrgentDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < 500 && s.hitsMax > 500
            });
            const closestUrgentDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s) => s.hits < 10 * 1000 && s.hitsMax > 10 * 1000
            });
            const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: (c) => c.hits < c.hitsMax
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
            } else {
                console.log('tower.basics: ' + tower + ' is idle');
            }
        }
    }
}
