import {
    isOnRequestedExitEdge,
    nudgeFromRoomEdge,
    sidestepAlongExitEdge,
    wanderRandomAdjacent
} from './edgeNavigation';
import { forceStepTowardsRoomExit, nearestExitTileToRoom } from './edgeExitPathing';
import {
    clearTravelStuckMemory,
    MOVE_STUCK_ESCAPE_TICKS,
    MOVE_STUCK_FORCED_STEP_TICKS,
    MOVE_STUCK_REPATH_TICKS,
    MOVE_STUCK_RESET_PATH_TICKS,
    resetMovePathMemory,
    updateTravelStuckMemory
} from './movementStuck';
import { requestTrafficYieldForPath } from './traffic';

export function travelRoom(creep: Creep): number {
    const roomName = creep.memory.jobRoomName;
    if (!roomName) { return ERR_INVALID_TARGET; }
    if (creep.room.name === roomName) {
        clearTravelStuckMemory(creep);
        return OK;
    }

    updateTravelStuckMemory(creep);
    const stuckTicks = creep.memory.travelStuckTicks ?? 0;
    const exitDir = Game.map.findExit(creep.room, roomName);
    const exitTarget = nearestExitTileToRoom(creep, roomName);
    if (!exitTarget) { return ERR_NO_PATH; }

    if (stuckTicks >= MOVE_STUCK_REPATH_TICKS) {
        requestTrafficYieldForPath(creep, exitTarget, 0);
        resetMovePathMemory(creep);
    }

    if (stuckTicks >= 2 && (creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49)) {
        if (isOnRequestedExitEdge(creep, exitDir) && creep.fatigue === 0) {
            if (sidestepAlongExitEdge(creep, exitDir as ExitConstant)) {
                return ERR_NOT_IN_RANGE;
            }
        }
        const nudged = nudgeFromRoomEdge(creep);
        if (nudged) { return ERR_NOT_IN_RANGE; }
    }

    const moveCode = creep.moveTo(exitTarget, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: stuckTicks >= MOVE_STUCK_REPATH_TICKS ? 0 : 8,
        ignoreCreeps: stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS,
        maxRooms: 1,
        range: 0
    });
    if (moveCode === OK) {
        if (typeof exitDir === 'number' && exitDir >= TOP && exitDir <= LEFT) {
            const onRequestedEdge = isOnRequestedExitEdge(creep, exitDir);
            if (onRequestedEdge && creep.fatigue === 0) {
                const edgeMove = creep.move(exitDir as DirectionConstant);
                if (edgeMove === ERR_BUSY &&
                    sidestepAlongExitEdge(creep, exitDir as ExitConstant)) {
                    return ERR_NOT_IN_RANGE;
                }
            }
        }
        return ERR_NOT_IN_RANGE;
    }

    if (stuckTicks >= MOVE_STUCK_FORCED_STEP_TICKS && creep.fatigue === 0) {
        const forcedStepCode = forceStepTowardsRoomExit(creep, roomName, exitTarget);
        if (forcedStepCode === OK) {
            return ERR_NOT_IN_RANGE;
        }
        if (forcedStepCode !== ERR_NO_PATH) {
            return forcedStepCode;
        }
    }

    if (stuckTicks >= MOVE_STUCK_ESCAPE_TICKS) {
        resetMovePathMemory(creep);
        if (nudgeFromRoomEdge(creep)) { return ERR_NOT_IN_RANGE; }
        wanderRandomAdjacent(creep);
        return ERR_NOT_IN_RANGE;
    }

    if (stuckTicks >= MOVE_STUCK_RESET_PATH_TICKS && Game.time % 25 === 0) {
        console.log('travelRoom: ' + creep.name + ' stuck ' + stuckTicks + 't at ' + creep.pos + ' room=' + creep.room.name + ' job=' + roomName + ' move=' + moveCode);
    }

    return moveCode;
}
