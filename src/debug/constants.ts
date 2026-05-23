export const DEBUG_CREEP_INTERVAL = 10;
export const debugState = { creepsLastPrintedAt: undefined as number | undefined };

export const STRUCT_LABEL: Record<string, string> = {
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
