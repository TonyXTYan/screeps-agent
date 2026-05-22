import { ensureArchetype } from '../creep.capabilities';

const STRUCT_LABEL: Record<string, string> = {
    [STRUCTURE_SPAWN]: 'spawn',
    [STRUCTURE_EXTENSION]: 'ext',
    [STRUCTURE_ROAD]: 'road',
    [STRUCTURE_WALL]: 'wall',
    [STRUCTURE_RAMPART]: 'ramp',
    [STRUCTURE_STORAGE]: 'store',
    [STRUCTURE_TOWER]: 'tower',
    [STRUCTURE_LINK]: 'link',
    [STRUCTURE_CONTAINER]: 'cont',
    [STRUCTURE_LAB]: 'lab',
    [STRUCTURE_TERMINAL]: 'term',
    [STRUCTURE_NUKER]: 'nuker',
    [STRUCTURE_POWER_SPAWN]: 'pSpawn',
    [STRUCTURE_OBSERVER]: 'obsv',
    [STRUCTURE_EXTRACTOR]: 'extr',
    [STRUCTURE_FACTORY]: 'fact',
};

const STATUS_LABELS: Record<string, string> = {
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

export type HomeCreepStatusLine = {
    archetype: string;
    line: string;
};

export function buildHomeCreepStatusLine(creep: Creep): HomeCreepStatusLine {
    const archetype = ensureArchetype(creep);
    const ttl = creep.ticksToLive ?? -1;
    const storeCap = creep.store.getCapacity();
    const storeInfo = storeCap === 0
        ? '--'
        : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
    const isRenewing = creep.memory.renewing === true;
    const jobLabel = isRenewing
        ? 'renewing'
        : (STATUS_LABELS[creep.memory.jobType ?? ''] ?? creep.memory.jobType ?? '-');
    const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);
    const workParts = creep.getActiveBodyparts(WORK);
    const carryParts = creep.getActiveBodyparts(CARRY);
    const moveParts = creep.getActiveBodyparts(MOVE);
    const bodyStr = `W${workParts}C${carryParts}M${moveParts}`;
    const target = targetLabel(creep);
    const interruptReason = creep.memory.interruptReason;
    const interruptStr = interruptReason ? ` i=${interruptReason}` : '';
    const primaryJob = creep.memory.primaryJobType;
    const primaryStr = (primaryJob && primaryJob !== creep.memory.jobType)
        ? ` pri=${STATUS_LABELS[primaryJob] ?? primaryJob}`
        : '';

    let extra = '';
    if (target) { extra += ` ${target}`; }
    extra += ` ${bodyStr}`;
    if (interruptStr) { extra += interruptStr; }
    if (primaryStr) { extra += primaryStr; }

    return {
        archetype,
        line: `${archetype.padEnd(16)} ${creep.name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${jobLabel.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            extra +
            (src ? ` src=${src}` : '')
    };
}

function targetLabel(creep: Creep): string {
    const targetId = creep.memory.jobTargetId;
    if (!targetId) { return ''; }
    const target = Game.getObjectById(targetId as Id<any>);
    if (!target) { return ''; }
    if ('structureType' in (target as any)) {
        return STRUCT_LABEL[(target as any).structureType] ?? (target as any).structureType;
    }
    if ('mineralType' in (target as any)) {
        return (target as any).mineralType;
    }
    if ('resourceType' in (target as any)) {
        const resourceType = (target as any).resourceType;
        return resourceType === RESOURCE_ENERGY ? 'energy' : resourceType;
    }
    return '';
}
