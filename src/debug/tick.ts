import { getRoomStructures } from '../room/structures';
import { debugState, DEBUG_CREEP_INTERVAL } from './constants';
import { ownedRooms } from './owned-rooms';
import { printHomeCreepStatus } from './home-status';
import { printRemoteCreepStatus } from './remote-status';

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
    if (debugState.creepsLastPrintedAt === undefined ||
        Game.time - debugState.creepsLastPrintedAt >= DEBUG_CREEP_INTERVAL) {
        printRemoteCreepStatus();
        debugState.creepsLastPrintedAt = Game.time;
    }
}
