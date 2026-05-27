# Creep Population Caps

Quick reference for hard and soft limits on creep counts by archetype and RCL.

## Local Creeps

| Archetype | Cap | Formula / Notes |
|-----------|-----|-----------------|
| **Miner** | `sourceCount` | 1 per source; renew or respawn based on body/TTL conditions |
| **Patrol** | Dynamic | `RCL >= 6`: `min(ceil(enabledRemotes / 2) + hostileRooms, 2 + 2*enabledRemotes)`; `RCL < 6`: spawn up to 1 when home has armed hostiles |
| **Hauler** | Dynamic | `max(2, ceil(demand / maxCarryPerHauler) + 1)` |
| **Worker** | RCL-dependent | `[0, 2, 2, 2, 3, 3, 3, 4, 4]` for RCL 0–8 |
| **Mineral Miner** | 1 (soft) | Spawns when mineral site is ready and no mineral work coverage exists |

## Remote Creeps

| Archetype | Cap | Notes |
|-----------|-----|-------|
| **Remote Scout** | `REMOTE_SCOUT_KEEP_COUNT = 2` | Per remote room; extras overflow to wander behavior |
| **Remote Miner (active)** | Per-source slot cap (`1` static station, `2` max otherwise) | Spawned for source-work deficits |
| **Remote Miner (standby)** | Demand-driven handoff | Source-targeted replacement for low-TTL active miners |
| **Remote Hauler** | `MAX_REMOTE_HAULERS_PER_SOURCE = 2` | Per source; room-level total capped by sources |
| **Remote Maintainer** | Telemetry-driven | Uses maintenance pressure target sizing |
| **Claimer** | 1 per target | Controlled by claim/reserve plan |

## Defense Policy

- Patrol is the strategic defense archetype.
- Low-RCL patrol is event-driven only: below RCL 6 there is no baseline patrol population and no remote combat dispatch.
- Low-RCL home-defense patrols use full room energy capacity and wait for the planned emergency body, avoiding the 50% budget fallback that would produce an RCL3 no-HEAL patrol.
- Patrol is not counted as worker/hauler/miner capacity.

## Gate Logic

- Local pending spawn pressure still gates remote expansion.
- `dangerUntil` does not block normal remote assignment/spawn flow by default.
- Armed-hostile fail-safe applies when the threatened remote room has zero deployed non-renewing patrol coverage from that home: assigned non-combat remote creeps retreat home and non-combat remote spawns for that remote are blocked.
