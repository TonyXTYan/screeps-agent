import { ensureArchetype } from '../creep.capabilities';
import { remoteNavLabel } from './remoteStatusNav';
import {
    remoteEnergyTargetClaimCount,
    remoteMinerPathingLabel,
    remoteStatusLabel,
    remoteTargetLabel,
    standbyParkLabel
} from './remoteStatusLineSignals';

export type RemoteStatusEntry = {
    archetype: string;
    creepName: string;
    line: string;
};

export function buildRemoteStatusEntry(creep: Creep, remoteRoomName: string): RemoteStatusEntry {
    const archetype = ensureArchetype(creep);
    const ttl = creep.ticksToLive ?? -1;
    const curRoom = creep.room?.name ?? '?';
    const storeCap = creep.store.getCapacity();
    const storeInfo = storeCap === 0
        ? '--'
        : `${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${storeCap}`;
    const src = (creep.memory.assignedSourceId ?? creep.memory.sourceId ?? '').slice(-8);
    const status = remoteStatusLabel(creep, archetype, curRoom, remoteRoomName);

    const body = `W${creep.getActiveBodyparts(WORK)}C${creep.getActiveBodyparts(CARRY)}M${creep.getActiveBodyparts(MOVE)}`;
    const target = remoteTargetLabel(creep);
    const station = creep.memory.stationX !== undefined
        ? ` stn=[${creep.memory.stationX},${creep.memory.stationY}]`
        : '';
    const job = creep.memory.jobType ? ` job=${creep.memory.jobType}` : '';
    const jobTarget = creep.memory.jobTargetId ? ` tgt=${creep.memory.jobTargetId.slice(-8)}` : '';
    const pos = ` pos=[${creep.pos.x},${creep.pos.y}]`;
    const result = creep.memory.lastJobResult !== undefined ? ` res=${creep.memory.lastJobResult}` : '';
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const stuck = stuckTicks > 0 ? ` stuck=${stuckTicks}` : '';
    const pathing = remoteMinerPathingLabel(creep);
    const standbyPark = standbyParkLabel(creep);
    const claimCount = archetype === 'remoteHauler' &&
        creep.memory.jobTargetId &&
        (creep.memory.jobType === 'withdrawEnergy' || creep.memory.jobType === 'pickupEnergy')
        ? ` clm=${remoteEnergyTargetClaimCount(creep, creep.memory.jobTargetId)}`
        : '';
    const nav = remoteNavLabel(creep);

    return {
        archetype,
        creepName: creep.name,
        line: `${archetype.padEnd(16)} ${creep.name.padEnd(14)} ttl=${String(ttl).padStart(4)}  ` +
            `${curRoom.padEnd(8)} ${status.padEnd(11)} en=${storeInfo.padEnd(7)}` +
            ` src=${src}` +
            pos +
            station +
            (target ? ` ${target}` : '') +
            ` ${body}` +
            job +
            jobTarget +
            result +
            claimCount +
            stuck +
            pathing +
            standbyPark +
            nav
    };
}
