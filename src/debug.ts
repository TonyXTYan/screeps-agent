import { printHomeCreepStatus } from './debug/homeStatus';
import { ownedRooms, printRemoteCreepStatus } from './debug/remoteStatus';
import { getRoomStructures } from './room.structures';

export { ownedRooms } from './debug/remoteStatus';

const DEBUG_CREEP_INTERVAL = 10;
let debugCreepsLastPrintedAt: number | undefined;


export type DebugConsoleApi = {
    trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
    dumpRemote: (homeRoom: string, remoteRoom: string) => string;
    dumpHome: (homeRoom: string) => string;
};

declare global {
    var debug: DebugConsoleApi | undefined;
}

export function tickAutoDebug(): void {
    const tick = Game.time % 13;
    if (tick === 0){
        console.log(`--- Shard ${Game.shard.name} --- Tick ${Game.time} --- ${new Date().toLocaleTimeString()} --- ${Game.cpu.bucket} bucket --- ${Game.market.credits} credits ---`);
    } else if (tick === 1) {
        for (const room of ownedRooms()) {
            if (room.memory.debug_home) { printHomeCreepStatus(room.name); }
            const { links } = getRoomStructures(room);
            const summary = `src=${links.source.length} hub=${links.hub.length} ctrl=${links.controller.length} sink=${links.sink.length} other=${links.other.length}`;
            console.log(`[LINKS] ${room.name}: ${summary}`);
        }
    } else if (tick === 2) {
        for (const room of ownedRooms()) {
            if (room.memory.debug_remotes) { printRemoteCreepStatus(room.name); }
        }
    }
}

export function tickRemoteCreepLog(): void {
    if (debugCreepsLastPrintedAt === undefined ||
        Game.time - debugCreepsLastPrintedAt >= DEBUG_CREEP_INTERVAL) {
        printRemoteCreepStatus();
        debugCreepsLastPrintedAt = Game.time;
    }
}

export function installDebugHelpers(): void {
    if (globalThis.debug) { return; }
    globalThis.debug = {
        trackRemote(homeRoom: string, remoteRoom: string, on?: boolean): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `debug: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.debugCreeps = on ?? !plan.debugCreeps;
            return `debug: trackRemote ${homeRoom} -> ${remoteRoom} = ${plan.debugCreeps}`;
        },
        dumpRemote(homeRoom: string, remoteRoom: string): string {
            printRemoteCreepStatus(homeRoom, remoteRoom);
            return `debug: dumpRemote ${homeRoom} -> ${remoteRoom}`;
        },
        dumpHome(homeRoom: string): string {
            printHomeCreepStatus(homeRoom);
            return `debug: dumpHome ${homeRoom}`;
        }
    };
}
