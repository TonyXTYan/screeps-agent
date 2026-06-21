# Follow-up Suggestions After Build 5f626790

Date: 2026-05-17
Scope: Home-room stuck/recovery behavior and hauler refill reliability
Based on logs: `screeps_console_2026-05-17.json`

## Summary

`5f626790` materially improved the original failure mode, but did not make recovery clean.

Confirmed improvements in the `2026-05-17` log:
- Home energy recovered from the collapse window (`3/5500`) to full capacity (`5600/5600`).
- `demand=YES recoveryPull=YES` stayed consistent after `36472f69`; the earlier `caca06ea` mismatch is gone.
- Local/home haulers resumed `refill` jobs after `5f626790`.
- Remote haulers stopped the pathological all-haulers-renewing loop after `5f626790` (`remoteRenew=0` in the parsed post-fix window).

Remaining problems:
- `recoveryPull=YES` persists for several samples even when `demand=no` and room energy is full.
- Home haulers still spend many post-fix samples idle, depositing, or withdrawing while demand exists.
- Remote energy throughput is still weak: W6N9 keeps a large dropped-energy pile while its hauler is full and apparently not progressing.
- W8N9 shows source-affinity leakage: a hauler assigned to source `4adbfc6b` targets dropped energy near source `4adbfc69`.

## Review Against `screeps_console_2026-05-17.json`

Relevant build sequence:
- `3938edbb`
- `caca06ea`
- `36472f69`
- `5f626790`

Parsed signals from the corrected log:

```text
caca06ea:
  home samples: 15
  demand=YES recoveryPull=no: 15
  remote hauler renew: 45/45

36472f69:
  home samples: 29
  energy: 1257 -> 3 / 5500
  demand=YES recoveryPull=YES: 29
  remote hauler renew: 35/38

5f626790:
  home samples: 109
  energy: 3 -> 3492 / 5600, max 5600
  full-energy samples: 9
  demand=YES recoveryPull=YES: 103
  demand=no recoveryPull=YES: 6
  local hauler refill: 62
  local hauler renew: 7
  local hauler idle: 49
  local hauler deposit: 14
  local hauler withdraw: 51
  remote hauler renew: 0/110
  remote hauler full/stationary-looking samples: 58
```

Interpretation:
- The original stuck state was introduced by the `caca06ea`/pre-`36472f69` recovery-pull bug and compounded by remote hauler renew priority.
- `36472f69` fixed the `recoveryPull` activation mismatch but not the remote renew trap.
- `5f626790` fixed the remote renew trap enough for home recovery to proceed.
- The room is no longer hard-stuck in the same way, but there are still throughput bugs that can make it look stuck or cause another slow recovery.

## 1) Add Log-Based Regression Guard

Issue:
- The exact failure signatures are now obvious in hindsight but were only caught manually after deploy.

Suggestion:
- Add a local parser/check for console logs and fail on these triggers:
  - `demand=YES recoveryPull=no` for more than 20 sampled ticks.
  - Remote hauler `renewing` ratio above 80% for more than 100 ticks while home energy is below 30%.
  - Home energy flatlines within +/-100 for more than 150 ticks under demand.
  - Post-recovery `demand=no recoveryPull=YES` persists beyond a small grace window.

Expected effect:
- Catches the `caca06ea` regression immediately.
- Catches the all-remote-haulers-renewing state immediately.
- Makes future deploy evaluation objective instead of manual log reading.

## 2) Fix Remote Hauler Source Affinity For Pickup/Withdraw

Issue:
- Post-`5f626790`, W8N9 shows a remote hauler assigned to source `4adbfc6b` chasing dropped energy at the other source's station:
  - `remoteHauler-Spawn1-70996516-1 src=4adbfc6b ... job=pickupEnergy ... trg=[43,6]`
  - Source `4adbfc6b` station is `[18,27]`; `[43,6]` belongs to source `4adbfc69`.

Suggestion:
- For remote haulers with an assigned `sourceId`, prefer pickup/withdraw targets at that source's station/container.
- Only allow cross-source pickup when the assigned source is dry and the alternate pile exceeds a high overflow threshold.
- If cross-source pickup is intentional, log it explicitly as `crossSourcePickup=YES from=<sourceId> to=<sourceId>`.

Expected effect:
- Prevents haulers from walking across the remote room to service the wrong source while their assigned container backs up.
- Reduces stale dropped piles and improves round-trip predictability.

## 3) Add Emergency Delivery Override For Local Haulers

Issue:
- `5f626790` restores refill behavior, but post-fix local haulers still show many non-delivery states while demand is active:
  - `localIdle=49`
  - `localDeposit=14`
  - `localWithdraw=51`
  - `localRefill=62`

Suggestion:
- In the local hauler assignment path, add an emergency override:
  - If the room has spawn/extension demand, a hauler with energy must select `refillSpawn`/extension before deposit or storage maintenance.
  - If no extension/spawn target exists, allow low tower refill.
  - Only allow storage deposit/idle when no valid delivery target exists.

Expected effect:
- More deterministic extension refill during recovery.
- Less visible "hauler is doing nothing" behavior when energy exists in the creep and demand is active.

## 4) Add Anti-Idle Fallback For Energy-Carrying Creeps

Issue:
- Tail samples still show creeps carrying energy with `-` or non-productive states during demand windows.
- Example class: a local hauler with carried energy and no displayed job while `demand=YES`.

Suggestion:
- If a hauler or refill-capable support creep has `store[ENERGY] > 0` and no valid job for 2-3 ticks, force a fallback target:
  - nearest extension/spawn
  - low tower
  - storage/terminal as last resort

Expected effect:
- Fewer dead ticks with carried energy.
- Protects against transient target invalidation bugs.

## 5) Improve RecoveryPull Observability And Exit Criteria

Issue:
- In the latest tail, `recoveryPull=YES` remains true while `demand=no` and `en=5600/5600`.
- This may be intentional hysteresis, but the logs do not expose why recovery mode remains active.

Suggestion:
- Add a compact reason field to the home summary:
  - `recoveryReason=spawn|tower|storage|remote|none`
- If the reason is tower hysteresis, log tower energy ratios.
- Consider exiting recovery pull when spawn/extensions are full and no tower is below the true emergency threshold, rather than holding recovery mode on a broad tower-restoration target.

Expected effect:
- Makes `demand=no recoveryPull=YES` diagnosable.
- Avoids unnecessarily starving remote/normal behavior after immediate spawn-extension recovery is complete.

## 6) Bootstrap Spawn Policy Under Deep Low-Energy

Issue:
- During deep low-energy recovery, planner logs still mention expensive remote hauler targets like `cost=2550`.
- Fallback spawning eventually works, but the policy is implicit and noisy.

Suggestion:
- Add explicit bootstrap mode:
  - When `energyAvailable < 30%` and `demand=YES`, force cheap local recovery bodies first.
  - Suppress or demote expensive remote-spawn attempts until local spawn/extension refill is stable.

Expected effect:
- Faster first useful delivery creeps after collapse.
- Cleaner recovery logs.

## 7) Tighten Home Hauler Renew Rules During Demand

Issue:
- There were still a few local hauler renew samples after `5f626790` (`localRenew=7`), but this no longer appears to be the dominant stuck cause.

Suggestion:
- Keep a scoped rule:
  - If `energyRecoveryActive` or spawn/extension demand exists, block home-hauler renew unless TTL is critically low, e.g. `<= 60`.
  - Do not apply this broadly to miners/workers without role-specific review.

Expected effect:
- Prevents renew from interrupting emergency delivery.
- Lower priority than remote source affinity and local anti-idle because the latest log shows renew is no longer persistent.

## Suggested Implementation Order

1. Add the log-based regression guard.
2. Fix remote-hauler source affinity for pickup/withdraw.
3. Add local-hauler emergency delivery override.
4. Add anti-idle fallback for energy-carrying creeps.
5. Improve `recoveryPull` reason logging and tune exit criteria if the reason proves stale.
6. Add explicit bootstrap spawn mode.
7. Tighten home-hauler renew only as a scoped safety rule.
