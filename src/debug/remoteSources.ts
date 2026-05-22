import { printRemoteSourceDetails, printRemoteDroppedResources } from './remoteSourceDetails';
import { printRemoteSourceSummary } from './remoteSourceSummary';

export function printRemoteSourceDebugSections(room: Room, remoteName: string, plan: RemoteRoomPlan): void {
    printRemoteSourceSummary(room, remoteName, plan);
    printRemoteSourceDetails(room, remoteName, plan);
    printRemoteDroppedResources(remoteName);
}
