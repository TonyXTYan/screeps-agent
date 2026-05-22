import { isHostile } from '../hostileUtils';

const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;

export function emergencyHealTarget(creep: Creep): Creep | null {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return null; }
    const injured = creep.room.find(FIND_MY_CREEPS, {
        filter: (target) => target.hits < target.hitsMax
    });
    if (injured.length === 0) { return null; }

    const emergency = injured.filter((target) =>
        target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO ||
        target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
            filter: isHostile
        }).length > 0);
    if (emergency.length === 0) { return null; }

    return mostCriticalCreep(creep, emergency);
}

export function emergencyHealWhileRetreating(creep: Creep): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return; }

    const critical = mostCriticalInRange(creep, 1);
    if (critical) {
        creep.heal(critical);
        return;
    }

    const ranged = mostCriticalInRange(creep, 3);
    if (ranged) {
        creep.rangedHeal(ranged);
    }
}

function mostCriticalInRange(creep: Creep, range: number): Creep | null {
    const injured = creep.pos.findInRange(FIND_MY_CREEPS, range, {
        filter: (target) => target.hits < target.hitsMax
    });
    if (injured.length === 0) { return null; }

    return mostCriticalCreep(creep, injured);
}

function mostCriticalCreep(creep: Creep, injured: Creep[]): Creep | null {
    if (injured.length === 0) { return null; }
    let best = injured[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of injured) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio ||
            (ratio === bestRatio && missing > bestMissing) ||
            (ratio === bestRatio && missing === bestMissing && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestMissing = missing;
            bestRange = range;
        }
    }
    return best;
}
