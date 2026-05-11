export function isHostile(creep: Creep): boolean {
    return creep.body.some(p => p.type === ATTACK)
        || creep.body.some(p => p.type === RANGED_ATTACK)
        || creep.body.some(p => p.type === HEAL);
}

export function findHostiles(room: Room): Creep[] {
    return room.find(FIND_HOSTILE_CREEPS, { filter: isHostile });
}
