type EnergyStructure =
    StructureExtension |
    StructureSpawn |
    StructureContainer |
    StructureTower |
    StructureStorage |
    StructureTerminal |
    StructureLink;

type WithdrawStructure =
    StructureContainer |
    StructureStorage |
    StructureTerminal |
    StructureLink |
    Tombstone |
    Ruin;

type CreepArchetype =
    'worker' |
    'miner' |
    'hauler' |
    'doctor' |
    'claimer' |
    'defender' |
    'remoteMiner' |
    'remoteHauler' |
    'remoteMaintainer' |
    'remoteScout' |
    'mineralMiner';

type CreepJobType =
    'harvestSource' |
    'withdrawEnergy' |
    'withdrawResource' |
    'pickupEnergy' |
    'pickupResource' |
    'depositEnergy' |
    'depositResource' |
    'refillSpawn' |
    'refillTower' |
    'build' |
    'repair' |
    'upgrade' |
    'heal' |
    'mineMineral' |
    'depositMineral' |
    'reserveController' |
    'claimController' |
    'travelRoom' |
    'idle';

type RemoteRoomMode = 'harvest' | 'reserve' | 'claim';
type RemoteRouteHealth = 'healthy' | 'degraded';
type EnergyRecoveryReason = 'none' | 'spawn' | 'tower' | 'spawn+tower' | 'hysteresis';

declare const console: {
    log(...args: unknown[]): void;
};
