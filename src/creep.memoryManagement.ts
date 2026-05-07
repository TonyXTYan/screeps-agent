export function run(): void {
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('creep.MemoryManagement: Clearing non-existing creep memory:', name);
        }
    }

    const dictKey: { [key: number]: string } = {
        0: 'builder',
        1: 'harvester',
        2: 'upgrader'
    };

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role === undefined && !creep.spawning) {
            const num = Math.floor(Math.random() * 3);
            const role = dictKey[num];
            creep.memory.role = role;
            console.log('creep.MemoryManagement: ' + name + ' have been assigned ' + role);
        }
    }
}
