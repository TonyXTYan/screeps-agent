/**
 * Shared utility functions used across multiple modules.
 * Extracted to eliminate code duplication.
 */

/**
 * Returns the first resource with positive amount in a store.
 * Prefers non-energy resources (more valuable), falls back to energy.
 */
export function firstStoredResource(store: StoreDefinition): ResourceConstant | null {
    let fallback: ResourceConstant | null = null;
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (store.getUsedCapacity(resource) <= 0) { continue; }
        if (resource !== RESOURCE_ENERGY) { return resource; }
        fallback = resource;
    }
    return fallback;
}

/**
 * Moves a creep away from room edges/corners to prevent stuck positions.
 * Returns true if the creep was on an edge and moved, false otherwise.
 */
export function nudgeFromRoomEdge(creep: Creep): boolean {
    // Corner cases
    if (creep.pos.x === 0 && creep.pos.y === 0) {
        creep.move(BOTTOM_RIGHT);
        return true;
    }
    if (creep.pos.x === 0 && creep.pos.y === 49) {
        creep.move(TOP_RIGHT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 0) {
        creep.move(BOTTOM_LEFT);
        return true;
    }
    if (creep.pos.x === 49 && creep.pos.y === 49) {
        creep.move(TOP_LEFT);
        return true;
    }

    // Edge cases
    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return true;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return true;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return true;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
        return true;
    }

    return false;
}

/**
 * Selects the most critical (lowest health ratio) creep from a list.
 * Ties broken by: most missing HP, then closest range.
 */
export function mostCriticalCreep(referenceCreep: Creep, candidates: Creep[]): Creep | null {
    if (candidates.length === 0) { return null; }

    let best = candidates[0];
    let bestRatio = best.hits / Math.max(1, best.hitsMax);
    let bestMissing = best.hitsMax - best.hits;
    let bestRange = referenceCreep.pos.getRangeTo(best);

    for (const target of candidates) {
        const ratio = target.hits / Math.max(1, target.hitsMax);
        const missing = target.hitsMax - target.hits;
        const range = referenceCreep.pos.getRangeTo(target);

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
