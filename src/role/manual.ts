export function run(creep: Creep): void {
    const pos = creep.pos;
    const body = creep.body
        .filter(p => p.hits > 0)
        .map(p => p.type.charAt(0).toUpperCase())
        .join('');
    const used = creep.store.getUsedCapacity();
    const cap = creep.store.getCapacity();
    const storeInfo = cap > 0 ? `${used}/${cap}` : '-';
    const resources: string[] = [];
    for (const res of RESOURCES_ALL) {
        const amount = creep.store.getUsedCapacity(res as ResourceConstant);
        if (amount > 0) resources.push(`${res}=${amount}`);
    }
    const resourceInfo = resources.length > 0 ? ' ' + resources.join(' ') : '';
    console.log(`🦾 manual  ${creep.name}  [${pos.roomName} ${pos.x},${pos.y}]  body=${body}  store=${storeInfo}${resourceInfo}`);
}
