import { setJob } from '../../creeps/jobs/memory';
import { closest } from '../../utils/selection';
import { REMOTE_HAULER_RETARGET_STUCK_TICKS, findRemoteEnergySource } from './energy';
import { closestRemoteInfrastructureSite } from './infrastructure';

const REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD = 0.25;

export function assignRemoteMaintainerRole(creep: Creep, remotePlan: RemoteRoomPlan): boolean {
    const criticalContainer = closest(creep, creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD
    }) as AnyStructure[]);
    if (criticalContainer && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        setJob(creep, 'repair', criticalContainer);
        return true;
    }
    const site = closestRemoteInfrastructureSite(creep, true) ??
        closest(creep, creep.room.find(FIND_MY_CONSTRUCTION_SITES));
    if (site && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        setJob(creep, 'build', site);
        return true;
    }
    const repair = closest(creep, creep.room.find(FIND_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.9
    }) as AnyStructure[]);
    if (repair && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        setJob(creep, 'repair', repair);
        return true;
    }
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        const remoteEnergy = findRemoteEnergySource(creep, remotePlan, {
            droppedFirst: false,
            droppedMinAmount: 50
        });
        if (remoteEnergy) {
            setJob(creep, remoteEnergy.jobType, remoteEnergy.target);
            return true;
        }

        // Avoid a source we're currently stuck on (mirrors hauler retarget logic).
        const stuckOnSourceId = (creep.memory.travelStuckTicks ?? 0) >= REMOTE_HAULER_RETARGET_STUCK_TICKS
            && creep.memory.jobType === 'harvestSource'
            ? creep.memory.jobTargetId : undefined;
        const allSources = creep.room.find(FIND_SOURCES);
        const preferred = stuckOnSourceId ? allSources.filter(s => s.id !== stuckOnSourceId) : allSources;
        const sourcePool = preferred.length > 0 ? preferred : allSources;
        const source = (creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: false })
            ?? creep.pos.findClosestByPath(sourcePool, { ignoreCreeps: true })) as Source | null;
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }
    }
    return false;
}
