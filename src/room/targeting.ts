// Room targeting utilities: find closest/best targets, heal priority, role mapping.

import { isHostile } from '../hostileUtils';
import { DOCTOR_EMERGENCY_HITS_RATIO, DOCTOR_THREAT_RADIUS } from './constants';

export function closest<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const range = creep.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }
    return best;
}

export function closestReachable<T extends RoomObject>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }
    return creep.pos.findClosestByPath(targets, { ignoreCreeps: false }) as T | null;
}

export function closestByRange<T extends RoomObject>(origin: RoomObject, targets: T[]): T | null {
    if (targets.length === 0) { return null; }

    let best = targets[0];
    let bestRange = origin.pos.getRangeTo(best);
    for (const target of targets) {
        const range = origin.pos.getRangeTo(target);
        if (range < bestRange) {
            best = target;
            bestRange = range;
        }
    }
    return best;
}

// Picks the structure with the lowest HP ratio (most degraded), using range as a tie-breaker.
export function worstHits<T extends Structure>(creep: Creep, targets: T[]): T | null {
    if (targets.length === 0) { return null; }
    let best = targets[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of targets) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const range = creep.pos.getRangeTo(target);
        if (ratio < bestRatio || (ratio === bestRatio && range < bestRange)) {
            best = target;
            bestRatio = ratio;
            bestRange = range;
        }
    }
    return best;
}

export function bestHealTarget(creep: Creep, targets: Creep[]): Creep | null {
    if (targets.length === 0) { return null; }

    const emergencyTargets = targets.filter((target) => isEmergencyHealTarget(target));
    const pool = emergencyTargets.length > 0 ? emergencyTargets : targets;

    let best = pool[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = creep.pos.getRangeTo(best);
    for (const target of pool) {
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

export function isEmergencyHealTarget(target: Creep): boolean {
    if (target.hits / Math.max(1, target.hitsMax) <= DOCTOR_EMERGENCY_HITS_RATIO) {
        return true;
    }
    return target.pos.findInRange(FIND_HOSTILE_CREEPS, DOCTOR_THREAT_RADIUS, {
        filter: isHostile
    }).length > 0;
}

export function legacyRoleForArchetype(archetype: CreepArchetype): string {
    if (archetype === 'patrol') { return 'patrol'; }
    if (archetype === 'doctor') { return 'builder'; }
    if (archetype === 'hauler' || archetype === 'miner' || archetype === 'mineralMiner' || archetype === 'remoteHauler' || archetype === 'remoteMiner') { return 'harvester'; }
    if (archetype === 'remoteMaintainer' || archetype === 'remoteScout') { return 'manual'; }
    if (archetype === 'claimer') { return 'manual'; }
    return 'builder';
}
