export function homeEnergySummary(room: Room | undefined): string {
    if (!room) { return ''; }

    let energySummary = `en=${room.energyAvailable}/${room.energyCapacityAvailable}`;
    const parts: string[] = [];
    const storage = room.storage;
    if (storage) {
        parts.push(`storage=${storage.store.getUsedCapacity(RESOURCE_ENERGY)}`);
    }
    const containers = room.find(FIND_STRUCTURES).filter(
        (structure) => structure.structureType === STRUCTURE_CONTAINER
    ) as StructureContainer[];
    if (containers.length > 0) {
        const containerEnergy = containers
            .map((container) => `${container.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            .join('+');
        parts.push(`containers=${containerEnergy}`);
    }
    const links = room.find(FIND_STRUCTURES).filter(
        (structure) => structure.structureType === STRUCTURE_LINK
    ) as StructureLink[];
    if (links.length > 0) {
        const linkEnergy = links
            .map((link) => `${link.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            .join('+');
        parts.push(`links=${linkEnergy}`);
    }
    const terminal = room.terminal;
    if (terminal) {
        parts.push(`terminal=${terminal.store.getUsedCapacity(RESOURCE_ENERGY)}`);
    }
    const towers = room.find(FIND_STRUCTURES).filter(
        (structure) => structure.structureType === STRUCTURE_TOWER
    ) as StructureTower[];
    const lowTowers = towers.filter((tower) => tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY) < 0.55);
    const spawnExtensionPressure = room.find(FIND_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION)
        .reduce((total, structure) => total + (structure as StructureSpawn | StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const hasEnergyDemand = spawnExtensionPressure > 0 || lowTowers.length > 0;
    parts.push(`demand=${hasEnergyDemand ? 'YES' : 'no'}`);
    parts.push(`recoveryPull=${room.memory.energyRecoveryActive ? 'YES' : 'no'}`);
    parts.push(`recoveryReason=${room.memory.energyRecoveryReason ?? 'none'}`);
    if (parts.length > 0) {
        energySummary += '  ' + parts.join('  ');
    }

    return energySummary;
}
