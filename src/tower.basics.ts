import { repairStructureFilter } from './role.doctor';
import { isHostile } from './hostileUtils';

export function run(room: Room): void {
    const towers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    if (towers.length === 0) { return; }

    const rcl = room.controller?.level ?? 0;
    const armedHostiles = room.find(FIND_HOSTILE_CREEPS, {
        filter: isHostile
    });

    // Pre-compute repair candidates sorted by hits ascending, then distribute across towers
    // so each tower repairs a different structure instead of all piling on the same target.
    const veryUrgent = room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < 500 &&
            s.hitsMax > 500 &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
    }).sort((a, b) => a.hits - b.hits);
    const urgent = room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < 10_000 &&
            s.hitsMax > 10_000 &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
    }).sort((a, b) => a.hits - b.hits);
    // Non-defense structures only: walls/ramparts handled at the ≥90% gate below
    const normal = room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s, rcl) &&
            s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    }).sort((a, b) => a.hits - b.hits);
    const defense = room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s, rcl) &&
            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
    }).sort((a, b) => a.hits - b.hits);

    const claimedIds = new Set<string>();

    for (const tower of towers) {
        const closestHostile = tower.pos.findClosestByRange(armedHostiles);
        const energyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY)!;
        const underSiege = armedHostiles.length > 0;
        const minEnergyForRepair = underSiege ? 0.5 : 0.7;
        const minEnergyForDefense = underSiege ? 0.4 : 0.75;

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (energyRatio >= minEnergyForRepair) {
            // Heal uses closest-by-range because tower heal power decreases with distance
            const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: (c) => c.hits < c.hitsMax
            });

            if (closestDamagedCreep) {
                tower.heal(closestDamagedCreep);
            } else {
                const target = veryUrgent.find(s => !claimedIds.has(s.id))
                    ?? urgent.find(s => !claimedIds.has(s.id))
                    ?? normal.find(s => !claimedIds.has(s.id))
                    ?? (energyRatio >= minEnergyForDefense ? defense.find(s => !claimedIds.has(s.id)) : null);

                if (target) {
                    tower.repair(target);
                    claimedIds.add(target.id);
                } else {
                    if (room.memory.debug_tower) {
                        console.log('tower.basics: ' + tower + ' is idle');
                    }
                }
            }
        }
    }
}

export function tryFillTowerUnderSiege(creep: Creep): boolean {
    if (creep.room.find(FIND_HOSTILE_CREEPS, { filter: isHostile }).length === 0) { return false; }
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) { return false; }

    const tower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER &&
            (s as StructureTower).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureTower | null;

    if (!tower) { return false; }

    creep.say('🔴tower');
    const transferCode = creep.transfer(tower, RESOURCE_ENERGY);
    if (transferCode === ERR_NOT_IN_RANGE) {
        creep.moveTo(tower, { visualizePathStyle: { stroke: '#ff6600' } });
        return true;
    }

    return transferCode === OK;
}


