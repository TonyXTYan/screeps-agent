export function printMineralStatus(room: Room): void {
    const mineral = room.find(FIND_MINERALS)[0];
    if (!mineral) { return; }

    const extractor = room.find(FIND_MY_STRUCTURES).find((s) => s.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor | undefined;
    const containers = room.find(FIND_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
    const adjacentContainers = containers.filter((c) => c.pos.getRangeTo(mineral) <= 1);

    let containerStr = 'none adjacent';
    if (adjacentContainers.length > 0) {
        const c = adjacentContainers[0];
        const mineralAmount = c.store.getUsedCapacity(mineral.mineralType);
        const cap = c.store.getCapacity();
        containerStr = `${c.id.slice(-8)} at [${c.pos.x},${c.pos.y}] ${mineral.mineralType}=${mineralAmount}/${cap}`;
    } else if (containers.length > 0) {
        const nearby = containers.filter((c) => c.pos.getRangeTo(mineral) <= 3);
        if (nearby.length > 0) {
            const c = nearby[0];
            const range = c.pos.getRangeTo(mineral);
            containerStr = `${c.id.slice(-8)} at range ${range} (too far)`;
        }
    }

    console.log(`[MINERAL] t=${Game.time} ${mineral.id.slice(-8)} at [${mineral.pos.x},${mineral.pos.y}]  ` +
        `amount=${mineral.mineralAmount}  type=${mineral.mineralType}  ` +
        `extractor=${extractor ? 'yes' : 'no'}  ` +
        `container=${containerStr}`);
}
