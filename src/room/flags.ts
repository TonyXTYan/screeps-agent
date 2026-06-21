// Flag-based overrides for per-structure bot behaviour.

let _cachedTick = -1;
let _disabledPositions: Set<string> = new Set();

/**
 * Returns the set of "roomName_x_y" keys for all DONOT_MAINTAIN flags.
 * Result is cached for the current tick.
 */
function maintenanceDisabledPositions(): Set<string> {
    if (Game.time === _cachedTick) { return _disabledPositions; }
    _cachedTick = Game.time;
    _disabledPositions = new Set<string>();
    for (const name in Game.flags) {
        if (!name.startsWith('DONOT_MAINTAIN')) { continue; }
        const pos = Game.flags[name].pos;
        _disabledPositions.add(`${pos.roomName}_${pos.x}_${pos.y}`);
    }
    return _disabledPositions;
}

/**
 * Returns true when a DONOT_MAINTAIN flag sits on the same tile as the given structure,
 * signalling that all creeps should skip repairing it and let it decay naturally.
 *
 * Usage: place any flag whose name starts with DONOT_MAINTAIN on the exact tile of the road
 * or container you want to abandon. Multiple flags can coexist with suffixes, e.g.
 * DONOT_MAINTAIN_1, DONOT_MAINTAIN_roadNW. Remove the flag to resume normal maintenance.
 */
export function isMaintenanceDisabled(structure: { pos: RoomPosition }): boolean {
    const pos = structure.pos;
    return maintenanceDisabledPositions().has(`${pos.roomName}_${pos.x}_${pos.y}`);
}
