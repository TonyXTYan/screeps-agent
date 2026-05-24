import { clearPrimaryJob, setJob } from '../../creeps/jobs/memory';
import { wallRampartRepairCap } from '../../repairs/policy';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import {
    remainingConstructionProgress,
    remainingRepairProgress,
    reserveConstructionProgress,
    reserveRepairProgress
} from './reservations';
import {
    repairTargetFor,
    shouldRepairWithCreeps,
    shouldReserveUpgrade
} from './work';
import type { Capabilities } from './energyWorkAssignment';

export function resumePrimaryEnergyJob(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    const jobType = creep.memory.primaryJobType;
    const targetId = creep.memory.primaryTargetId;
    if (!jobType || !targetId) { return false; }
    if (jobType !== 'build' && jobType !== 'repair' && jobType !== 'upgrade') {
        clearPrimaryJob(creep);
        return false;
    }

    const target = Game.getObjectById(targetId as Id<any>) as (RoomObject & { id: string }) | null;
    if (!target) {
        clearPrimaryJob(creep);
        return false;
    }

    if (jobType === 'build') {
        const site = target as ConstructionSite;
        if (capabilities.build <= 0 || site.progress >= site.progressTotal || remainingConstructionProgress(site, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        reserveConstructionProgress(reservations, site, capabilities.build);
        setJob(creep, 'build', site);
        return true;
    }

    if (jobType === 'repair') {
        const structure = target as AnyStructure;
        const isDefense = structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
        const repairRcl = creep.room.controller?.level ?? 0;
        const maxHits = isDefense ? Math.min(wallRampartRepairCap(repairRcl), structure.hitsMax) : structure.hitsMax * 0.9;
        if (capabilities.repair <= 0 || structure.hits >= maxHits || remainingRepairProgress(structure, reservations) <= 0) {
            clearPrimaryJob(creep);
            return false;
        }
        if (shouldRepairWithCreeps(context) && context.repairTargets.length > 0) {
            const primaryRemaining = remainingRepairProgress(structure, reservations);
            const best = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
            if (best && best.id !== structure.id && remainingRepairProgress(best, reservations) > primaryRemaining * 2) {
                clearPrimaryJob(creep);
                return false;
            }
        }
        reserveRepairProgress(reservations, structure, capabilities.repair);
        setJob(creep, 'repair', structure);
        return true;
    }

    if (!context.room.controller || target.id !== context.room.controller.id || capabilities.upgrade <= 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (!shouldReserveUpgrade(context, reservations) && context.constructionSites.length > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    if (Object.keys(reservations.constructionProgress).length === 0 && context.constructionSites.length > 0 && capabilities.build > 0) {
        clearPrimaryJob(creep);
        return false;
    }
    reservations.upgraderWork += capabilities.upgrade;
    setJob(creep, 'upgrade', context.room.controller);
    return true;
}
