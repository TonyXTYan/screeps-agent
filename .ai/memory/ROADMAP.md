---
name: Roadmap
description: Deferred Screeps automation areas and strategic implementation notes
type: project
---

# Roadmap

## Labs

Labs are intentionally deferred until the room economy is stable at RCL7.

Future lab implementation should be Memory-configured rather than automatic:

- choose a desired compound explicitly in room memory
- reserve input labs and output labs
- haul required minerals and energy into labs
- run reactions only when both reagents are present and storage/terminal thresholds are safe
- add boost support only after creep body planners can request boosted body parts intentionally

Do not auto-select reactions from whatever minerals happen to be available.

## Future Action Registry

The capability job system should eventually cover non-economy actions, but the next priority is resource logistics.

Deferred action areas:

- combat: `attack`, `rangedAttack`, `rangedMassAttack`, `heal`, `rangedHeal`
- demolition: `dismantle`
- controller operations: `attackController`, `signController`, `generateSafeMode`
- movement coordination: `pull`
- lifecycle cleanup: `suicide`, only under explicit recycling policy
- power/factory/observer/nuker systems after RCL8 infrastructure exists

These should be added behind explicit strategy or Memory config, not enabled opportunistically.
