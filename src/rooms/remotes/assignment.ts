import { ensureArchetype, getCreepCapabilities } from '../../creep.capabilities';
import { clearJob } from '../../creep.jobRunner';
import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import {
    assignRemoteFallbackRole,
    assignRemoteMaintainerRole,
    assignRemoteMinerRole,
    assignRemoteScoutRole
} from './assignmentRoles';
import { assignRemoteHaulerCycle } from './haulerCycle';
import {
    closestRemoteInfrastructureSite,
    preferredRemoteInfrastructureSite,
    shouldBuildRemoteInfrastructure
} from './infrastructure';
import {
    primeRemoteMinerTravelStation
} from './minerStation';
import { manageRemoteRenewal } from './renewal';
import { assignStandbyRemoteMiner } from './standbyMiner';

export function assignRemoteCreep(creep: Creep): boolean {
    const homeRoom = creep.memory.homeRoom;
    const remoteRoom = creep.memory.remoteRoom;
    if (!homeRoom || !remoteRoom) { return false; }
    const archetype = ensureArchetype(creep);
    const configuredRemotePlan = Memory.rooms[homeRoom]?.plan?.remoteRooms?.[remoteRoom];
    if (configuredRemotePlan && !configuredRemotePlan.enabled) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (configuredRemotePlan?.dangerUntil && configuredRemotePlan.dangerUntil > Game.time) {
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    if (!configuredRemotePlan && !(Memory.rooms[homeRoom]?.plan?.claimTargets ?? []).includes(remoteRoom)) {
        clearJob(creep);
        if (creep.room.name !== homeRoom) {
            setTravelJob(creep, homeRoom);
            return true;
        }
        setJob(creep, 'idle', creep.room.storage ?? creep.room.find(FIND_MY_SPAWNS)[0]);
        return true;
    }
    const remotePlan: RemoteRoomPlan = configuredRemotePlan ?? {
        enabled: true,
        roomName: remoteRoom,
        mode: creep.memory.remoteMode ?? 'claim',
        reserve: false,
        buildRoads: false,
        maintainRoads: false
    };

    const capabilities = getCreepCapabilities(creep);
    if (archetype === 'remoteHauler') {
        return assignRemoteHaulerCycle(creep, homeRoom, remoteRoom, remotePlan);
    }
    if (manageRemoteRenewal(creep, archetype, capabilities, homeRoom, remoteRoom, remotePlan)) {
        return true;
    }

    if (archetype === 'remoteScout') {
        return assignRemoteScoutRole(creep, homeRoom, remoteRoom);
    }

    if (archetype === 'remoteMiner' && creep.memory.remoteStandby) {
        return assignStandbyRemoteMiner(creep, homeRoom, remoteRoom, remotePlan);
    }

    if (archetype === 'remoteMiner') {
        primeRemoteMinerTravelStation(creep, remotePlan);
    }

    if (creep.room.name !== remoteRoom) {
        setTravelJob(creep, remoteRoom);
        return true;
    }

    const remoteBuildSite = shouldBuildRemoteInfrastructure(creep, archetype, remotePlan)
        ? preferredRemoteInfrastructureSite(creep, archetype, closestRemoteInfrastructureSite(creep, archetype === 'remoteMaintainer'))
        : null;
    if (remoteBuildSite) {
        setJob(creep, 'build', remoteBuildSite);
        return true;
    }

    if (archetype === 'claimer' && creep.room.controller) {
        const jobType: CreepJobType = creep.memory.remoteMode === 'reserve' ? 'reserveController' : 'claimController';
        setJob(creep, jobType, creep.room.controller);
        return true;
    }

    if (archetype === 'remoteMiner') {
        return assignRemoteMinerRole(creep, homeRoom, remoteRoom, remotePlan);
    }

    if (archetype === 'remoteMaintainer' && assignRemoteMaintainerRole(creep, remotePlan)) {
        return true;
    }

    return assignRemoteFallbackRole(creep, homeRoom, remoteRoom, capabilities);
}
