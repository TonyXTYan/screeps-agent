import type { RoomStructureCache } from '../room.structures';

const STRUCTURE_MEMORY_REFRESH_INTERVAL = 100;

export function rememberRoomStructures(room: Room, cache: RoomStructureCache): void {
    const previous = room.memory.structures;
    if (previous) {
        const stale = (Game.time - previous.updatedAt) >= STRUCTURE_MEMORY_REFRESH_INTERVAL;
        if (!stale && !structureCountsChanged(previous, cache)) {
            return;
        }
    }

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
            sink: ids(cache.links.sink),
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

function structureCountsChanged(memory: RoomStructureMemory, cache: RoomStructureCache): boolean {
    if (memory.spawns.length !== cache.spawns.length) { return true; }
    if (memory.extensions.length !== cache.extensions.length) { return true; }
    if (memory.towers.length !== cache.towers.length) { return true; }
    if (memory.containers.length !== cache.containers.length) { return true; }
    if (memory.links.source.length !== cache.links.source.length) { return true; }
    if (memory.links.hub.length !== cache.links.hub.length) { return true; }
    if (memory.links.controller.length !== cache.links.controller.length) { return true; }
    if (memory.links.sink.length !== cache.links.sink.length) { return true; }
    if (memory.links.other.length !== cache.links.other.length) { return true; }
    if (memory.labs.length !== cache.labs.length) { return true; }

    if (Boolean(memory.storage) !== Boolean(cache.storage)) { return true; }
    if (Boolean(memory.extractor) !== Boolean(cache.extractor)) { return true; }
    if (Boolean(memory.terminal) !== Boolean(cache.terminal)) { return true; }
    if (Boolean(memory.factory) !== Boolean(cache.factory)) { return true; }
    if (Boolean(memory.observer) !== Boolean(cache.observer)) { return true; }
    if (Boolean(memory.powerSpawn) !== Boolean(cache.powerSpawn)) { return true; }
    if (Boolean(memory.nuker) !== Boolean(cache.nuker)) { return true; }

    return false;
}

function ids<T extends { id: string }>(objects: T[]): string[] {
    return objects.map((object) => object.id);
}
