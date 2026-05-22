const DEBUG_PATH_SCAN_INTERVAL = 25;
const DEFAULT_ROLE_PATH_STYLE = {
    fill: 'transparent',
    lineStyle: 'dashed' as const,
    strokeWidth: 0.15,
    opacity: 0.45
};
const ROLE_PATH_COLORS: { [role: string]: string } = {
    remoteMiner: '#f59e0b',
    remoteHauler: '#22d3ee',
    remoteMaintainer: '#34d399',
    remoteScout: '#a78bfa',
    claimer: '#f472b6',
    miner: '#eab308',
    hauler: '#38bdf8',
    worker: '#22c55e',
    doctor: '#ef4444',
    builder: '#22c55e',
    harvester: '#eab308',
    upgrader: '#60a5fa',
    manual: '#f97316',
    defender: '#ef4444'
};

let debugPathsEnabled = false;
let debugPathsLastScannedAt: number | undefined;
let moveDebugHookInstalled = false;

export function maintainMoveDebugHook(): void {
    if (debugPathsLastScannedAt !== undefined && Game.time < debugPathsLastScannedAt) {
        debugPathsLastScannedAt = undefined;
    }
    if (debugPathsLastScannedAt === undefined ||
        Game.time - debugPathsLastScannedAt >= DEBUG_PATH_SCAN_INTERVAL) {
        refreshDebugPathEnabled();
    }
    installMoveDebugHook();
}

function installMoveDebugHook(): void {
    if (!debugPathsEnabled) {
        if (!moveDebugHookInstalled) { return; }
        const proto = Creep.prototype as Creep & {
            _baseMoveTo?: (...args: any[]) => number;
        };
        if (proto._baseMoveTo) {
            proto.moveTo = proto._baseMoveTo as Creep['moveTo'];
            delete proto._baseMoveTo;
        }
        moveDebugHookInstalled = false;
        return;
    }
    if (moveDebugHookInstalled) { return; }
    const proto = Creep.prototype as Creep & {
        _baseMoveTo?: (...args: any[]) => number;
    };
    proto._baseMoveTo = proto.moveTo;

    proto.moveTo = function (this: Creep, ...args: any[]): CreepMoveReturnCode {
        const color = debugPathColorForCreep(this);
        if (!color) {
            return proto._baseMoveTo!.apply(this, args as [any, any, any]) as CreepMoveReturnCode;
        }

        const patchedArgs = args.slice();
        const optsIndex = typeof patchedArgs[0] === 'number' && typeof patchedArgs[1] === 'number' ? 2 : 1;
        patchedArgs[optsIndex] = mergeRolePathStyle(patchedArgs[optsIndex] as MoveToOpts | undefined, color);
        return proto._baseMoveTo!.apply(this, patchedArgs as [any, any, any]) as CreepMoveReturnCode;
    } as Creep['moveTo'];
    moveDebugHookInstalled = true;
}

function anyRemoteDebugPathsEnabled(): boolean {
    for (const roomName in Memory.rooms) {
        const remotes = Memory.rooms[roomName]?.plan?.remoteRooms;
        if (!remotes) { continue; }
        for (const remoteName in remotes) {
            const remote = remotes[remoteName];
            if (remote.enabled && remote.debugPaths) { return true; }
        }
    }
    return false;
}

function refreshDebugPathEnabled(): void {
    debugPathsEnabled = anyRemoteDebugPathsEnabled();
    debugPathsLastScannedAt = Game.time;
}

function debugPathColorForCreep(creep: Creep): string | null {
    const homeRoom = creep.memory.homeRoom;
    if (!homeRoom) { return null; }

    const remotes = Memory.rooms[homeRoom]?.plan?.remoteRooms ?? {};
    let enabled = false;
    const assignedRemoteRoom = creep.memory.remoteRoom;
    if (assignedRemoteRoom) {
        const assignedPlan = remotes[assignedRemoteRoom];
        enabled = Boolean(assignedPlan && assignedPlan.enabled && assignedPlan.debugPaths);
    }
    if (!enabled) {
        enabled = Object.keys(remotes).some((roomName) =>
            roomName === creep.room.name &&
            remotes[roomName].enabled &&
            remotes[roomName].debugPaths);
    }
    if (!enabled) { return null; }

    const key = creep.memory.archetype ?? creep.memory.role ?? 'worker';
    return ROLE_PATH_COLORS[key] ?? '#ffffff';
}

function mergeRolePathStyle(opts: MoveToOpts | undefined, color: string): MoveToOpts {
    const current = opts?.visualizePathStyle ?? {};
    return {
        ...(opts ?? {}),
        visualizePathStyle: {
            ...DEFAULT_ROLE_PATH_STYLE,
            ...current,
            stroke: color
        }
    };
}
