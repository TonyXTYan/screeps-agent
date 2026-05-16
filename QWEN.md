# Screeps AI Bot Agent

TypeScript bot for the Screeps persistent programming game. Bundled via Rollup → `dist/main.js`, pushed via grunt-screeps.

**Read `.ai/project-instructions.md` first** — it contains complete architecture, tick loop order, module map, conventions, memory rules, and toolchain details. This file is intentionally minimal as a high-level index.

```bash
npm run build    # rollup → dist/main.js
npm run push     # grunt-screeps (requires .env)
npm run deploy   # build + push
npm run watch    # auto-rebuild
```

## Quick Reference

- **Entry:** `src/main.ts` exports `loop()`
- **Types:** extend `CreepMemory`/`RoomMemory`/`SpawnMemory` in `src/types.d.ts` only
- **Deploy credential:** copy `.env.example` → `.env` with `SCREEPS_EMAIL`, `SCREEPS_TOKEN`, `SCREEPS_BRANCH`
- **No test script** — verify by building and pushing to server
- **Sourcemaps stay local** — not uploaded to server
- **Never run `push`, `deploy`, or `watch` without explicit user consent.** Always confirm first. After every code change, run `npm run build` to verify compilation succeeds.
