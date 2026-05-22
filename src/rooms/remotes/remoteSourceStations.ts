import { remoteTargetAccessSlots } from './energyClaims';

export function remoteSourceMinerSlotCap(remotePlan: RemoteRoomPlan, source: Source): number {
    const sourceCfg = remotePlan.sources?.[source.id];
    if (sourceCfg && remoteSourceHasStaticStation(sourceCfg)) { return 1; }
    return Math.max(1, Math.min(2, remoteTargetAccessSlots(source.pos)));
}

export function pickRemoteMinerSource(
    creep: Creep,
    sources: Source[],
    remotePlan: RemoteRoomPlan,
    minerCountBySource: Map<string, number>
): Source | null {
    let bestSource: Source | null = null;
    let bestLoad = Infinity;
    let bestRange = Infinity;
    for (const source of sources) {
        const sourcePlan = remotePlan.sources?.[source.id];
        if (sourcePlan?.routeAccessible === false) { continue; }
        const cap = remoteSourceMinerSlotCap(remotePlan, source);
        const count = minerCountBySource.get(source.id) ?? 0;
        if (count >= cap) { continue; }
        const load = count / cap;
        const range = creep.pos.getRangeTo(source);
        if (!bestSource || load < bestLoad || (load === bestLoad && range < bestRange)) {
            bestSource = source;
            bestLoad = load;
            bestRange = range;
        }
    }
    return bestSource;
}

export function remoteSourceHasContainerStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return !!sourcePlan?.containerId || !!sourcePlan?.containerSiteId;
}

export function remoteSourceHasStaticStation(sourcePlan: RemoteSourcePlan | undefined): boolean {
    return remoteSourceHasContainerStation(sourcePlan) ||
        (sourcePlan?.stationX != null && sourcePlan?.stationY != null);
}

export function remoteSourceActiveMinerLimit(sourcePlan: RemoteSourcePlan): number {
    if (remoteSourceHasStaticStation(sourcePlan)) { return 1; }
    return 2;
}
