import * as creepRoleBalance from '../creeps/roleBalance';
import { BODY_BUDGET_RATIO, BODY_MIN_BUDGET } from '../constants';
import { bodyCost } from '../creeps/capabilities';
import { isHostile } from '../combat/hostiles';

const DEFENDER_SPAWN_ATTEMPT_INTERVAL = 5;

export function checkDefenders(room: Room): void {
    const freeSpawns = room.find(FIND_MY_SPAWNS).filter(s => !s.spawning);
    if (freeSpawns.length === 0) { return; }

    const hostiles = room.find(FIND_HOSTILE_CREEPS, {
        filter: isHostile
    });
    if (hostiles.length === 0) { return; }

    const targetDefenders = Math.ceil(hostiles.length * 1.5);
    let defenders = 0;
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role !== 'defender') { continue; }
        if (creep.room.name !== room.name && creep.memory.homeRoom !== room.name) { continue; }
        defenders++;
    }

    const shouldAttemptDefenderSpawn = Game.time % DEFENDER_SPAWN_ATTEMPT_INTERVAL === 0;
    if (shouldAttemptDefenderSpawn) {
        console.log('creep.populationControl: Hostiles: ' + hostiles.length + ', defenders: ' + defenders + '/' + targetDefenders);
    }
    if (defenders >= targetDefenders) { return; }
    if (!shouldAttemptDefenderSpawn) { return; }

    let energy = room.energyAvailable; // includes spawn + extensions natively
    const defenderBudget = Math.max(BODY_MIN_BUDGET, Math.floor(room.energyCapacityAvailable * BODY_BUDGET_RATIO));

    for (const spawn of freeSpawns) {
        if (defenders >= targetDefenders) { return; }

        const cappedEnergy = Math.min(energy, defenderBudget);
        const defenderBody: BodyPartConstant[] = cappedEnergy >= 300
            ? creepRoleBalance.balanceSpec(creepRoleBalance.specification.defender, cappedEnergy)
            : [TOUGH, MOVE, ATTACK];
        const defenderBodyCost = bodyCost(defenderBody);
        if (energy < defenderBodyCost) { return; }

        const newName = 'Defender-' + spawn.name + '-' + Game.time;
        const o = spawn.spawnCreep(defenderBody, newName, { memory: { role: 'defender', attacking: true, homeRoom: room.name } });
        console.log('creep.populationControl: Spawning new defender: ' + newName + ', returned: ' + o);
        if (o !== OK) { continue; }
        defenders++;
        energy -= defenderBodyCost;
    }
}
