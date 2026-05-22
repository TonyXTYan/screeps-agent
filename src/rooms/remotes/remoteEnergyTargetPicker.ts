import { shouldAvoidRemoteEnergyTarget } from './energyClaims';

export function pickRemoteEnergyTarget<T extends RoomObject & { id: string }>(
    creep: Creep,
    targets: T[],
    avoidTargetId?: string
): T | null {
    if (targets.length === 0) { return null; }

    const preferred = targets.filter((target) =>
        !shouldAvoidRemoteEnergyTarget(creep, target, avoidTargetId));
    const nonAvoided = targets.filter((target) =>
        !avoidTargetId || target.id !== avoidTargetId);
    const pool = preferred.length > 0
        ? preferred
        : (nonAvoided.length > 0 ? nonAvoided : targets);

    const byPath = creep.pos.findClosestByPath(pool, { ignoreCreeps: false }) as T | null;
    if (byPath) { return byPath; }

    return creep.pos.findClosestByPath(pool, { ignoreCreeps: true }) as T | null;
}

export function pickRemoteEnergyCandidateByTarget<T extends { target: RoomObject & { id: string } }>(
    creep: Creep,
    candidates: T[]
): T | null {
    if (candidates.length === 0) { return null; }
    const target = pickRemoteEnergyTarget(creep, candidates.map(candidate => candidate.target));
    return candidates.find(candidate => candidate.target.id === target?.id) ?? null;
}
