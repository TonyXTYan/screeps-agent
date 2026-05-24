import {
    BODY_BUDGET_RATIO,
    BODY_MIN_BUDGET,
    MAX_CARRY_CAPACITY,
} from '../../creep.capabilities';
import { desiredUpgraderWork } from '../jobs/work';
import type { RoomControllerContext } from '../controllerTypes';

export function desiredHaulerCapacity(context: RoomControllerContext): { demand: number; maxCount: number } {
    const base = context.structures.storage ? 600 : 300;
    const rclBonus = (context.room.controller?.level ?? 0) >= 7 ? 300 : 0;
    const salvageBonus = context.tombstones.length > 0 || context.ruins.length > 0 || context.droppedResources.length > 10 ? 300 : 0;
    const rawDemand = context.sources.length * base + rclBonus + salvageBonus;

    const haulerBudget = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
    const maxCarryPerHauler = Math.min(MAX_CARRY_CAPACITY, 2 * Math.floor(haulerBudget / 150) * CARRY_CAPACITY);
    const maxCount = Math.max(2, Math.ceil(rawDemand / Math.max(1, maxCarryPerHauler)) + 1);
    return { demand: Math.min(rawDemand, maxCarryPerHauler * maxCount), maxCount };
}

export function desiredWorkerWork(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (context.constructionSites.length > 0) {
        const base = Math.min(12, 4 + context.constructionSites.length);

        if (rcl >= 4) {
            const ratio = workerWorkRatio(context);
            const unitCost = ratio * 100 + 100;
            const unitParts = ratio + 2;
            const energyAvail = Math.max(BODY_MIN_BUDGET, Math.floor(context.room.energyCapacityAvailable * BODY_BUDGET_RATIO));
            const segments = Math.min(
                Math.floor(50 / unitParts),
                Math.floor(energyAvail / unitCost)
            );
            const workPerWorker = segments * ratio;
            const upgradeDemand = desiredUpgraderWork(rcl);
            const minWorkers = Math.max(2, 1 + Math.ceil(upgradeDemand / Math.max(1, workPerWorker)));
            return Math.max(base, minWorkers * workPerWorker);
        }

        return base;
    }
    if (rcl >= 8) { return 8; }
    if (rcl >= 7) { return 6; }
    return 4;
}

export function workerWorkRatio(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    if (rcl < 3) { return 1; }
    const remainingWork = context.constructionSites.reduce(
        (sum, site) => sum + (site.progressTotal - site.progress), 0);
    if (rcl >= 4 && remainingWork > 30000) { return 3; }
    if (remainingWork > 10000) { return 2; }
    return 1;
}

export function maxWorkerCount(context: RoomControllerContext): number {
    const rcl = context.room.controller?.level ?? 0;
    return context.constructionSites.length < 3
        ? 1
        : ([0, 2, 2, 2, 3, 3, 3, 4, 4][Math.min(rcl, 8)] || 4);
}
