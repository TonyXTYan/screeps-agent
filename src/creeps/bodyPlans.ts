import {
    buildClaimerBody,
    buildWorkerBody,
    planDoctorBody,
    planHaulerBody,
    planMineralMinerBody,
    planMinerBody,
    planRemoteMaintainerBody,
    planRemoteScoutBody,
    planStaticRemoteMinerBody
} from './bodyPlanStrategies';

export interface BodyPlanOptions {
    staticMining?: boolean;
    hasContainer?: boolean;
    workRatio?: number;
    minClaimParts?: number;
    maxClaimParts?: number;
}

export function planBodyForArchetype(
    archetype: CreepArchetype,
    energyBudget: number,
    opts?: BodyPlanOptions
): BodyPartConstant[] {
    if (archetype === 'remoteMiner' && opts?.staticMining) {
        return planStaticRemoteMinerBody(energyBudget, Boolean(opts?.hasContainer));
    }

    if (archetype === 'mineralMiner') {
        return planMineralMinerBody(energyBudget);
    }

    if (archetype === 'miner' || archetype === 'remoteMiner') {
        return planMinerBody(energyBudget, Boolean(opts?.staticMining));
    }

    if (archetype === 'hauler' || archetype === 'remoteHauler') {
        return planHaulerBody(energyBudget, archetype);
    }

    if (archetype === 'remoteMaintainer') {
        return planRemoteMaintainerBody(energyBudget);
    }

    if (archetype === 'remoteScout') {
        return planRemoteScoutBody(energyBudget);
    }

    if (archetype === 'doctor') {
        return planDoctorBody(energyBudget);
    }

    if (archetype === 'claimer') {
        return buildClaimerBody(energyBudget, opts?.minClaimParts ?? 1, opts?.maxClaimParts);
    }

    return buildWorkerBody(energyBudget, opts?.workRatio ?? 1);
}
