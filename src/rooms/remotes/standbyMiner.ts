import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import {
    creepsForHomeRoom,
    findDyingRemoteMiner,
    hasActiveRemoteMinerForSource,
    sourceNeedingBlankStandbyMiner
} from './fleet';

const REMOTE_STANDBY_PARK_RANGE_MIN = 4;
const REMOTE_STANDBY_PARK_RANGE_TARGET = 6;
const REMOTE_STANDBY_PARK_RANGE_MAX = 10;
const REMOTE_STANDBY_BOUNDARY_STUCK_TICKS = 15;

export function assignStandbyRemoteMiner(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const homeFleet = creepsForHomeRoom(homeRoom);
    let standbySourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    if (!standbySourceId) {
        const dyingMiner = findDyingRemoteMiner(homeFleet, remoteRoom);
        standbySourceId = dyingMiner?.memory.assignedSourceId ?? dyingMiner?.memory.sourceId;
    }
    if (!standbySourceId) {
        standbySourceId = sourceNeedingBlankStandbyMiner(homeFleet, remoteRoom, remotePlan, creep.id) ?? undefined;
    }

    if (!standbySourceId) {
        creep.memory.sourceId = undefined;
        creep.memory.assignedSourceId = undefined;
        creep.memory.stationaryTargetId = undefined;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
        setTravelJob(creep, homeRoom);
        return true;
    }

    creep.memory.sourceId = standbySourceId;
    creep.memory.assignedSourceId = standbySourceId;

    const activeMinerAlive = hasActiveRemoteMinerForSource(homeFleet, remoteRoom, standbySourceId, creep.id);
    if (!activeMinerAlive) {
        creep.memory.remoteStandby = undefined;
        if (creep.room.name !== remoteRoom) {
            setTravelJob(creep, remoteRoom);
            return true;
        }

        const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
            creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
            null;
        if (source) {
            setJob(creep, 'harvestSource', source);
            return true;
        }

        setTravelJob(creep, remoteRoom);
        return true;
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const source = Game.getObjectById<Source>(standbySourceId as Id<Source>) ??
        creep.room.find(FIND_SOURCES).find((s) => s.id === standbySourceId) ??
        null;
    if (!source) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const range = creep.pos.getRangeTo(source);
    if (range > REMOTE_STANDBY_PARK_RANGE_MAX || range < REMOTE_STANDBY_PARK_RANGE_MIN) {
        const atBoundary = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
        const samePos = creep.memory.standbyParkLastX === creep.pos.x && creep.memory.standbyParkLastY === creep.pos.y;
        const stuckTicks = samePos ? (creep.memory.standbyParkStuckTicks ?? 0) + 1 : 0;
        creep.memory.standbyParkStuckTicks = stuckTicks;
        creep.memory.standbyParkLastX = creep.pos.x;
        creep.memory.standbyParkLastY = creep.pos.y;

        if (atBoundary && stuckTicks >= REMOTE_STANDBY_BOUNDARY_STUCK_TICKS) {
            creep.memory.standbyParkStuckTicks = 0;
            setTravelJob(creep, homeRoom);
            return true;
        }
        creep.moveTo(source, {
            range: REMOTE_STANDBY_PARK_RANGE_TARGET,
            ignoreCreeps: true,
            reusePath: 0,
            visualizePathStyle: { stroke: '#f59e0b' }
        });
    }
    return true;
}
