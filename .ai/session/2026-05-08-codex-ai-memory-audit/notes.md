# .ai Memory Audit

**Date:** 2026-05-08
**Agent:** Codex

## What changed

- Moved `game_state_baseline.md` out of `.ai/memory/` because it is a dated operational snapshot, not durable project memory
- Removed model-specific guidance from `.ai/memory/tooling.md`
- Added an explicit note that official online Screeps docs are the source of truth when local copies are stale or ambiguous
- Fixed the broken session provenance reference in `project-vision.md`
- Normalized stale and inconsistent docs metadata in the scrape notes and generated README files

## Why

Persistent memory should stay stable and durable. Point-in-time game state and agent/model preferences decay quickly and should live in session artifacts instead.
