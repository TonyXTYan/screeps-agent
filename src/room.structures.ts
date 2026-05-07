export interface LinkGroups {
    source: StructureLink[];
    hub: StructureLink[];
    controller: StructureLink[];
    other: StructureLink[];
}

export interface RoomStructureCache {
    spawns: StructureSpawn[];
    extensions: StructureExtension[];
    towers: StructureTower[];
    containers: StructureContainer[];
    storage: StructureStorage | undefined;
    links: LinkGroups;
    extractor: StructureExtractor | undefined;
    labs: StructureLab[];
    terminal: StructureTerminal | undefined;
    factory: StructureFactory | undefined;
    observer: StructureObserver | undefined;
    powerSpawn: StructurePowerSpawn | undefined;
    nuker: StructureNuker | undefined;
}

export function getRoomStructures(room: Room): RoomStructureCache {
    const structures = room.find(FIND_STRUCTURES);
    const sources = room.find(FIND_SOURCES);

    const spawns: StructureSpawn[] = [];
    const extensions: StructureExtension[] = [];
    const towers: StructureTower[] = [];
    const containers: StructureContainer[] = [];
    const linksRaw: StructureLink[] = [];
    const labs: StructureLab[] = [];
    let storage: StructureStorage | undefined;
    let extractor: StructureExtractor | undefined;
    let terminal: StructureTerminal | undefined;
    let factory: StructureFactory | undefined;
    let observer: StructureObserver | undefined;
    let powerSpawn: StructurePowerSpawn | undefined;
    let nuker: StructureNuker | undefined;

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_SPAWN) { spawns.push(structure as StructureSpawn); }
        if (structure.structureType === STRUCTURE_EXTENSION) { extensions.push(structure as StructureExtension); }
        if (structure.structureType === STRUCTURE_TOWER) { towers.push(structure as StructureTower); }
        if (structure.structureType === STRUCTURE_CONTAINER) { containers.push(structure as StructureContainer); }
        if (structure.structureType === STRUCTURE_STORAGE) { storage = structure as StructureStorage; }
        if (structure.structureType === STRUCTURE_LINK) { linksRaw.push(structure as StructureLink); }
        if (structure.structureType === STRUCTURE_EXTRACTOR) { extractor = structure as StructureExtractor; }
        if (structure.structureType === STRUCTURE_LAB) { labs.push(structure as StructureLab); }
        if (structure.structureType === STRUCTURE_TERMINAL) { terminal = structure as StructureTerminal; }
        if (structure.structureType === STRUCTURE_FACTORY) { factory = structure as StructureFactory; }
        if (structure.structureType === STRUCTURE_OBSERVER) { observer = structure as StructureObserver; }
        if (structure.structureType === STRUCTURE_POWER_SPAWN) { powerSpawn = structure as StructurePowerSpawn; }
        if (structure.structureType === STRUCTURE_NUKER) { nuker = structure as StructureNuker; }
    }

    const links = classifyLinks(room, linksRaw, sources, storage);

    const cache: RoomStructureCache = {
        spawns,
        extensions,
        towers,
        containers,
        storage,
        links,
        extractor,
        labs,
        terminal,
        factory,
        observer,
        powerSpawn,
        nuker
    };

    rememberRoomStructures(room, cache);
    return cache;
}

function classifyLinks(room: Room, links: StructureLink[], sources: Source[], storage: StructureStorage | undefined): LinkGroups {
    const groups: LinkGroups = { source: [], hub: [], controller: [], other: [] };

    for (const link of links) {
        if (sources.some((source) => link.pos.getRangeTo(source) <= 2)) {
            groups.source.push(link);
        } else if (room.controller && link.pos.getRangeTo(room.controller) <= 4) {
            groups.controller.push(link);
        } else if (storage && link.pos.getRangeTo(storage) <= 3) {
            groups.hub.push(link);
        } else {
            groups.other.push(link);
        }
    }

    return groups;
}

function rememberRoomStructures(room: Room, cache: RoomStructureCache): void {
    room.memory.structures = {
        updatedAt: Game.time,
        spawns: ids(cache.spawns),
        extensions: ids(cache.extensions),
        towers: ids(cache.towers),
        containers: ids(cache.containers),
        storage: cache.storage?.id,
        links: {
            source: ids(cache.links.source),
            hub: ids(cache.links.hub),
            controller: ids(cache.links.controller),
            other: ids(cache.links.other)
        },
        extractor: cache.extractor?.id,
        labs: ids(cache.labs),
        terminal: cache.terminal?.id,
        factory: cache.factory?.id,
        observer: cache.observer?.id,
        powerSpawn: cache.powerSpawn?.id,
        nuker: cache.nuker?.id
    };
}

function ids<T extends { id: string }>(objects: T[]): string[] {
    return objects.map((object) => object.id);
}
