import { getCreepCapabilities } from '../../creep.capabilities';
import { setJob } from '../../creeps/jobs/memory';
import type { JobReservations, RoomControllerContext } from '../controllerTypes';
import { spawnEnergyRatio } from '../energy';
import { energyDepositTarget } from './energyTargets';
import { resumePrimaryEnergyJob } from './energyWorkPrimaryResume';
import {
    type Capabilities,
    tryAssignBuildPrimary,
    tryAssignRefillPriority,
    tryAssignRepairPrimary,
    tryAssignReservedUpgradePrimary,
    tryAssignUpgradePrimary
} from './energyWorkAssignment';

export function assignWorkerPartialEnergyWork(
    context: RoomControllerContext,
    creep: Creep,
    capabilities: Capabilities,
    reservations: JobReservations
): boolean {
    return tryAssignBuildPrimary(context, creep, capabilities, reservations) ||
        tryAssignRepairPrimary(context, creep, capabilities, reservations) ||
        tryAssignReservedUpgradePrimary(context, creep, capabilities, reservations);
}

export function assignEnergySpendingJob(
    context: RoomControllerContext,
    creep: Creep,
    archetype: CreepArchetype,
    capabilities: Capabilities,
    reservations: JobReservations
): void {
    const spawnRatio = spawnEnergyRatio(context);
    if (!(archetype === 'worker' && context.structures.storage && spawnRatio >= 0.5)) {
        if (tryAssignRefillPriority(context, creep, reservations)) { return; }
    }

    const resumed = resumePrimaryEnergyJob(context, creep, capabilities, reservations);
    if (resumed) { return; }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        const sink = energyDepositTarget(context, creep, reservations);
        if (sink) {
            setJob(creep, 'depositEnergy', sink);
            return;
        }
    }

    if (Object.keys(reservations.constructionProgress).length === 0 && capabilities.build > 0 && context.constructionSites.length > 0) {
        if (tryAssignBuildPrimary(context, creep, capabilities, reservations)) { return; }
    }

    if (reservations.upgraderWork === 0 &&
        tryAssignReservedUpgradePrimary(context, creep, capabilities, reservations)) {
        return;
    }

    if (tryAssignReservedUpgradePrimary(context, creep, capabilities, reservations)) { return; }
    if (tryAssignBuildPrimary(context, creep, capabilities, reservations)) { return; }
    if (tryAssignUpgradePrimary(context, creep, capabilities, reservations)) { return; }
    if (tryAssignRepairPrimary(context, creep, capabilities, reservations)) { return; }

    setJob(creep, 'depositEnergy', energyDepositTarget(context, creep, reservations));
}
