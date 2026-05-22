import { printRemoteSourceDebugSections } from './remoteSources';
import { remoteCreepStatusLines } from './remoteStatusLines';

export function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}

export function printRemoteCreepStatus(filterHome?: string, filterRemote?: string): void {
    for (const room of ownedRooms()) {
        if (filterHome && room.name !== filterHome) { continue; }
        const remotes = room.memory.plan?.remoteRooms;
        if (!remotes) { continue; }

        for (const [remoteName, plan] of Object.entries(remotes)) {
            if (filterRemote && remoteName !== filterRemote) { continue; }
            if (!filterRemote && !filterHome && (!plan.enabled || !plan.debugCreeps)) { continue; }

            const lines = remoteCreepStatusLines(room.name, remoteName);

            if (lines.length === 0) { continue; }

            console.log(`[REMOTE] t=${Game.time} ${remoteName} (home: ${room.name}):`);
            for (const line of lines) {
                console.log(`  ${line}`);
            }

            printRemoteSourceDebugSections(room, remoteName, plan);
        }
    }
}
