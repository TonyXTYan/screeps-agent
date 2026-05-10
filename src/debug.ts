import { ensureArchetype } from './creep.capabilities';

const DEBUG_CREEP_INTERVAL = 10;
let debugCreepsLastPrintedAt: number | undefined;

export function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}

function printRemoteCreepStatus(filterHome?: string, filterRemote?: string): void {
    for (const room of ownedRooms()) {
        if (filterHome && room.name !== filterHome) { continue; }
        const remotes = room.memory.plan?.remoteRooms;
        if (!remotes) { continue; }

        for (const [remoteName, plan] of Object.entries(remotes)) {
            if (filterRemote && remoteName !== filterRemote) { continue; }
            if (!filterRemote && !filterHome && (!plan.enabled || !plan.debugCreeps)) { continue; }

            const lines: string[] = [];

            for (const name in Game.creeps) {
                const creep = Game.creeps[name];
                if (creep.memory.homeRoom !== room.name) { continue; }
                if (creep.memory.remoteRoom !== remoteName) { continue; }
                if (creep.spawning) { continue; }

                const archetype = ensureArchetype(creep);
                const ttl = creep.ticksToLive ?? -1;
                const curRoom = creep.room?.name ?? '?';
                const storeCap = creep.store.getCapacity();
                const storeInfo = storeCap === 0
                    ? '--'
                    : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
                const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);

                let status: string;
                if (creep.memory.remoteRenewing) {
                    status = 'renewing';
                } else if (creep.memory.remoteStandby) {
                    status = 'standby';
                } else if (curRoom === remoteName) {
                    const mode: Record<string, string> = {
                        remoteMiner: 'mining',
                        remoteHauler: 'hauling',
                        remoteMaintainer: 'maintaining',
                        remoteScout: 'scouting',
                        claimer: creep.memory.remoteMode === 'reserve' ? 'reserving' : 'claiming'
                    };
                    status = mode[archetype] ?? 'on-site';
                } else {
                    status = 'traveling';
                }

                lines.push(
                    `${archetype.padEnd(16)} ${name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
                    `${curRoom.padEnd(8)} ${status.padEnd(11)} en=${storeInfo.padEnd(7)} src=${src}`
                );
            }

            if (lines.length === 0) { continue; }

            const archetypeOrder: Record<string, number> = {
                remoteMiner: 0, remoteHauler: 1, remoteMaintainer: 2,
                remoteScout: 3, claimer: 4
            };
            lines.sort((a, b) => {
                const aType = a.slice(0, 16).trim();
                const bType = b.slice(0, 16).trim();
                return (archetypeOrder[aType] ?? 99) - (archetypeOrder[bType] ?? 99) ||
                    a.slice(17, 31).localeCompare(b.slice(17, 31));
            });

            console.log(`[REMOTE] ${remoteName} (home: ${room.name}):`);
            for (const line of lines) {
                console.log(`  ${line}`);
            }

            const sourceSummary: string[] = [];
            for (const [sourceId, sourcePlan] of Object.entries(plan.sources ?? {})) {
                let minerCount = 0;
                let minerWork = 0;
                let haulerCount = 0;
                let haulerCap = 0;

                for (const name in Game.creeps) {
                    const creep = Game.creeps[name];
                    if (creep.memory.homeRoom !== room.name) { continue; }
                    if (creep.memory.remoteRoom !== remoteName) { continue; }
                    if (creep.spawning) { continue; }
                    const src = creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '';
                    if (src !== sourceId) { continue; }

                    const archetype = ensureArchetype(creep);
                    if (archetype === 'remoteMiner') {
                        minerCount++;
                        minerWork += creep.getActiveBodyparts(WORK);
                    } else if (archetype === 'remoteHauler') {
                        haulerCount++;
                        haulerCap += creep.store.getCapacity();
                    }
                }

                const shortId = sourceId.slice(-8);
                const wd = sourcePlan.workDemand ?? '?';
                const hd = sourcePlan.haulerCapacityDemand ?? '?';
                const dist = sourcePlan.pathDistance ?? '?';
                sourceSummary.push(
                    `  src=${shortId}  miners=${minerCount} (${minerWork}W)` +
                    `  haulers=${haulerCount} (${haulerCap}C)` +
                    `  demand=${wd}W/${hd}C  dist=${dist}`
                );
            }

            if (sourceSummary.length > 0) {
                console.log(`  --- Allocation ---`);
                for (const s of sourceSummary) {
                    console.log(s);
                }
            }
        }
    }
}

function printHomeCreepStatus(homeRoom: string): void {
    const archetypes: string[] = [];
    const counts: Record<string, number> = {};
    const lines: string[] = [];

    const statusLabels: Record<string, string> = {
        harvestSource: 'harvestSrc',
        withdrawEnergy: 'withdraw',
        depositEnergy: 'deposit',
        pickupEnergy: 'pickup',
        refillSpawn: 'refill',
        refillTower: 'refillTow',
        build: 'build',
        repair: 'repair',
        upgrade: 'upgrade',
        heal: 'heal',
        mineMineral: 'mineMin',
        depositMineral: 'depositMin',
        withdrawResource: 'wdRsrc',
        depositResource: 'depRsrc',
        pickupResource: 'puRsrc',
        reserveController: 'reserve',
        claimController: 'claim',
        travelRoom: 'traveling',
        idle: 'IDLE'
    };

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom !== homeRoom) { continue; }
        if (creep.memory.remoteRoom) { continue; }
        if (creep.spawning) { continue; }

        const archetype = ensureArchetype(creep);
        if (!counts[archetype]) {
            counts[archetype] = 0;
            archetypes.push(archetype);
        }
        counts[archetype]++;

        const ttl = creep.ticksToLive ?? -1;
        const storeCap = creep.store.getCapacity();
        const storeInfo = storeCap === 0
            ? '--'
            : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
        const jobLabel = statusLabels[creep.memory.jobType ?? ''] ?? creep.memory.jobType ?? '-';
        const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);

        lines.push(
            `${archetype.padEnd(16)} ${name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${jobLabel.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            (src ? ` src=${src}` : '')
        );
    }

    if (lines.length === 0) {
        console.log(`[HOME] ${homeRoom}: no creeps`);
        return;
    }

    const fleetSummary = archetypes
        .sort()
        .map(a => `${a}=${counts[a]}`)
        .join('  ');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`[HOME] ${homeRoom}:  ${fleetSummary}  total=${total}`);
    for (const line of lines) {
        console.log(`  ${line}`);
    }
}

export type DebugConsoleApi = {
    trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
    dumpRemote: (homeRoom: string, remoteRoom: string) => string;
    dumpHome: (homeRoom: string) => string;
};

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
