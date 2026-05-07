# TypeScript Migration & Project Setup

**Date:** 2026-05-08  
**Agent:** Claude (claude-sonnet-4-6)

## What was done

Migrated `screeps-alpha` (11 plain JS files, 962 lines, no build system) into `screeps-agent` as a TypeScript + Rollup project. Logic preserved exactly — conversion only, no rewrite.

## File map

```
screeps-alpha/main.js                    → src/main.ts
screeps-alpha/creep.harvest.js           → src/creep.harvest.ts
screeps-alpha/creep.memoryManagement.js  → src/creep.memoryManagement.ts
screeps-alpha/creep.populationControl.js → src/creep.populationControl.ts
screeps-alpha/creep.roleBalance.js       → src/creep.roleBalance.ts
screeps-alpha/role.builder.js            → src/role.builder.ts
screeps-alpha/role.doctor.js             → src/role.doctor.ts
screeps-alpha/role.harvester.js          → src/role.harvester.ts
screeps-alpha/role.manual.js             → src/role.manual.ts
screeps-alpha/role.upgrader.js           → src/role.upgrader.ts
screeps-alpha/tower.basics.js            → src/tower.basics.ts
```

## Key decisions & non-obvious fixes

- **`rollup.config.mjs`** — must use `.mjs` extension to avoid CJS/ESM conflict with `Gruntfile.js` (which is CommonJS).
- **`"types": ["screeps"]` in tsconfig** — must be explicit. Without it, Screeps globals (`Game`, `Memory`, `FIND_*`, etc.) disappear when `rootDir` is set.
- **`declare const console`** — `@types/screeps` doesn't include `console`. Declared manually in `src/types.d.ts`.
- **`delete Memory.creeps[name]`** — TypeScript won't allow `creep.memory = undefined`. Use `delete` instead.
- **`tower.heal()` not `tower.repair()`** — the original JS called `tower.repair()` on a creep; TypeScript caught this. Corrected to `tower.heal()`.
- **`npx grunt` not `grunt`** — `grunt-cli` is a devDependency, not global. npm scripts use `npx grunt screeps`.
- **`.env` via dotenv** — credentials (`SCREEPS_EMAIL`, `SCREEPS_TOKEN`, `SCREEPS_BRANCH`) loaded in `Gruntfile.js` via `require('dotenv').config()`.

## Build verification

`npm run build` produces `dist/main.js` with zero TypeScript errors.

## To deploy

Fill in `.env` (copy `.env.example`), then `npm run deploy`.
