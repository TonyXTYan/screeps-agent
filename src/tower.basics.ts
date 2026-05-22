import { repairStructureFilter } from './repairs/policy';
import { isHostile } from './hostileUtils';

const DEFENSE_CRITICAL_HITS = 10_000;
const DEFENSE_CRITICAL_MIN_ENERGY = 0.5;

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
    // Non-defense structures: < 500 (veryUrgent), < 10K (urgent), or < 10% HP (criticalNormal) caught by absolute/percent thresholds;
    // walls/ramparts below 10K hits handled at 50% energy gate in a separate branch
    const normal = room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s, rcl) &&
            s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    }).sort((a, b) => a.hits - b.hits);
    const defense = room.find(FIND_STRUCTURES, {
        filter: (s) => repairStructureFilter(s, rcl) &&
            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
    }).sort((a, b) => a.hits - b.hits);
    const criticalNormal = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART &&
            s.hits < s.hitsMax * 0.1
    }).sort((a, b) => a.hits - b.hits);
    const criticalDefense = room.find(FIND_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) &&
            s.hits < DEFENSE_CRITICAL_HITS
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
                    ?? criticalNormal.find(s => !claimedIds.has(s.id))
                    ?? normal.find(s => !claimedIds.has(s.id))
                    ?? criticalDefense.find(s => !claimedIds.has(s.id))
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
        } else if (energyRatio >= DEFENSE_CRITICAL_MIN_ENERGY) {
            // Critical structures: repair non-wall < 10% HP or wall/rampart < 1K hits at 50% energy, even during peace
            const critTarget = criticalNormal.find(s => !claimedIds.has(s.id))
                ?? criticalDefense.find(s => !claimedIds.has(s.id));
            if (critTarget) {
                tower.repair(critTarget);
                claimedIds.add(critTarget.id);
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

