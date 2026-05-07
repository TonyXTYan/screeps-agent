import * as creepRoleBalance from './creep.roleBalance';

export function checkDefenders(room: Room): void {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) { return; }

    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) { return; }

    const targetDefenders = Math.ceil(hostiles.length * 1.5);
    let defenders = 0;
    for (const name in Game.creeps) {
        if (Game.creeps[name].memory.role === 'defender') { defenders++; }
    }

    console.log('creep.populationControl: Hostiles: ' + hostiles.length + ', defenders: ' + defenders + '/' + targetDefenders);
    if (defenders >= targetDefenders) { return; }

    const energy = room.energyAvailable; // includes spawn + extensions natively
    const defenderBody: BodyPartConstant[] = energy >= 300
        ? creepRoleBalance.balanceSpec(creepRoleBalance.specification.defender, energy)
        : [TOUGH, MOVE, ATTACK];

    const newName = 'Defender' + Game.time;
    const o = spawn.spawnCreep(defenderBody, newName, { memory: { role: 'defender', attacking: true } });
    console.log('creep.populationControl: Spawning new defender: ' + newName + ', returned: ' + o);
}
