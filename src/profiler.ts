/**
 * Thin wrapper around screeps-profiler.
 *
 * To enable profiling:
 *   1. Set PROFILER_ENABLED = true and deploy.
 *   2. In the game console, start background mode: Game.profiler.background()
 *   3. After enough ticks, dump results:           Game.profiler.output()
 *   4. To stop and clear:                          Game.profiler.reset()
 *
 * Never commit with PROFILER_ENABLED = true — it adds CPU overhead every tick.
 */

import screepsProfiler from 'screeps-profiler';

const PROFILER_ENABLED = true;

if (PROFILER_ENABLED) {
    screepsProfiler.enable();
}

/**
 * Call this at the top of your exported loop() function, wrapping the loop body.
 * When disabled, the body is called directly with no overhead.
 *
 * @example
 *   export function loop(): void {
 *       wrapWithProfiler(loopBody);
 *   }
 */
export function wrapWithProfiler(fn: () => void): void {
    if (!PROFILER_ENABLED) {
        fn();
        return;
    }
    screepsProfiler.wrap(fn);
}
