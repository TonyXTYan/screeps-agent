import { homeEnergySummary } from './homeEnergySummary';
import { buildHomeCreepStatusLine } from './homeStatusLine';
import { printMineralStatus } from './homeStatusMineral';

export function printHomeCreepStatus(homeRoom: string): void {
    const room = Game.rooms[homeRoom];
    if (room) { printMineralStatus(room); }

    const archetypes: string[] = [];
    const counts: Record<string, number> = {};
    const lines: string[] = [];

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.homeRoom !== homeRoom) { continue; }
        if (creep.memory.remoteRoom) { continue; }
        if (creep.spawning) { continue; }

        const { archetype, line } = buildHomeCreepStatusLine(creep);
        if (!counts[archetype]) {
            counts[archetype] = 0;
            archetypes.push(archetype);
        }
        counts[archetype]++;
        lines.push(line);
    }

    const enStr = homeEnergySummary(room);

    if (lines.length === 0) {
        console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
        return;
    }

    const fleetSummary = archetypes
        .sort()
        .map(a => `${a}=${counts[a]}`)
        .join('  ');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`[HOME] t=${Game.time} ${homeRoom}:  ${enStr}`);
    console.log(`  ${fleetSummary}  total=${total}`);
    for (const line of lines) {
        console.log(`  ${line}`);
    }
}
