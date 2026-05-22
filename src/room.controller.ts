import { roomNeedsCriticalEnergyRecovery } from './rooms/energy';
import { runLinks } from './rooms/links';
import {
    buildContext,
    initialiseRoomPlan,
    rememberLoad,
    rememberPlans,
    rememberRcl,
    reportPassiveInfrastructure,
    updatePlanAssignments
} from './rooms/controllerState';
import { assignRemoteCreep as assignRemoteCreepImpl } from './rooms/remotes/assignment';
import { updateRemoteRoomPlans } from './rooms/remotes/planning';
import { runSpawnPlanner } from './rooms/spawning/planner';
import { assignJobs } from './rooms/jobs/assignment';

export function run(room: Room): void {
    const context = buildContext(room);

    initialiseRoomPlan(room);
    updateRemoteRoomPlans(room);
    rememberRcl(room);
    updatePlanAssignments(context);
    rememberLoad(context);
    rememberPlans(context);
    // Refresh hysteresis state once per tick so force-pull logic and debug reflect
    // current room energy conditions even when no branch queries it later.
    roomNeedsCriticalEnergyRecovery(context);
    runLinks(context);
    reportPassiveInfrastructure(context);
    assignJobs(context);
    runSpawnPlanner(context);
}

export function assignRemoteCreep(creep: Creep): boolean {
    return assignRemoteCreepImpl(creep);
}
