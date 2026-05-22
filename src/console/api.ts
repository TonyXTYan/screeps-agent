type RemoteMiningConsoleApi = {
    activate: (homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions) => string;
    configure: (homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions) => string;
    pause: (homeRoom: string, remoteRoom: string, ticks?: number) => string;
    disable: (homeRoom: string, remoteRoom: string) => string;
    status: (homeRoom: string, remoteRoom?: string) => string;
};
type RemoteMiningOptions = {
    reserve?: boolean;
    buildRoads?: boolean;
    maintainRoads?: boolean;
    debugPaths?: boolean;
    debugCreeps?: boolean;
};

declare global {
    var remoteMining: RemoteMiningConsoleApi | undefined;
    var debug: {
        trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
        dumpRemote: (homeRoom: string, remoteRoom: string) => string;
        dumpHome: (homeRoom: string) => string;
    } | undefined;
    var runMemoryAudit: () => number;
}

export function installConsoleHelpers(auditRunner: () => number): void {
    if (globalThis.remoteMining) { return; }
    globalThis.runMemoryAudit = auditRunner;
    globalThis.remoteMining = {
        activate(homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions): string {
            const room = Memory.rooms[homeRoom] ?? (Memory.rooms[homeRoom] = {});
            room.plan = room.plan ?? {};
            room.plan.remoteRooms = room.plan.remoteRooms ?? {};
            room.plan.remoteRooms[remoteRoom] = {
                enabled: true,
                roomName: remoteRoom,
                mode: 'harvest',
                reserve: options?.reserve ?? true,
                buildRoads: options?.buildRoads ?? true,
                maintainRoads: options?.maintainRoads ?? true,
                debugPaths: options?.debugPaths ?? false,
                debugCreeps: options?.debugCreeps ?? false
            };
            return `remoteMining: activated ${homeRoom} -> ${remoteRoom}`;
        },
        configure(homeRoom: string, remoteRoom: string, options?: RemoteMiningOptions): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            if (options?.reserve !== undefined) { plan.reserve = options.reserve; }
            if (options?.buildRoads !== undefined) { plan.buildRoads = options.buildRoads; }
            if (options?.maintainRoads !== undefined) { plan.maintainRoads = options.maintainRoads; }
            if (options?.debugPaths !== undefined) { plan.debugPaths = options.debugPaths; }
            if (options?.debugCreeps !== undefined) { plan.debugCreeps = options.debugCreeps; }
            return `remoteMining: configured ${homeRoom} -> ${remoteRoom}`;
        },
        pause(homeRoom: string, remoteRoom: string, ticks: number = 1500): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.dangerUntil = Game.time + Math.max(1, ticks);
            return `remoteMining: paused ${homeRoom} -> ${remoteRoom} until ${plan.dangerUntil}`;
        },
        disable(homeRoom: string, remoteRoom: string): string {
            const plan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
            if (!plan) { return `remoteMining: missing ${homeRoom} -> ${remoteRoom}`; }
            plan.enabled = false;
            return `remoteMining: disabled ${homeRoom} -> ${remoteRoom}`;
        },
        status(homeRoom: string, remoteRoom?: string): string {
            const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};
            if (!remoteRoom) { return JSON.stringify(remotes, null, 2); }
            return JSON.stringify(remotes[remoteRoom] ?? null, null, 2);
        }
    };
}
