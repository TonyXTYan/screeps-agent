// Leaf-level store utilities with no other room-module dependencies.
// Both room.work.ts and room.energy.ts import from here to avoid circular deps.

export function totalStoredTargets(targets: Array<Tombstone | Ruin>): number {
    let total = 0;
    for (const target of targets) {
        total += totalStoredResources(target.store);
    }
    return total;
}

export function totalStoredResources(store: StoreDefinition): number {
    let total = 0;
    for (const resourceName in store) {
        total += store.getUsedCapacity(resourceName as ResourceConstant);
    }
    return total;
}

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

export function firstStoredNonEnergyResource(store: StoreDefinition): ResourceConstant | null {
    for (const resourceName in store) {
        const resource = resourceName as ResourceConstant;
        if (resource === RESOURCE_ENERGY) { continue; }
        if (store.getUsedCapacity(resource) > 0) { return resource; }
    }
    return null;
}

export function haulerMiningSiteMinPickup(creep: Creep): number {
    return Math.max(1, Math.ceil(creep.store.getCapacity() * 0.5));
}
