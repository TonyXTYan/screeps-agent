import { repairStructureFilter } from './role.doctor';

export function run(room: Room): void {
    const towers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    if (towers.length === 0) { return; }

    const rcl = room.controller?.level ?? 0;

    // Pre-compute repair targets once per tick so all towers focus on the same most-critical structure.
    // Lowest hits wins within each priority band.
    const veryUrgentRepairTarget = lowestHits(room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < 500 && s.hitsMax > 500
    }) as AnyStructure[]);
    const urgentRepairTarget = lowestHits(room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < 10_000 && s.hitsMax > 10_000
    }) as AnyStructure[]);
    // Non-defense structures only: walls/ramparts handled at the ≥90% gate below
    const normalRepairTarget = lowestHits(room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s as AnyStructure, rcl) &&
            s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    }) as AnyStructure[]);
    const absoluteRepairTarget = lowestHits(room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    }) as AnyStructure[]);
    const defenseRepairTarget = lowestHits(room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s as AnyStructure, rcl) &&
            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
    }) as AnyStructure[]);

    for (const tower of towers) {
        const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        const energyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY)!;

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (energyRatio > 0.1) {
            // Heal uses closest-by-range because tower heal power decreases with distance
            const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: (c) => c.hits < c.hitsMax
            });

            if (closestDamagedCreep) {
                tower.heal(closestDamagedCreep);
            } else if (veryUrgentRepairTarget) {
                tower.repair(veryUrgentRepairTarget);
            } else if (urgentRepairTarget) {
                tower.repair(urgentRepairTarget);
            } else if (normalRepairTarget) {
                tower.repair(normalRepairTarget);
            } else if (absoluteRepairTarget && energyRatio > 0.5) {
                tower.repair(absoluteRepairTarget);
            } else if (energyRatio >= 0.9) {
                // Only invest in walls/ramparts when well-charged and nothing else needs attention
                if (defenseRepairTarget) {
                    tower.repair(defenseRepairTarget);
                } else {
                    console.log('tower.basics: ' + tower + ' is idle');
                }
            } else {
                console.log('tower.basics: ' + tower + ' is idle');
            }
        }
    }
}

function lowestHits(structures: AnyStructure[]): AnyStructure | null {
    if (structures.length === 0) { return null; }
    let best = structures[0];
    for (const s of structures) {
        if (s.hits < best.hits) { best = s; }
    }
    return best;
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
