import { isHostile } from './hostiles';
import { mostCriticalCreep } from '../utils/creep';

const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
const DOCTOR_THREAT_RADIUS = 4;

export function emergencyHealTarget(creep: Creep): Creep | null {
    if (creep.getActiveBodyparts(HEAL) <= 0) { return null; }
    const injured = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
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

export function mostCriticalInRange(creep: Creep, range: number): Creep | null {
    const injured = creep.pos.findInRange(FIND_MY_CREEPS, range, {
        filter: c => c.hits < c.hitsMax
    });
    if (injured.length === 0) { return null; }

    return mostCriticalCreep(creep, injured);
}
