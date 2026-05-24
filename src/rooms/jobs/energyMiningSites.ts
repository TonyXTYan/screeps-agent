import type { RoomControllerContext } from '../controllerTypes';

export function haulerMiningSiteMinPickup(creep: Creep): number {
    return Math.max(1, Math.ceil(creep.store.getCapacity() * 0.5));
}

export function isMiningSiteEnergyTarget(
    context: RoomControllerContext,
    target: StructureContainer | StructureStorage | StructureTerminal | StructureLink
): boolean {
    if (target.structureType === STRUCTURE_LINK) {
        return context.structures.links.source.some((link) => link.id === target.id);
    }
    if (target.structureType !== STRUCTURE_CONTAINER) { return false; }
    if (context.mineralPlan?.container?.id === target.id) { return true; }
    return context.sourcePlans.some((sourcePlan) => sourcePlan.container?.id === target.id);
}

export function miningSiteContainerIds(context: RoomControllerContext): { [id: string]: boolean } {
    const sourceContainerIds: { [id: string]: boolean } = {};
    for (const sourcePlan of context.sourcePlans) {
        if (sourcePlan.container) {
            sourceContainerIds[sourcePlan.container.id] = true;
        }
    }
    if (context.mineralPlan?.container) {
        sourceContainerIds[context.mineralPlan.container.id] = true;
    }
    return sourceContainerIds;
}
