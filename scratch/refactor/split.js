const { Project } = require('ts-morph');
const fs = require('fs');

const project = new Project({
    tsConfigFilePath: "../../tsconfig.json",
});

const indexFile = project.getSourceFileOrThrow("../../src/room/index.ts");

const modules = {
    'context.ts': [
        'buildContext', 'initialiseRoomPlan', 'rememberPlans', 'rememberRcl', 
        'updatePlanAssignments', 'rememberLoad', 'roomNeedsCriticalEnergyRecovery',
        'energyRecoveryReason', 'reportPassiveInfrastructure', 'buildSourcePlans',
        'buildMineralPlan', 'terminalEnergyReserveTarget', 'roomHasEnergyDemand',
        'roomHasSpawnEnergyDemand', 'terminalWithdrawableEnergy', 'terminalEnergyReserveDeficit'
    ],
    'links.ts': [
        'runLinks', 'linkReceivers', 'uniqueLinks'
    ],
    'jobs.ts': [
        'assignJobs', 'assignJob', 'setJob', 'setTravelJob', 'setResourceJob',
        'isDedicatedRemoteCreep', 'hasEnergyToGather', 'assignWorkerPartialEnergyWork',
        'assignEnergySpendingJob', 'minCarryForHauler', 'minWorkForWorker', 'minWorkForMiner',
        'keepCurrentJob', 'currentJobStillValid', 'shouldInterruptForEmergencyEnergyDelivery',
        'reserveCurrentJob', 'shouldInterruptForEnergyRefill', 'assignEmergencyEnergyDelivery',
        'canEmergencyDeliverEnergy', 'droppedResourceTarget', 'salvageWithdrawalTarget',
        'mineralContainerWithdrawalTarget', 'resourceDepositTarget', 'energyDepositTarget',
        'energyWithdrawalTarget', 'spawnEnergyRatio', 'spawnEnergyPressure',
        'bestConstructionSite', 'repairTargetFor', 'remainingConstructionProgress',
        'remainingRepairProgress', 'reserveConstructionProgress', 'reserveRepairProgress',
        'constructionPriority', 'shouldRepairWithCreeps', 'desiredUpgraderWork',
        'shouldReserveUpgrade', 'mineralReadyToMine', 'totalStoredTargets',
        'totalStoredResources', 'firstStoredResource', 'firstStoredNonEnergyResource',
        'haulerMiningSiteMinPickup', 'isMiningSiteEnergyTarget', 'storedEnergy',
        'sumFreeEnergy', 'towerEnergyRatio', 'closest', 'closestReachable',
        'bestHealTarget', 'isEmergencyHealTarget', 'closestByRange', 'legacyRoleForArchetype',
        'rememberActiveAsPrimary', 'rememberPrimaryJob', 'clearPrimaryJob', 'jobTarget',
        'reserveSourceWork', 'reserveSourceIfNeeded', 'reserveResourceTarget',
        'reserveDroppedTarget', 'reserveEnergySink', 'resumePrimaryEnergyJob',
        'setStaticHarvestMemory', 'setStaticMineralMemory', 'clearStaticMiningMemory',
        'stationaryTargetIdForSource', 'stationaryTargetIdForMineral', 'closestSourcePlan',
        'createReservations', 'assignmentPriority'
    ],
    'spawn.ts': [
        'runSpawnPlanner', 'pendingSpawnRequest', 'renewalDemandCreepsForRoom',
        'addPendingCapabilities', 'pendingArchetypeCount', 'pendingRemoteArchetypeCount',
        'pendingRemoteBodyCapability', 'workerWorkRatio', 'chooseSpawnRequest',
        'remoteSpawnRequest', 'remoteRequestBlockReason', 'remoteRequestUsesRemoteIncome',
        'firstEnabledHarvestRemoteName', 'hasRemoteRouteCongestion', 'creepsForHomeRoom',
        'meetsMinimumBody', 'isRemoteSpawnRequest', 'isEmergencyRemoteRequest',
        'remoteSpawnRecoveryBlockReason', 'remoteSpawnMinimumCost', 'isRouteHealthMaintainerRequest',
        'remoteSourcePlanForRequest', 'remoteHaulerCostForCapacity', 'remoteMinerCostForWorkDemand',
        'logRemoteSpawnSkip', 'measureCapabilities', 'desiredHaulerCapacity',
        'desiredWorkerWork', 'refillSpawnTargets', 'refillTowerTargets',
        'refillSpawnTarget', 'refillTowerTarget', 'refillTerminalTarget',
        'totalSourcePlanWorkDemand', 'sourceWorkDemand', 'sourceSpawnDeficit',
        'activeMinerCount', 'assignedSourceMinerCount', 'assignedSourceWork',
        'assignedSourcePlan'
    ]
};

const leaveInIndex = new Set(['run', 'assignRemoteCreep']);

const allFuncs = indexFile.getFunctions().map(f => f.getName());
const remoteFuncs = allFuncs.filter(name => {
    if (leaveInIndex.has(name)) return false;
    for (const funcs of Object.values(modules)) {
        if (funcs.includes(name)) return false;
    }
    return true;
});

modules['remote.ts'] = remoteFuncs;

const targetFiles = [];

for (const [moduleName, funcNames] of Object.entries(modules)) {
    const targetFile = project.createSourceFile(`../../src/room/${moduleName}`, "", { overwrite: true });
    targetFiles.push(targetFile);
    
    for (const name of funcNames) {
        const func = indexFile.getFunction(name);
        if (func) {
            func.setIsExported(true);
            targetFile.addFunction(func.getStructure());
            func.remove();
        } else {
            console.log(`Could not find function: ${name}`);
        }
    }
}

indexFile.addExportDeclarations([
    { moduleSpecifier: './context' },
    { moduleSpecifier: './links' },
    { moduleSpecifier: './jobs' },
    { moduleSpecifier: './spawn' },
    { moduleSpecifier: './remote' }
]);

// Since the files were just created in memory and depend on each other, 
// let's save them first so typescript can resolve paths
project.saveSync();

// Now reload and fix imports
const project2 = new Project({
    tsConfigFilePath: "../../tsconfig.json",
});

project2.getSourceFiles().forEach(f => {
    if (f.getFilePath().includes('/src/room/')) {
        f.fixMissingImports();
    }
});

project2.saveSync();
console.log("Extraction complete!");
