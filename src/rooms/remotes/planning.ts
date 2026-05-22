import { findHostiles } from '../../hostileUtils';
import { updateVisibleRemoteSources } from './remotePlanningSources';

const REMOTE_DANGER_TICKS = 1500;

export function updateRemoteRoomPlans(homeRoom: Room): void {
    const remotes = homeRoom.memory.plan?.remoteRooms ?? {};
    const myUsername = homeRoom.controller?.owner?.username;
    for (const remoteName in remotes) {
        const remote = remotes[remoteName];
        if (!remote.enabled) { continue; }
        if (remote.reserve === undefined) { remote.reserve = true; }
        if (remote.buildRoads === undefined) { remote.buildRoads = true; }
        if (remote.maintainRoads === undefined) { remote.maintainRoads = true; }
        if (remote.debugPaths === undefined) { remote.debugPaths = false; }
        if (remote.mode !== 'harvest') { continue; }

        const visible = Game.rooms[remoteName];
        if (!visible) { continue; }

        remote.lastScouted = Game.time;
        const hostiles = findHostiles(visible);
        const hostileCore = visible.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_INVADER_CORE
        });
        const hostileControl = Boolean(visible.controller?.owner && visible.controller.owner.username !== myUsername) ||
            Boolean(visible.controller?.reservation && visible.controller.reservation.username !== myUsername);
        if (hostiles.length > 0 || hostileCore.length > 0 || hostileControl) {
            remote.lastSeenHostiles = Game.time;
            remote.dangerUntil = Game.time + REMOTE_DANGER_TICKS;
            remote.skipReason = 'danger';
            continue;
        }
        const hadAutoDanger = remote.skipReason === 'danger';
        remote.skipReason = undefined;
        if (hadAutoDanger) {
            remote.dangerUntil = undefined;
        }

        updateVisibleRemoteSources(homeRoom, visible, remote, myUsername);
    }
}
