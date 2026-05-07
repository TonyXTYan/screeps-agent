---
name: Project Vision
description: AI-assisted play model—user owns strategy (expansion, defense, decisions), agents own implementation
type: project
---

# Project Vision

The goal of this project is not just a Screeps bot — it's an **AI-assisted Screeps player**.

## The model

- **User owns strategy**: expansion decisions, defense priorities, resource allocation, market/diplomatic stance
- **AI agents own implementation**: read game state (via Maestri portal), write/optimize TypeScript scripts, suggest tactical adjustments within the agreed strategy
- **Collaborative, not autonomous**: user stays in the driver's seat; agents don't act unilaterally on major decisions

## How agents interact with the game

- Maestri portal connected to https://screeps.com shows the live game
- Agents use `maestri portal snapshot "Screeps"` to read room state
- Agents write/update TypeScript code in this repo, then deploy via `npm run deploy`
- Periodic check-ins to review performance and adjust strategy

## Account info

- Username: TonyY
- Server: public Screeps server

## Origin

This vision was established in session `.ai/session/2026-05-07-claude-haiku-strategic-vision/notes.md` before the TypeScript migration.
