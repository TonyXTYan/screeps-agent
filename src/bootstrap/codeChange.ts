import { BUILD_COMMIT } from '../env';

export function detectCodeChange(): boolean {
    const lastCommit = (Memory as { lastBuildCommit?: string }).lastBuildCommit;
    const changed = lastCommit !== BUILD_COMMIT;
    if (changed) {
        const now = new Date().toISOString();
        console.log(`[main] ====== Code change ====== Game.time=${Game.time} (${now}): Last:${lastCommit ?? 'none'} → New:${BUILD_COMMIT}`);
        (Memory as { lastBuildCommit?: string }).lastBuildCommit = BUILD_COMMIT;
    }
    return changed;
}
