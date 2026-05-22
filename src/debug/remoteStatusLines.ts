import { buildRemoteStatusEntry } from './remoteStatusLineBuilder';

export function remoteCreepStatusLines(homeRoomName: string, remoteRoomName: string): string[] {
    const entries: ReturnType<typeof buildRemoteStatusEntry>[] = [];

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom !== homeRoomName) { continue; }
        if (creep.memory.remoteRoom !== remoteRoomName) { continue; }
        if (creep.spawning) { continue; }

        entries.push(buildRemoteStatusEntry(creep, remoteRoomName));
    }

    const archetypeOrder: Record<string, number> = {
        remoteMiner: 0, remoteHauler: 1, remoteMaintainer: 2,
        remoteScout: 3, claimer: 4
    };
    entries.sort((a, b) => {
        return (archetypeOrder[a.archetype] ?? 99) - (archetypeOrder[b.archetype] ?? 99) ||
            a.creepName.localeCompare(b.creepName);
    });

    return entries.map((entry) => entry.line);
}
