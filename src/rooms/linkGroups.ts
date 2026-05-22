import type { LinkGroups } from '../room.structures';

export function classifyLinks(
    room: Room,
    links: StructureLink[],
    sources: Source[],
    spawns: StructureSpawn[],
    extensions: StructureExtension[],
    storage: StructureStorage | undefined
): LinkGroups {
    const groups: LinkGroups = { source: [], hub: [], controller: [], sink: [], other: [] };

    for (const link of links) {
        let classified = false;
        if (sources.some((source) => link.pos.getRangeTo(source) <= 2)) {
            groups.source.push(link); classified = true;
        }
        if (room.controller && link.pos.getRangeTo(room.controller) <= 4) {
            groups.controller.push(link); classified = true;
        }
        if ((storage && link.pos.getRangeTo(storage) <= 3) ||
            spawns.some((spawn) => link.pos.getRangeTo(spawn) <= 3)) {
            groups.hub.push(link); classified = true;
        }
        if (extensions.filter((extension) => link.pos.getRangeTo(extension) <= 3).length >= 3) {
            groups.sink.push(link); classified = true;
        }
        if (!classified) { groups.other.push(link); }
    }

    return groups;
}
