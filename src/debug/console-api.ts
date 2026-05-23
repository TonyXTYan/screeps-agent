import { printRemoteCreepStatus } from './remote-status';
import { printHomeCreepStatus } from './home-status';

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
