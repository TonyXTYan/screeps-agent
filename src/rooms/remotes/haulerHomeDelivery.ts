import { setJob, setResourceJob, setTravelJob } from '../../creeps/jobs/memory';
import { firstStoredResourcePreferNonEnergy as firstStoredResource } from '../../resources/store';
import { getRoomStructures } from '../../room.structures';
import { closest } from '../../utils/selection';
import { TOWER_RECOVERY_RATIO, towerEnergyRatio } from '../energy';

export function assignRemoteHaulerDelivery(creep: Creep, homeRoom: string): void {
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
