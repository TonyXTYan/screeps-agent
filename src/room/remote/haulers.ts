// Remote hauler cycle management: pickup, delivery, renewal, idle wander.

import { findRemoteEnergySource, remoteEnergyTargetPathLength } from './energy';
import { setJob, setTravelJob, setResourceJob } from '../jobMemory';
import { acquireRenewSpawn, nearestSpawn } from '../../spawn/renewal';
import { closest } from '../targeting';
import { getRoomStructures } from '../structures';
import { firstStoredResource } from '../work';
import { towerEnergyRatio } from '../energy';
import { hashString } from './fleet';
import {
    REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH, REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO,
    REMOTE_HAULER_POST_TRIP_RENEW_START_TTL, REMOTE_HAULER_RENEW_STOP_TTL,
    REMOTE_HAULER_RENEW_START_TTL, REMOTE_HAULER_IDLE_RECHECK_TICKS,
    REMOTE_HAULER_RENEW_CRITICAL_TTL,
    REMOTE_HAULER_WANDER_MIN_RANGE, REMOTE_HAULER_WANDER_MAX_RANGE, REMOTE_HAULER_WANDER_TICKS,
    TOWER_RECOVERY_RATIO,
} from '../constants';

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
    const full = creep.store.getFreeCapacity() === 0;

    if (totalUsed > 0) {
        const workParts = creep.getActiveBodyparts(WORK);
        const freeCapacity = creep.store.getFreeCapacity();
        // Skip top-up when free capacity ≤ WORK parts: opportunistic repair burns exactly
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

function manageRemoteHaulerRenewal(creep: Creep, homeRoomName: string, forceRenew: boolean): boolean {
    const ttl = creep.ticksToLive;
    if (!ttl) { return false; }
    const alreadyRenewing = creep.memory.remoteRenewing === true;

    const homeRoom = Game.rooms[homeRoomName];
    if (!alreadyRenewing && homeRoom && shouldDeferRemoteHaulerRenewal(homeRoom, ttl)) {
        // Home room still needs energy: defer starting a new renew cycle so haulers
        // resume hauling/refill work. Once started, finish the cycle to avoid
        // one-tick renew bounces at the spawn.
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.memory.remoteRenewing && (forceRenew || ttl <= REMOTE_HAULER_RENEW_START_TTL)) {
        creep.memory.remoteRenewing = true;
    }
    if (creep.memory.remoteRenewing && ttl > REMOTE_HAULER_RENEW_STOP_TTL) {
        creep.memory.remoteRenewing = false;
        return false;
    }
    if (!creep.memory.remoteRenewing) { return false; }

    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = acquireRenewSpawn(creep, homeRoom);
    if (!spawn) {
        const waitTarget = nearestSpawn(creep, homeRoom);
        if (waitTarget) {
            if (!creep.pos.isNearTo(waitTarget)) {
                creep.moveTo(waitTarget, { visualizePathStyle: { stroke: '#f5f57a' } });
            }
            setJob(creep, 'idle', waitTarget);
            return true;
        }
        creep.memory.remoteRenewing = false;
        creep.memory.remoteHaulerRenewAfterTrip = undefined;
        return false;
    }

    if (!creep.pos.isNearTo(spawn)) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#f5f57a' } });
        setJob(creep, 'idle', spawn);
        return true;
    }

    const code = spawn.renewCreep(creep);
    if (code === OK || code === ERR_BUSY || code === ERR_NOT_ENOUGH_ENERGY) {
        setJob(creep, 'idle', spawn);
        return true;
    }

    creep.memory.remoteRenewing = false;
    return false;
}

function shouldDeferRemoteHaulerRenewal(homeRoom: Room, ttl: number): boolean {
    if (ttl <= REMOTE_HAULER_RENEW_CRITICAL_TTL) { return false; }
    if (homeRoom.memory.energyRecoveryActive === true) { return true; }
    return homeRoom.energyAvailable < homeRoom.energyCapacityAvailable;
}

function assignRemoteHaulerHomeIdle(creep: Creep, homeRoomName: string): boolean {
    if (creep.room.name !== homeRoomName) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
        setTravelJob(creep, homeRoomName);
        return true;
    }

    const spawn = closest(creep, homeRoom.find(FIND_MY_SPAWNS));
    if (!spawn) {
        setJob(creep, 'idle', homeRoom.storage ?? homeRoom.controller);
        return true;
    }

    const target = remoteHaulerWanderTarget(creep, spawn);
    if (!creep.pos.inRangeTo(target, 1)) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#7dd3fc' } });
    }
    setTravelJob(creep, homeRoomName);
    return true;
}

function remoteHaulerWanderTarget(creep: Creep, spawn: StructureSpawn): RoomPosition {
    if (creep.memory.remoteHaulerWanderX != null &&
        creep.memory.remoteHaulerWanderY != null &&
        creep.memory.remoteHaulerWanderUntil &&
        creep.memory.remoteHaulerWanderUntil > Game.time) {
        const current = new RoomPosition(
            creep.memory.remoteHaulerWanderX,
            creep.memory.remoteHaulerWanderY,
            spawn.room.name
        );
        if (current.getRangeTo(spawn.pos) >= REMOTE_HAULER_WANDER_MIN_RANGE) { return current; }
    }

    const terrain = spawn.room.getTerrain();
    const radiusSpread = REMOTE_HAULER_WANDER_MAX_RANGE - REMOTE_HAULER_WANDER_MIN_RANGE + 1;
    const seed = hashString(creep.name) + Game.time;

    for (let i = 0; i < 24; i++) {
        const radius = REMOTE_HAULER_WANDER_MIN_RANGE + ((seed + i) % radiusSpread);
        const angle = ((seed * 31 + i * 67) % 360) * (Math.PI / 180);
        const x = clampRoomCoord(Math.round(spawn.pos.x + Math.cos(angle) * radius));
        const y = clampRoomCoord(Math.round(spawn.pos.y + Math.sin(angle) * radius));
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) { continue; }

        const candidate = new RoomPosition(x, y, spawn.room.name);
        if (candidate.getRangeTo(spawn.pos) < REMOTE_HAULER_WANDER_MIN_RANGE) { continue; }
        const blocked = candidate.lookFor(LOOK_STRUCTURES).some((structure) =>
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART);
        if (blocked) { continue; }

        creep.memory.remoteHaulerWanderX = x;
        creep.memory.remoteHaulerWanderY = y;
        creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
        return candidate;
    }

    const fallback = new RoomPosition(
        clampRoomCoord(spawn.pos.x + REMOTE_HAULER_WANDER_MIN_RANGE),
        clampRoomCoord(spawn.pos.y),
        spawn.room.name
    );
    creep.memory.remoteHaulerWanderX = fallback.x;
    creep.memory.remoteHaulerWanderY = fallback.y;
    creep.memory.remoteHaulerWanderUntil = Game.time + REMOTE_HAULER_WANDER_TICKS;
    return fallback;
}

export function clearRemoteHaulerWanderMemory(creep: Creep): void {
    creep.memory.remoteHaulerWanderX = undefined;
    creep.memory.remoteHaulerWanderY = undefined;
    creep.memory.remoteHaulerWanderUntil = undefined;
}

function clampRoomCoord(value: number): number {
    return Math.max(1, Math.min(48, value));
}

function assignRemoteHaulerDelivery(creep: Creep, homeRoom: string): void {
    if (creep.room.name !== homeRoom) {
        setTravelJob(creep, homeRoom);
        return;
    }

    const structures = getRoomStructures(creep.room);
    const resource = firstStoredResource(creep.store);

    if (resource === RESOURCE_ENERGY) {
        const refillTarget = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (refillTarget) {
            setJob(creep, 'refillSpawn', refillTarget);
            return;
        }

        const towerTarget = closest(creep, structures.towers
            .filter((tower) => towerEnergyRatio(tower) < TOWER_RECOVERY_RATIO));
        if (towerTarget) {
            setJob(creep, 'refillTower', towerTarget);
            return;
        }
    }

    const storage = structures.storage;
    if (storage && resource && storage.store.getFreeCapacity(resource) > 0) {
        if (resource === RESOURCE_ENERGY) {
            setJob(creep, 'depositEnergy', storage);
        } else {
            setResourceJob(creep, 'depositResource', storage, resource);
        }
        return;
    }

    if (structures.terminal && resource && structures.terminal.store.getFreeCapacity(resource) > 0) {
        setResourceJob(creep, 'depositResource', structures.terminal, resource);
        return;
    }

    if (resource === RESOURCE_ENERGY) {
        const emergencySink = closest(creep, [...structures.spawns, ...structures.extensions]
            .filter((structure) => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        if (emergencySink) {
            setJob(creep, 'depositEnergy', emergencySink);
            return;
        }
    }

    setJob(creep, 'idle', structures.spawns[0] ?? creep.room.controller ?? structures.storage);
}
