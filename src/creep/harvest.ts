export function run(creep: Creep): void {
    const sources = creep.room.find(FIND_SOURCES);
    const sourcesClosest = creep.pos.findClosestByPath(FIND_SOURCES);

    if (creep.memory.harvestTargetSourceIndex === undefined) {
        creep.memory.harvestTargetSourceIndex = 0;
    }
    if (creep.memory.harvestTargetSourceId === undefined) {
        creep.memory.harvestTargetSourceId = (sourcesClosest ?? sources[0]).id;
    }

    const targetThisTick = Game.getObjectById<Source | StructureContainer>(creep.memory.harvestTargetSourceId);
    if (!targetThisTick) { return; }

    if (creep.room.memory.sources === undefined) {
        creep.room.memory.sources = {};
        creep.room.memory.sources[targetThisTick.id] = [8, 1, Game.time];
        console.log('creep.Harvester: ⚠️ room.sources initialised');
    }
    if (creep.room.memory.sources[targetThisTick.id] === undefined) {
        creep.room.memory.sources[targetThisTick.id] = [8, 1, Game.time];
    }

    const harvestCode = creep.harvest(targetThisTick as Source);

    if (harvestCode === ERR_NOT_IN_RANGE) {
        const attempt = creep.moveTo(targetThisTick, { visualizePathStyle: { stroke: '#3d2a22' } });
        if (attempt === ERR_NO_PATH) {
            creep.say('🚦');
            console.log('creep.Harvester: ' + creep.name + ' report congested');
            findOtherOption(creep);
        }
    } else if (harvestCode === ERR_INVALID_TARGET) {
        creep.say('🔋');
        const withdrawCode = creep.withdraw(targetThisTick as StructureContainer, RESOURCE_ENERGY);
        if (withdrawCode === ERR_NOT_IN_RANGE) {
            creep.moveTo(targetThisTick, { visualizePathStyle: { stroke: '#875641' } });
        } else if (withdrawCode !== OK) {
            creep.memory.harvestTargetSourceId = undefined;
            console.log('creep.harvest withdraw failed with code: ' + withdrawCode + ' of target ' + targetThisTick + ' so reset');
        }
    } else if (harvestCode === ERR_NOT_ENOUGH_RESOURCES) {
        creep.say('🚱');
        findOtherOption(creep);
    } else if (harvestCode !== OK) {
        console.log('creep.harvest failed with code: ' + harvestCode);
    }
}

export function findOtherOption(creep: Creep): void {
    if (creep.memory.role === 'harvester') {
        const sources = creep.room.find(FIND_SOURCES);
        let idx = ((creep.memory.harvestTargetSourceIndex ?? 0) + 1) % sources.length;
        const newId = sources[idx].id;
        creep.memory.harvestTargetSourceIndex = idx;
        creep.memory.harvestTargetSourceId = newId;
        console.log('creep.Harvester: ' + creep.name + ' will harvest index ' + idx + ' which is ' + newId);

        let counter = 0;
        for (const name in Game.creeps) {
            if (Game.creeps[name].memory.harvestTargetSourceId === newId) { counter++; }
        }
        if (creep.room.memory.sources) {
            creep.room.memory.sources[newId] = [counter, counter, Game.time];
        }
    } else {
        useContainer(creep);
    }
}

export function useContainer(creep: Creep): void {
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) =>
            s.structureType === STRUCTURE_CONTAINER &&
            (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 2 * creep.store.getCapacity(RESOURCE_ENERGY)
    }) as StructureContainer[];
    const source = creep.pos.findClosestByPath(containers);
    if (source) {
        creep.memory.harvestTargetSourceIndex = -1;
        creep.memory.harvestTargetSourceId = source.id;
    }
}
