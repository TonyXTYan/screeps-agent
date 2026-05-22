import { ensureArchetype } from '../../creep.capabilities';
import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { closest } from '../../utils/selection';
import { pickRemoteMinerSource, remoteSourceMinerSlotCap } from './coverage';
import { creepsForHomeRoom } from './fleet';
import { remoteMinerShouldPreferDirectSourceApproach, updateRemoteMinerStationRoute } from './minerStation';

const REMOTE_MINER_REPAIR_THRESHOLD = 0.5;
const REMOTE_MINER_REPAIR_RANGE = 3;

export function assignRemoteMinerRole(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    remotePlan: RemoteRoomPlan
): boolean {
    let assignedSourceId = creep.memory.assignedSourceId ?? creep.memory.sourceId;
    const sources = creep.room.find(FIND_SOURCES);
    const sourceIds = new Set<string>(sources.map((source) => source.id));
    if (assignedSourceId && !sourceIds.has(assignedSourceId)) {
        assignedSourceId = undefined;
    }

    const minerCountBySource = new Map<string, number>();
    for (const other of creepsForHomeRoom(homeRoom)) {
        if (other.id === creep.id) { continue; }
        if (other.spawning) { continue; }
        if (ensureArchetype(other) !== 'remoteMiner') { continue; }
        if (other.memory.remoteRoom !== remoteRoom) { continue; }
        if (other.memory.remoteStandby) { continue; }
        const sid = other.memory.assignedSourceId ?? other.memory.sourceId;
        if (sid && sourceIds.has(sid)) {
            minerCountBySource.set(sid, (minerCountBySource.get(sid) ?? 0) + 1);
        }
    }

    let selectedSource: Source | null = null;
    if (assignedSourceId) {
        const currentSource = sources.find((source) => source.id === assignedSourceId) ?? null;
        if (currentSource) {
            const currentSourcePlan = remotePlan.sources?.[currentSource.id];
            const currentCount = minerCountBySource.get(currentSource.id) ?? 0;
            const currentCap = remoteSourceMinerSlotCap(remotePlan, currentSource);
            if (currentSourcePlan?.routeAccessible !== false && currentCount < currentCap) {
                selectedSource = currentSource;
            }
        }
    }

    if (!selectedSource) {
        selectedSource = pickRemoteMinerSource(creep, sources, remotePlan, minerCountBySource);
        assignedSourceId = selectedSource?.id;
    }

    if (!selectedSource || !assignedSourceId) {
        creep.memory.remoteStandby = true;
        creep.memory.sourceId = undefined;
        creep.memory.assignedSourceId = undefined;
        creep.memory.stationaryTargetId = undefined;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
        } else {
            setJob(creep, 'idle', Game.rooms[homeRoom]?.storage
                ?? creep.pos.findClosestByRange(FIND_MY_SPAWNS));
        }
        return true;
    }

    const sourceCfg = remotePlan.sources?.[assignedSourceId];
    if (sourceCfg) {
        updateRemoteMinerStationRoute(creep, selectedSource, sourceCfg);
    }

    const preferDirectSourceApproach = remoteMinerShouldPreferDirectSourceApproach(creep, sourceCfg);

    let stationaryTargetId: string | undefined;
    if (!preferDirectSourceApproach && sourceCfg?.containerId) {
        stationaryTargetId = sourceCfg.containerId;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
    } else if (!preferDirectSourceApproach && sourceCfg?.stationX != null && sourceCfg?.stationY != null && sourceCfg.routeAccessible !== false) {
        stationaryTargetId = undefined;
        creep.memory.stationX = sourceCfg.stationX;
        creep.memory.stationY = sourceCfg.stationY;
    } else {
        stationaryTargetId = assignedSourceId;
        creep.memory.stationX = undefined;
        creep.memory.stationY = undefined;
    }

    creep.memory.remoteStandby = undefined;
    creep.memory.sourceId = selectedSource.id;
    creep.memory.assignedSourceId = selectedSource.id;
    creep.memory.stationaryTargetId = stationaryTargetId ?? selectedSource.id;

    if (selectedSource.energy === 0) {
        const damagedNearby = closest(creep, creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) &&
                            s.hits < s.hitsMax * REMOTE_MINER_REPAIR_THRESHOLD &&
                            creep.pos.getRangeTo(s) <= REMOTE_MINER_REPAIR_RANGE
        }) as AnyStructure[]);
        if (damagedNearby) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                setJob(creep, 'repair', damagedNearby);
                return true;
            }
            const stationContainer = sourceCfg?.containerId
                ? Game.getObjectById(sourceCfg.containerId as Id<StructureContainer>)
                : null;
            if (stationContainer && stationContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                setJob(creep, 'withdrawEnergy', stationContainer);
                return true;
            }
        }
    }

    setJob(creep, 'harvestSource', selectedSource);
    return true;
}
