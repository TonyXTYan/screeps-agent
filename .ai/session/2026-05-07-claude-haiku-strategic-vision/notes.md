# Strategic Vision: AI-Assisted Screeps Play

**Date:** 2026-05-07  
**Agent:** Claude Haiku 4.5  
**Source project:** screeps-typescript (session d3783698)

## What happened

Session in `screeps-typescript` repo. Used Maestri portal to browse the live Screeps game (account: TonyY). Navigated to a live room, explored the game state, attempted to place ramparts near room entrances via portal interaction.

Then researched and discussed the approach for AI agents running the account.

## Strategic direction agreed

**The model:** AI agents work collaboratively with the user — not fully autonomous.

- **User owns strategy**: high-level decisions (expand to new room? prioritize defense? trade on market?), goals, priorities, constraints
- **Agents own implementation**: read game state via Maestri portal, write/optimize code, suggest tactical adjustments within the strategy
- **Feedback loop**: regular check-ins to review performance and pivot strategy → write new code → repeat

## Proposed workflow

1. **Strategy sessions** — review room state via Maestri portal, discuss goals, user makes the call on direction
2. **Code implementation** — agents write/optimize TypeScript scripts to execute the strategy
3. **Autonomous execution** — code runs on the Screeps server each tick
4. **Periodic review** — agents monitor state, highlight problems, suggest strategic pivots

Agent could use `/loop` to periodically:
1. Read game state via Maestri portal
2. Analyze it against current strategy
3. Suggest adjustments or flag problems
4. Write updated code if needed

## Open questions (not resolved in session)

- Decision cadence: how often to check in? (on-demand vs scheduled)
- Scope of agent authority: can agents auto-adjust code within the strategy, or only suggest?
- Which server: public (with other players) vs private
