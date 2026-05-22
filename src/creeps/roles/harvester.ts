import * as creepHarvest from '../harvest';
import * as roleDoctor from './doctor';
import * as towerBasics from '../../tower/basics';

export function energyTargets(creep: Creep): EnergyStructure[] {
    return creep.room.find(FIND_STRUCTURES, {
        filter: (s) =>
            (s.structureType === STRUCTURE_EXTENSION ||
             s.structureType === STRUCTURE_SPAWN ||
             s.structureType === STRUCTURE_CONTAINER ||
             s.structureType === STRUCTURE_TOWER) &&
            (s as EnergyStructure).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as EnergyStructure[];
}

export function energyTargetExtensions(creep: Creep): StructureExtension | null {
    return creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_EXTENSION &&
            (s as StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureExtension | null;
}

export function energyTargetTower(creep: Creep): StructureTower | null {
    return creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (s) =>
            s.structureType === STRUCTURE_TOWER &&
            ((s as StructureTower).store.getFreeCapacity(RESOURCE_ENERGY) /
             (s as StructureTower).store.getCapacity(RESOURCE_ENERGY)!) > 0.4
    }) as StructureTower | null;
}

export function run(creep: Creep): void {
    if (creep.memory.dumping === undefined) {
        creep.memory.dumping = creep.store.getUsedCapacity() > 30;
    }

    if (creep.memory.dumping && creep.store.getUsedCapacity() === 0) {
        creep.memory.dumping = false;
        creep.say('🔄');
    }
    if (!creep.memory.dumping && creep.store.getFreeCapacity() === 0) {
        creep.memory.dumping = true;
        creep.say('🗑dump');
    }

    if (!creep.memory.dumping) {
        creepHarvest.run(creep);
    } else {
        creep.memory.harvestTargetSourceId = undefined;
        creep.memory.harvestTargetSourceIndex = undefined;

        if (towerBasics.tryFillTowerUnderSiege(creep)) { return; }

        const targets = energyTargets(creep);

        if (targets.length > 0) {
            const extension = energyTargetExtensions(creep);
            const tower = energyTargetTower(creep);

            let target: EnergyStructure = targets[0];
            if (extension) { creep.say('🟡'); target = extension; }
            else if (tower) { creep.say('🟨'); target = tower; }

            const transferCode = creep.transfer(target, RESOURCE_ENERGY);
            if (transferCode === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
            } else if (transferCode !== OK) {
                console.log('role.harvester: transfer return code): ' + transferCode);
            }
        } else if (!roleDoctor.repairJob(creep)) {
            let counter = 0;
            for (const name in Game.creeps) {
                if (Game.creeps[name].memory.role === 'harvester') { counter++; }
            }
            if (counter <= 2) {
                const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
                if (spawn) {
                    console.log('role.harvester: last harvester, so moving it to nearest spawn');
                    creep.moveTo(spawn, { visualizePathStyle: { stroke: '#fafafa' } });
                }
            } else {
                console.log(creep.name + ' not doing anything, erasing his memory💾');
                delete Memory.creeps[creep.name];
            }
        } else {
            console.log('role.harvester: this should not happen (no repair job?)');
        }
    }
}
