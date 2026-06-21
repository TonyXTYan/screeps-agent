# Profiling Console Guide

CPU profiling is provided by [screeps-profiler](https://github.com/screepers/screeps-profiler).
It monkey-patches Screeps prototypes so every game-object method call is timed automatically.
Your own module-level functions are also registered (see `src/profiler.ts`).

> **Prerequisite:** The profiler must be enabled in the build.
> Open `src/profiler.ts` and set `PROFILER_ENABLED = true`, then deploy.
> Set it back to `false` when you're done — it adds CPU overhead every tick even when idle.

---

## Quick reference

| Console command | What it does |
|---|---|
| `Game.profiler.profile(N)` | Collect for N ticks, then auto-print results |
| `Game.profiler.stream(N)` | Print a report every tick for N ticks |
| `Game.profiler.background()` | Collect indefinitely; you call `output()` when ready |
| `Game.profiler.output()` | Print current data (top 20 functions) |
| `Game.profiler.output(50)` | Print top 50 functions |
| `Game.profiler.email(N)` | Collect for N ticks, then email results |
| `Game.profiler.reset()` | Stop profiling and clear all collected data |
| `Game.profiler.restart()` | Resume with the same settings as last time |

All commands accept an optional `functionFilter` string as the last argument to narrow output
to function names containing that substring.

---

## Modes in detail

### One-shot: `profile(N)`

The simplest option. Runs silently for N ticks, then dumps the report to the console automatically.

```js
Game.profiler.profile(100)
```

100 ticks is usually enough for stable averages on hot-path functions. Use 500+ for functions
that fire infrequently (remote planning, memory audit, spawn decisions).

### Spike hunting: `stream(N)`

Prints a full report **every tick** for N ticks. Useful when you suspect a periodic spike rather
than a steady cost. Noisy — keep N small (10–20 ticks).

```js
Game.profiler.stream(20)
```

### Long-running: `background()`

Collects data indefinitely with no automatic output. Call `output()` whenever you want a
snapshot. The only way to stop it is `reset()`.

```js
// Start collecting:
Game.profiler.background()

// ... many ticks later, check results:
Game.profiler.output()

// Check again later (data keeps accumulating):
Game.profiler.output()

// Stop:
Game.profiler.reset()
```

Good for watching steady-state CPU over many ticks without babysitting the console.

### Email: `email(N)`

Same as `profile(N)` but sends the report to your registered Screeps email address instead of
the console. Useful for long runs or when console output gets truncated.

```js
Game.profiler.email(500)
```

> **Note:** Screeps rate-limits the notification API (`Game.notify`). If you're receiving a lot
> of attack notifications, the email may be queued or dropped. Free-tier accounts have a low
> daily cap.

---

## Filtering output

All commands accept a `functionFilter` substring as the second argument. Only functions whose
names contain that string will appear in the report.

```js
// Profile everything for 100 ticks (no filter):
Game.profiler.profile(100)

// Only show room controller functions:
Game.profiler.profile(100, 'roomController')

// Only show creep-related functions:
Game.profiler.profile(100, 'Creep')

// Background mode, but only output remote-related lines:
Game.profiler.background('remote')
Game.profiler.output()
```

---

## Reading the output

Results appear in the **game console** (bottom panel → Console tab in the web client, or the
live feed in screepsconsole). The format is:

```
calls    time        avg       function
2000     12293.9,    6.147     roomController
10914    6025.0,     0.552     Creep.prototype.moveTo
2000     3534.5,     1.767     Spawn.prototype.spawnCreep
70000    1949.3,     0.028     Structure.prototype.notifyWhenAttacked
```

| Column | Meaning |
|---|---|
| `calls` | Total number of times this function was called across all measured ticks |
| `time` | Total CPU time (ms) spent in this function across all ticks |
| `avg` | Average CPU time per call (`time / calls`) |
| `function` | Function name (prototype methods include the prototype prefix) |

Sorted by total `time` descending — the top entry is your biggest CPU consumer.

**screepsconsole users:** Output also lands in the daily NDJSON log at
`screeps_console/logs/screeps_console_YYYY-MM-DD.json`. Each line is a JSON object; filter for
`direction: "in"` lines and search for the profiler header `calls    time` to find the block.

---

## Only one session at a time

The profiler stores its state in a single `Memory.profiler` object. Starting a new session
immediately overwrites the previous one — there is no way to run two sessions simultaneously.

```js
Game.profiler.profile(100)
// a few ticks later...
Game.profiler.background()  // ← cancels profile(100), starts fresh from zero
```

**Workaround:** run two back-to-back sessions with different filters:

```js
// First pass:
Game.profiler.profile(100, 'roomController')
// wait 100 ticks, read output, then:
Game.profiler.profile(100, 'moveTo')
```

Or use `background()` with no filter — a single long run captures everything, and you can
read the full report in one `output()` call rather than splitting across sessions.

---

## What is automatically profiled

When `PROFILER_ENABLED = true`, screeps-profiler patches all Screeps prototype methods:
`Creep`, `Room`, `StructureSpawn`, `Structure`, `Source`, `RoomPosition`, etc.
You get timing on every `creep.moveTo()`, `room.find()`, `spawn.spawnCreep()` call for free.

Module-level functions (your own code) are **not** automatically profiled. To add them,
call `screepsProfiler.registerObject(module, 'label')` in `src/profiler.ts`.

---

## Workflow: diagnosing a CPU spike

1. Set `PROFILER_ENABLED = true` in `src/profiler.ts` and deploy.
2. Let a tick or two pass so the bot is running normally.
3. Run a one-shot profile:
   ```js
   Game.profiler.profile(100)
   ```
4. After 100 ticks the report prints. Look at the top 5–10 entries.
5. If the culprit is a prototype method (e.g. `Creep.prototype.moveTo`), use `stream` to see
   which ticks spike:
   ```js
   Game.profiler.stream(20, 'moveTo')
   ```
6. When done, set `PROFILER_ENABLED = false` and redeploy to remove the overhead.

---

## Implementation note

`src/profiler.ts` — wraps the profiler and exposes `wrapWithProfiler(fn)`.
`src/main.ts` — calls `wrapWithProfiler(loopBody)` at the top of `loop()` so the profiler
sees every tick's CPU budget correctly.
`PROFILER_ENABLED = false` by default; flip to `true` locally for a profiling build.
