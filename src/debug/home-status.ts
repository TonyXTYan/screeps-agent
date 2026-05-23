import { ensureArchetype } from '../creeps/capabilities';
import { targetLabel } from './labels';
import { printMineralStatus } from './mineral';

export function printHomeCreepStatus(homeRoom: string): void {
    const room = Game.rooms[homeRoom];
    if (room) { printMineralStatus(room); }

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
        const isRenewing = creep.memory.renewing === true;
        const jobLabel = isRenewing
            ? 'renewing'
            : (statusLabels[creep.memory.jobType ?? ''] ?? creep.memory.jobType ?? '-');
        const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);
        const w = creep.getActiveBodyparts(WORK);
        const c = creep.getActiveBodyparts(CARRY);
        const m = creep.getActiveBodyparts(MOVE);
        const bodyStr = `W${w}C${c}M${m}`;
        const tgt = targetLabel(creep);
        const intReason = creep.memory.interruptReason;
        const intStr = intReason ? ` i=${intReason}` : '';
        const primaryJob = creep.memory.primaryJobType;
        const primaryStr = (primaryJob && primaryJob !== creep.memory.jobType)
            ? ` pri=${statusLabels[primaryJob] ?? primaryJob}`
            : '';

        let extra = '';
        if (tgt) extra += ` ${tgt}`;
        extra += ` ${bodyStr}`;
        if (intStr) extra += intStr;
        if (primaryStr) extra += primaryStr;

        lines.push(
            `${archetype.padEnd(16)} ${name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${jobLabel.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            extra +
            (src ? ` src=${src}` : '')
        );
    }

    let enStr = room ? `en=${room.energyAvailable}/${room.energyCapacityAvailable}` : '';
    if (room) {
        const parts: string[] = [];
        const storage = room.storage;
        if (storage) {
            parts.push(`storage=${storage.store.getUsedCapacity(RESOURCE_ENERGY)}`);
        }
        const containers = room.find(FIND_STRUCTURES).filter(
            s => s.structureType === STRUCTURE_CONTAINER
        ) as StructureContainer[];
        if (containers.length > 0) {
            const containerEnergy = containers
                .map(c => `${c.store.getUsedCapacity(RESOURCE_ENERGY)}`)
                .join('+');
            parts.push(`containers=${containerEnergy}`);
        }
        const links = room.find(FIND_STRUCTURES).filter(
            s => s.structureType === STRUCTURE_LINK
        ) as StructureLink[];
        if (links.length > 0) {
            const linkEnergy = links
                .map(l => `${l.store.getUsedCapacity(RESOURCE_ENERGY)}`)
                .join('+');
            parts.push(`links=${linkEnergy}`);
        }
        const terminal = room.terminal;
        if (terminal) {
            parts.push(`terminal=${terminal.store.getUsedCapacity(RESOURCE_ENERGY)}`);
        }
        const towers = room.find(FIND_STRUCTURES).filter(
            s => s.structureType === STRUCTURE_TOWER
        ) as StructureTower[];
        const lowTowers = towers.filter(t => t.store.getUsedCapacity(RESOURCE_ENERGY) / t.store.getCapacity(RESOURCE_ENERGY) < 0.55);
        const spawnExtensionPressure = room.find(FIND_STRUCTURES)
            .filter((s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION)
            .reduce((total, structure) => total + (structure as StructureSpawn | StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY), 0);
        const hasEnergyDemand = spawnExtensionPressure > 0 || lowTowers.length > 0;
        parts.push(`demand=${hasEnergyDemand ? 'YES' : 'no'}`);
        parts.push(`recoveryPull=${room.memory.energyRecoveryActive ? 'YES' : 'no'}`);
        parts.push(`recoveryReason=${room.memory.energyRecoveryReason ?? 'none'}`);
        if (parts.length > 0) {
            enStr += '  ' + parts.join('  ');
        }
    }

    if (lines.length === 0) {
        console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
        return;
    }

    const fleetSummary = archetypes
        .sort()
        .map(a => `${a}=${counts[a]}`)
        .join('  ');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
    console.log(`  ${fleetSummary}  total=${total}`);
    for (const line of lines) {
        console.log(`  ${line}`);
    }
}
