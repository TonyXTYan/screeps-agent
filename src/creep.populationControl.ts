import * as creepRoleBalance from './creep.roleBalance';
import { bodyCost } from './creep.capabilities';

const DEFENDER_SPAWN_ATTEMPT_INTERVAL = 5;

export function checkDefenders(room: Room): void {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) { return; }

    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) { return; }

    const targetDefenders = Math.ceil(hostiles.length * 1.5);
    let defenders = 0;
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role !== 'defender') { continue; }
        if (creep.room.name !== room.name && creep.memory.homeRoom !== room.name) { continue; }
        defenders++;
    }

    if (Game.time % DEFENDER_SPAWN_ATTEMPT_INTERVAL === 0) {
        console.log('creep.populationControl: Hostiles: ' + hostiles.length + ', defenders: ' + defenders + '/' + targetDefenders);
    }
    if (defenders >= targetDefenders) { return; }

    const energy = room.energyAvailable; // includes spawn + extensions natively
    const defenderBody: BodyPartConstant[] = energy >= 300
        ? creepRoleBalance.balanceSpec(creepRoleBalance.specification.defender, energy)
        : [TOUGH, MOVE, ATTACK];
    const defenderBodyCost = bodyCost(defenderBody);
    if (energy < defenderBodyCost || Game.time % DEFENDER_SPAWN_ATTEMPT_INTERVAL !== 0) { return; }

    const newName = 'Defender-' + spawn.name + '-' + Game.time;
    const o = spawn.spawnCreep(defenderBody, newName, { memory: { role: 'defender', attacking: true, homeRoom: room.name } });
    console.log('creep.populationControl: Spawning new defender: ' + newName + ', returned: ' + o);
}
