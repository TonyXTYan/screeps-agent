import * as creepHarvest from '../creep/harvest';

export function wallRampartRepairCap(rcl: number): number {
    if (rcl <= 2) return 20_000;
    if (rcl === 3) return 30_000;
    if (rcl === 4) return 50_000;
    if (rcl === 5) return 75_000;
    if (rcl === 6) return 100_000;
    if (rcl === 7) return 300_000;
    return Infinity;
}

export function repairStructureFilter(structure: AnyStructure, rcl: number): boolean {
    if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
        return structure.hits < Math.min(wallRampartRepairCap(rcl), structure.hitsMax);
    }
    return structure.hits < structure.hitsMax * 0.9;
}

export function repairTargetToRepair(creep: Creep): AnyStructure | null {
    const rcl = creep.room.controller?.level ?? 0;
    return creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: (s) => repairStructureFilter(s as AnyStructure, rcl) });
}

export function repairJob(creep: Creep): boolean {
    const repairTarget = repairTargetToRepair(creep);
    if (repairTarget) {
        const repairCode = creep.repair(repairTarget);
        if (repairCode === ERR_NOT_IN_RANGE) {
            creep.say('🩹');
            creep.moveTo(repairTarget, { visualizePathStyle: { stroke: '#b0f566' } });
        } else if (repairCode !== OK) {
            console.log('role.doctor: for creep ' + creep.name + 'repair return code: ' + repairCode);
        }
        return true;
    }
    console.log('role.doctor: ' + creep.name + 'all repaired ' + repairTarget);
    return false;
}

export function run(creep: Creep): void {
    if (creep.memory.repairing === undefined) {
        creep.memory.repairing = creep.store.getUsedCapacity() > 30;
    }

    if (creep.memory.repairing && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        creep.memory.repairing = false;
        creep.say('🔄');
    }
    if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
        creep.memory.repairing = true;
        creep.say('🩹');
    }

    if (creep.memory.repairing) {
        const healTargets = creep.room.find(FIND_MY_CREEPS, {
            filter: (c) => c.hits < c.hitsMax
        });

        if (healTargets.length > 0) {
            const healTarget = creep.pos.findClosestByRange(healTargets) ?? healTargets[0];
            const transferCode = creep.heal(healTarget);
            if (transferCode === ERR_NOT_IN_RANGE) {
                creep.rangedHeal(healTarget);
                creep.moveTo(healTarget, { visualizePathStyle: { stroke: '#65fd62' } });
            } else if (transferCode !== OK) {
                console.log('role.doctor: heal return code: ' + transferCode);
            }
        } else if (!repairJob(creep)) {
            let counter = 0;
            for (const name in Game.creeps) {
                if (Game.creeps[name].memory.role === 'doctor') { counter++; }
            }
            if (counter <= 2) {
                const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
                if (spawn) {
                    console.log('role.doctor: doctor job done, so moving it to nearest spawn');
                    creep.moveTo(spawn, { visualizePathStyle: { stroke: '#fafafa' } });
                }
            }
        }
    } else {
        creepHarvest.run(creep);
    }
}
