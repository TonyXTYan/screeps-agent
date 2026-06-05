// Shared constants for room controller modules.
// All values are exported so each extracted module can import only what it needs.

// --- Movement strategy ---
// Default travel ignores creeps so the cached path depends only on (static) terrain and
// structures, letting moveTo reuse `_move` for many ticks instead of repathing every time
// a creep sits on the next tile. Collisions are resolved reactively by stuck detection +
// the traffic swap/yield layer rather than by constantly recomputing a creep-avoiding path.
// Flip MOVE_IGNORE_CREEPS_DEFAULT back to false to A/B against the old avoid-creeps behavior.
export const MOVE_IGNORE_CREEPS_DEFAULT = true;
// How long a creep-agnostic path may be reused before moveTo recomputes it. Terrain is static,
// so this can be long; lower it if reaction lag to new construction sites becomes noticeable.
export const MOVE_REUSE_PATH_TICKS = 20;
// When stuck, the creep-AVOIDING detour path is persisted for this many ticks instead of being
// recomputed every tick. This commits the creep to routing around a stationary blocker rather
// than relapsing onto the (blocked) terrain-only shortest path the moment it sidesteps once.
// Short, because creep positions change quickly and a stale avoid-path should expire fast.
export const MOVE_STUCK_REPATH_REUSE_TICKS = 5;

export const TOWER_RESERVE_RATIO = 0.7;
export const TOWER_RECOVERY_RATIO = 0.55;
export const TOWER_HAULER_DEPOSIT_RATIO = 0.9;
export const ENERGY_RECOVERY_ENTER_SPAWN_RATIO = 0.85;
export const ENERGY_RECOVERY_EXIT_SPAWN_RATIO = 0.95;
export const ENERGY_RECOVERY_ENTER_TOWER_RATIO = TOWER_RECOVERY_RATIO;
export const ENERGY_RECOVERY_EXIT_TOWER_RATIO = TOWER_RESERVE_RATIO;
// Workers only drop non-hauling work to emergency-refill spawns when critically low
export const WORKER_EMERGENCY_SPAWN_RATIO = 0.1;
// Spawn fill ratio at which haulers yield spawn priority to tower refill
export const TOWER_REFILL_SPAWN_YIELD_RATIO = 0.90;
export const TERMINAL_RESERVE_RCL6 = 5000;
export const TERMINAL_RESERVE_RCL7 = 10000;
export const TERMINAL_RESERVE_RCL8 = 50000;

export const MINERAL_WORK_DEMAND = 5;
// Minimum stored energy before workers prioritise repair over construction.
export const WORKER_REPAIR_STORAGE_THRESHOLD = 5000;
// Workers only bootstrap new walls/ramparts up to this hit level; towers handle the rest.
export const WORKER_DEFENSE_BOOTSTRAP_HITS = 5_000;
export const LINK_TRANSFER_THRESHOLD = 200;
export const BUILD_RESERVATION_TICKS = 10;
export const REPAIR_RESERVATION_TICKS = 5;
export const REMOTE_DANGER_TICKS = 1500;
export const REMOTE_DANGER_CLEAR_HOLD_TICKS = 50;
export const REMOTE_HOSTILE_EVADE_DISTANCE = 5;
export const REMOTE_PATH_REFRESH_INTERVAL = 5000;
export const REMOTE_INACCESSIBLE_RETRY_TICKS = 500;
export const REMOTE_CONTAINER_REROUTE_FREEZE_TICKS = 150;
export const REMOTE_PATH_INCOMPLETE_RETRY_TICKS = 100;
export const REMOTE_MAX_STATION_STALLS = 3;
export const REMOTE_MAX_STATION_FAILURES = 3;
export const REMOTE_ROAD_SITES_PER_TICK = 4;
export const REMOTE_MAX_UNFINISHED_ROAD_SITES = 3;
export const REMOTE_DEGRADED_MAX_UNFINISHED_ROAD_SITES = 8;
export const REMOTE_CONTAINER_BUILD_DISTANCE = 1;
export const REMOTE_SCOUT_KEEP_COUNT = 2;
export const REMOTE_SCOUT_WANDER_TICKS = 120;
export const REMOTE_SCOUT_CROWD_THRESHOLD = 4;
export const REMOTE_PLANNING_LOG_INTERVAL = 100;
export const DOCTOR_EMERGENCY_HITS_RATIO = 0.35;
export const DOCTOR_THREAT_RADIUS = 4;
export const REMOTE_AUX_BUILD_RANGE = 8;
export const REMOTE_RENEW_MIN_TTL = 220;
export const REMOTE_RENEW_BUFFER_TICKS = 80;
export const REMOTE_RENEW_HYSTERESIS = 140;
export const REMOTE_REPLACEMENT_BUFFER_TICKS = 60;
// Remote reserver sizing & refresh. Controller reservation decays 1/tick unconditionally,
// so an N-CLAIM reserver only nets +(N-1)/tick. A 2-CLAIM reserver (+1/tick) barely outruns
// the recurring death→travel replacement gap; 3 CLAIM (+2/tick) gives real cushion.
export const REMOTE_RESERVER_CLAIM_PARTS = 3;
export const REMOTE_RESERVER_PANIC_CLAIM_PARTS = 5;
export const REMOTE_RESERVER_PANIC_TTL = 500;
export const REMOTE_RESERVE_REFRESH_TTL = 4500;
export const REMOTE_STANDBY_TRIGGER_TTL = 200;
export const REMOTE_STANDBY_PARK_RANGE_MIN = 4;
export const REMOTE_STANDBY_PARK_RANGE_TARGET = 6;
export const REMOTE_STANDBY_PARK_RANGE_MAX = 10;
export const REMOTE_STANDBY_BOUNDARY_STUCK_TICKS = 15;
export const MAX_REMOTE_HAULER_CAPACITY_PER_SOURCE = 2500;
export const MAX_REMOTE_HAULERS_PER_SOURCE = 2;
export const REMOTE_HAULER_POST_TRIP_RENEW_START_TTL = 1000;
export const REMOTE_HAULER_RENEW_START_TTL = 500;
export const REMOTE_HAULER_RENEW_STOP_TTL = 1400;
export const REMOTE_HAULER_RENEW_CRITICAL_TTL = 80;
export const REMOTE_HAULER_IDLE_RECHECK_TICKS = 75;
export const REMOTE_HAULER_WANDER_TICKS = 35;
export const REMOTE_HAULER_WANDER_MIN_RANGE = 6;
export const REMOTE_HAULER_WANDER_MAX_RANGE = 8;
export const REMOTE_HAULER_FAR_PICKUP_PATH_LENGTH = 100;
export const REMOTE_HAULER_FAR_PICKUP_RETURN_LOAD_RATIO = 0.75;
export const REMOTE_HAULER_RETARGET_STUCK_TICKS = 4;
export const REMOTE_TARGET_MAX_HAULER_CLAIMS = 2;
export const REMOTE_HAULER_ASSIGNED_SOURCE_MIN_ENERGY = 50;
export const REMOTE_HAULER_CROSS_SOURCE_MIN_ENERGY = 1000;
export const REMOTE_MINER_STUCK_REPLAN_TICKS = 8;
export const REMOTE_MINER_NO_PROGRESS_REPLAN_TICKS = 18;
export const REMOTE_MINER_OSCILLATION_REPLAN_TICKS = 4;
export const REMOTE_HOME_RECOVERY_STORED_ENERGY = 500;
export const REMOTE_SPAWN_AVAIL_CHECK_MAX_STORED = 5000;
export const REMOTE_THROTTLE_STORED_ENERGY = 1;
export const REMOTE_SPAWN_MIN_ENERGY_RATIO = 0.5;
export const REMOTE_HAULER_ABSOLUTE_MIN_COST = 600;
export const REMOTE_HAULER_USEFUL_MIN_COST = 900;
export const REMOTE_HAULER_MIN_DEMAND_RATIO = 0.4;
export const REMOTE_MAINTAINER_MIN_COST = 500;
export const REMOTE_CONTAINER_CRITICAL_REPAIR_THRESHOLD = 0.5;
export const REMOTE_MINER_REPAIR_THRESHOLD = 0.5;
export const REMOTE_MINER_REPAIR_RANGE = 3;
