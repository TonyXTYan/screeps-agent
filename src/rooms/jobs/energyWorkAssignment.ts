import { getCreepCapabilities } from '../../creep.capabilities';
import { rememberPrimaryJob, setJob } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { refillSpawnTarget, refillTerminalTarget, refillTowerTarget } from '../energy';
import {
    reserveConstructionProgress,
    reserveEnergySink,
    reserveRepairProgress
} from './reservations';
import {
    bestConstructionSite,
    repairTargetFor,
    shouldRepairWithCreeps,
    shouldReserveUpgrade
} from './work';

export type Capabilities = ReturnType<typeof getCreepCapabilities>;

export function tryAssignRefillPriority(
    context: RoomControllerContext,
    creep: Creep,
    reservations: JobReservations
): boolean {
    const spawnTarget = refillSpawnTarget(context, creep, reservations);
    if (spawnTarget) {
        reserveAndSetEnergySink(creep, reservations, 'refillSpawn', spawnTarget);
        return true;
    }

    const towerTarget = refillTowerTarget(context, creep, reservations);
    if (towerTarget) {
        reserveAndSetEnergySink(creep, reservations, 'refillTower', towerTarget);
        return true;
    }

    const terminalTarget = refillTerminalTarget(context, creep, reservations);
    if (terminalTarget) {
        reserveAndSetEnergySink(creep, reservations, 'depositEnergy', terminalTarget);
        return true;
    }

    return false;
}

export function tryAssignBuildPrimary(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    if (capabilities.build <= 0 || context.constructionSites.length === 0) { return false; }
    const site = bestConstructionSite(creep, context.constructionSites, reservations, capabilities.build);
    if (!site) { return false; }
    reserveConstructionProgress(reservations, site, capabilities.build);
    rememberPrimaryJob(creep, 'build', site);
    setJob(creep, 'build', site);
    return true;
}

export function tryAssignRepairPrimary(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    if (capabilities.repair <= 0 || context.repairTargets.length === 0 || !shouldRepairWithCreeps(context)) {
        return false;
    }
    const repairTarget = repairTargetFor(creep, context.repairTargets, reservations, capabilities.repair);
    if (!repairTarget) { return false; }
    reserveRepairProgress(reservations, repairTarget, capabilities.repair);
    rememberPrimaryJob(creep, 'repair', repairTarget);
    setJob(creep, 'repair', repairTarget);
    return true;
}

export function tryAssignReservedUpgradePrimary(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    if (capabilities.upgrade <= 0 || !context.room.controller || !shouldReserveUpgrade(context, reservations)) {
        return false;
    }
    reservations.upgraderWork += capabilities.upgrade;
    rememberPrimaryJob(creep, 'upgrade', context.room.controller);
    setJob(creep, 'upgrade', context.room.controller);
    return true;
}

export function tryAssignUpgradePrimary(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    if (capabilities.upgrade <= 0 || !context.room.controller) { return false; }
    reservations.upgraderWork += capabilities.upgrade;
    rememberPrimaryJob(creep, 'upgrade', context.room.controller);
    setJob(creep, 'upgrade', context.room.controller);
    return true;
}

function reserveAndSetEnergySink(
    creep: Creep,
    reservations: JobReservations,
    jobType: 'refillSpawn' | 'refillTower' | 'depositEnergy',
    target: EnergyStructure
): void {
    reserveEnergySink(
        reservations,
        target,
        Math.min(
            creep.store.getUsedCapacity(RESOURCE_ENERGY),
            target.store.getFreeCapacity(RESOURCE_ENERGY)
        )
    );
    setJob(creep, jobType, target);
}
