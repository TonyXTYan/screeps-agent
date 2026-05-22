import { setJob, setTravelJob } from '../../creeps/jobs/memory';
import { findRemoteEnergySource, remoteEnergyTargetPathLength } from './energy';
import { assignRemoteHaulerDelivery } from './haulerHomeDelivery';
import {
    assignRemoteHaulerHomeIdle,
    clearRemoteHaulerWanderMemory,
    manageRemoteHaulerRenewal,
    REMOTE_HAULER_POST_TRIP_RENEW_START_TTL,
    REMOTE_HAULER_RENEW_START_TTL,
    REMOTE_HAULER_RENEW_STOP_TTL
} from './haulerHome';

const REMOTE_HAULER_IDLE_RECHECK_TICKS = 75;
const REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH = 100;
const REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO = 0.75;

export function assignRemoteHaulerCycle(
    creep: Creep,
    homeRoom: string,
    remoteRoom: string,
    remotePlan: RemoteRoomPlan
): boolean {
    const totalUsed = creep.store.getUsedCapacity();
    const totalCapacity = creep.store.getCapacity();
    const ttl = creep.ticksToLive ?? 0;
    const loadRatio = totalCapacity > 0 ? totalUsed / totalCapacity : 1;

    if (totalUsed > 0) {
        const workParts = creep.getActiveBodyparts(WORK);
        const freeCapacity = creep.store.getFreeCapacity();
        // Skip top-up when free capacity <= WORK parts: opportunistic repair burns exactly
        // what the top-up picks up each tick, leaving the creep stuck at that threshold.
        const worthTopping = freeCapacity > 0 && (workParts === 0 || freeCapacity > workParts);
        if (worthTopping && !creep.memory.remoteHaulerReturning && creep.room.name === remoteRoom) {
            const followDroppedTopUp = creep.memory.remoteHaulerLastPickupWasDropped === true &&
                creep.memory.jobType !== 'pickupEnergy';
            const source = findRemoteEnergySource(creep, remotePlan, {
                followDroppedTopUp
            });
            if (source) {
                const pathLength = remoteEnergyTargetPathLength(creep, source.target);
                const isFarPickup = pathLength !== null && pathLength > REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH;
                if (!isFarPickup || loadRatio < REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO) {
                    creep.memory.remoteHaulerIdleUntil = undefined;
                    clearRemoteHaulerWanderMemory(creep);
                    creep.memory.remoteHaulerLastPickupWasDropped = source.fromDropped ? true : undefined;
                    setJob(creep, source.jobType, source.target);
                    return true;
                }
            }
        }

        creep.memory.remoteHaulerReturning = true;
        creep.memory.remoteHaulerLastPickupWasDropped = undefined;
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = ttl < REMOTE_HAULER_POST_TRIP_RENEW_START_TTL ? true : undefined;
        creep.memory.remoteHaulerIdleUntil = undefined;
        clearRemoteHaulerWanderMemory(creep);
        assignRemoteHaulerDelivery(creep, homeRoom);
        return true;
    }

    creep.memory.remoteHaulerReturning = undefined;
    if (creep.memory.remoteHaulerRenewAfterTrip) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, true);
        if ((creep.ticksToLive ?? 0) > REMOTE_HAULER_RENEW_STOP_TTL) {
            creep.memory.remoteHaulerRenewAfterTrip = undefined;
            creep.memory.remoteRenewing = false;
        }
        if (renewing) { return true; }
        if (creep.memory.remoteHaulerRenewAfterTrip) {
            setTravelJob(creep, homeRoom);
            return true;
        }
    }

    if (creep.room.name === remoteRoom) {
        const source = findRemoteEnergySource(creep, remotePlan);
        if (source) {
            creep.memory.remoteHaulerIdleUntil = undefined;
            clearRemoteHaulerWanderMemory(creep);
            setJob(creep, source.jobType, source.target);
            return true;
        }

        creep.memory.remoteHaulerIdleUntil = Game.time + REMOTE_HAULER_IDLE_RECHECK_TICKS;
        clearRemoteHaulerWanderMemory(creep);
        setTravelJob(creep, homeRoom);
        return true;
    }

    if (creep.memory.remoteHaulerIdleUntil && Game.time < creep.memory.remoteHaulerIdleUntil) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, ttl <= REMOTE_HAULER_RENEW_START_TTL);
        if (renewing) { return true; }
        return assignRemoteHaulerHomeIdle(creep, homeRoom);
    }

    if (creep.memory.remoteRenewing) {
        const renewing = manageRemoteHaulerRenewal(creep, homeRoom, false);
        if (renewing) { return true; }
    }

    creep.memory.remoteHaulerIdleUntil = undefined;
    creep.memory.remoteHaulerLastPickupWasDropped = undefined;
    clearRemoteHaulerWanderMemory(creep);
    setTravelJob(creep, remoteRoom);
    return true;
}
