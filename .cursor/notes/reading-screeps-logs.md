# Reading Screeps console logs (agent note)

**Log location:** `screeps_console/logs/screeps_console_YYYY-MM-DD.json`  
**Format:** NDJSON — one JSON object per line (`ts`, `direction`, `shard`, `line`, `type`)

Verified on this machine (May 2026) while tuning Cursor shell allowlists.

---

## Built-in tools (no shell allowlist)

| Tool | Status | Usage |
|------|--------|--------|
| **Read** | ✅ | Tail: `offset: -30`, `limit: 30`. Returns raw JSON lines. |
| **Grep** | ✅ | Substring search in file (e.g. `W7N9`, `--- Shard`). Do not use `^` on inner `line` text. |
| **Glob** | ⚠️ | Often 0 hits — `screeps_console` is in `.gitignore` (logs stay **out of git** on purpose). Use explicit paths with Read/Grep, or `ls` / `find` in shell. Do not un-ignore logs for indexing unless Boss嚴 asks. |

---

## File size (plan reads accordingly)

| Day load | Approx. lines | Approx. size | Agent approach |
|----------|---------------|--------------|----------------|
| Light (console idle part of day) | ~15–20k | ~3–4 MB | `tail` / Read `offset: -N` is enough for “recent” |
| Full active day | ~50k+ | ~10–20 MB | Always filter (`jq select`, `grep`, `rg`) — never load whole file into context |
| Busy shard day | up to ~20 MB+ | | Prefer `tail -500` then `jq`, or Grep with `head_limit` |

**Rule:** For “what happened lately”, start at the file tail. For “everything about W8N9 today”, stream with `jq`/`rg`/`grep -c` first, then pull only matching lines.

---

## Shell — allowed (read-only)

Add these to the allowlist under `screeps_console/logs/` (or project-wide read patterns).

| Priority | Command | Typical use |
|----------|---------|-------------|
| **1** | `jq` | `jq -r '.line' LOG`, `jq -r 'select(.line \| test("W8N9")) \| .line' LOG` |
| **2** | `tail` | `tail -20 LOG \| jq -r '.line'` |
| **3** | `grep` / `egrep` / `fgrep` | `grep -c 'W7N9' LOG` |
| **4** | `rg` | Fast search/count |
| **5** | `.ai/scripts/read-logs.sh` | `.ai/scripts/read-logs.sh 'pattern' 50` |
| **6** | `.ai/scripts/analyze-logs.py` | **Direct exec only** — `.ai/scripts/analyze-logs.py LOG 'pat' --stats` |
| **7** | `.ai/scripts/check-screeps-recovery-regressions.py` | **Direct exec** — post-deploy regression scan on `LOG` |

Also allowed in testing: `head`, `awk`, `wc`, `cut`, `sort`, `uniq`, `ls`, `find`, `stat`, `file`, `strings`, `nl`, `less`, `more`, `xargs`, `diff`, `comm`, `paste`, `column`, `dd` (read), `hexdump`, `od`, pipelines (`tail \| jq`, `grep \| jq`), `jq -s`, bash `while read` / `read` builtin, process substitution in `diff`/`comm`, `bash .ai/scripts/read-logs.sh`.

**Suggested allowlist patterns (minimal set):**

```
jq *screeps_console/logs*
tail *screeps_console/logs*
grep *screeps_console/logs*
rg *screeps_console/logs*
.ai/scripts/read-logs.sh*
.ai/scripts/analyze-logs.py*
.ai/scripts/check-screeps-recovery-regressions.py*
```

---

## Shell — rejected (do not allowlist as read-only)

| Command | Rejection message (approx.) |
|---------|------------------------------|
| `cat`, `/bin/cat` | `cat is not read only` |
| `sed` | `sed is not read only` |
| `tr` | `tr is not read-only tool` |
| `python3 …` (any) | `should not allow any python3 scripts` / `python scripts` |
| `perl` | `perl is not read only` |
| `node` | `node is not read only` |
| `split` | `split is not just read only` |
| `tee` | `use read only tools only` |
| `sponge` | `use read only` |

**Python stats workaround:** run `.ai/scripts/analyze-logs.py` directly (shebang), not `python3 .ai/scripts/analyze-logs.py`.

**Full-file read workaround:** use `jq`, `while read`, or `head`/`tail` — not `cat`.

---

## Cheat sheet

```bash
# Today's file
LOG=screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json

# Last 20 messages (clean text)
tail -20 "$LOG" | jq -r '.line'

# Filter by room/pattern
jq -r 'select(.line | test("W8N9")) | .line' "$LOG" | tail -20

# Stats
.ai/scripts/analyze-logs.py "$LOG" 'W8N9' --stats

# Wrapper (auto-picks today)
.ai/scripts/read-logs.sh 'bucket' 10

# Errors (structured)
jq 'select(.type == "error")' "$LOG"

# Tick / CPU headers
jq -r 'select(.line | test("^--- Shard")) | .line' "$LOG" | tail -5
```

---

## Common log prefixes (grep these first)

| Prefix / pattern | Meaning |
|------------------|---------|
| `--- Shard` | Tick boundary + bucket + credits (use for timeline / CPU) |
| `[HOME]` | Home room energy, demand, recovery pull |
| `[REMOTE]` | Remote room status, DANGER windows (`until=`) |
| `[REMOTE-MAINT]` | Maintainer counts / triggers per remote link |
| `[MINERAL]` | Mineral extractor / container state |
| `room.controller:` | Spawn skips, energy waits, spawn success |
| `New:` (8-char hex) | Deploy / build marker — pair with regression script |
| `W\d+[NS]\d+` | Room name (e.g. `W7N9`, `W8N9`) — works in Grep and `jq test()` |

Room names also appear inside creep status lines (`W7N9 traveling`, `home: W7N9`).

---

## HTML entities in `line`

Server text is stored with HTML entities. Prefer **jq** `gsub` ( `sed` is not allowlisted):

```bash
# Decode common entities on output
jq -r '.line | gsub("&#x3E;"; ">") | gsub("&#x26A0;"; "⚠") | gsub("&amp;"; "&")' "$LOG" | tail -20

# Same, filtered by room
jq -r 'select(.line | test("W7N9")) | .line | gsub("&#x3E;"; ">")' "$LOG" | tail -10
```

`[REMOTE]` DANGER lines often look like `W7N9-&#x3E;W8N9` until decoded.

---

## Ticks (two formats)

1. **Shard headers** — `--- Shard shard1 --- Tick 71235165 --- … bucket ---`
2. **Inline tags** — `[REMOTE] t=71235163`, `[HOME] t=71235163`, etc.

```bash
# Latest shard header (current tick + bucket)
jq -r 'select(.line | test("^--- Shard")) | .line' "$LOG" | tail -1

# All messages for one game tick (inline t=)
grep '"t=71235163"' "$LOG" | jq -r '.line'

# Or jq-only on inline tick
jq -r 'select(.line | test("t=71235163")) | .line' "$LOG"

# Messages since a tick (inline t= >= N) — adjust N
jq -r 'select(.line | capture("t=(?<tick>[0-9]+)") | (.tick | tonumber) >= 71235000) | .line' "$LOG" | tail -30
```

For deploy comparisons, find the build line first: `grep 'New:' "$LOG" | tail -5 | jq -r '.line'`.

---

## Deploy / recovery regression check

After a push, scan for known recovery regressions (direct exec, same as `analyze-logs.py`):

```bash
.ai/scripts/check-screeps-recovery-regressions.py "$LOG"
.ai/scripts/check-screeps-recovery-regressions.py "$LOG" --after-build abc12345
```

See `.ai/memory/KNOWN_ISSUES.md` (recovery observability) for when to run this.

---

## Related docs

- `.ai/guides/READING_LOGS.md` — user-facing quick guide
- `.ai/memory/log-reading-methods.md` — permission-free methods reference
- `console/CONSOLE_LOGGING.md` — log format and screeps_console setup
- `screeps_console/README.md` — auto-logging behavior
- `.ai/scripts/check-screeps-recovery-regressions.py` — post-deploy recovery regression scan

---

*Last verified: 2026-05-27 against `screeps_console_2026-05-27.json` (~18k lines). Logs remain gitignored. Re-run spot checks after allowlist changes.*
