How does CPU limit work | Screeps Documentation































































The Screeps game engine exists in two variants: browser-based (**Simulation** **mode**) and server-based (**online mode**). When you play in the Simulation mode, your scripts are executed by means of your browser only. The game API in the Simulation is the same as that on the server, but the server does not take part in game calculations.
On the other hand, in the online mode calculations of your scripts do not affect your browser in any way and done on the servers only. In order to maintain them, we offer CPU time that allows you to use CPU resources of the game servers.
As described in the article [Understanding game loop, time and ticks](/game-loop.html), the game process is divided into game iterations, or **ticks**. During each tick, the game engine calculates each player's scripts concurrently. Then all the planned activities are executed. The duration of one game tick is not fixed - a tick ends when all scripts of all players have been executed to the end.

## [](#CPU-Limit)CPU Limit[](#CPU-Limit)
In order to avoid abuse of execution time (which would affect the duration of the game tick for all players), we have introduced a concept of **CPU time limit**. This is a duration of time in milliseconds during which your game script is allowed to run within one tick. The CPU limit 100 means that after 100 ms execution of your script will be terminated even if it has not accomplished some work yet. Your CPU time limit depends on your [Global Control Level](/control.html) if you have activated CPU Unlock, or fixed at 20 otherwise.

## [](#Bucket)Bucket[](#Bucket)
However, for your convenience, there may be a rollover of unused time limit for using in future ticks. This allows to carry out resource-hungry operations in bursts once per several ticks, thus exceeding the CPU limit set in your account provided your scripts have saved resources in the preceding ticks.

If a script during a tick worked less time than the account CPU baseline limit set, the resulting difference is added to a cumulative bucket. You may accumulate up to 10,000 CPU. If the bucket contains any accumulation, your script can overrun your CPU limit using up to 500 CPU per tick from the amount accumulated in the bucket.
For example, if your account limit is set to 150 and you consume only 100 CPU per tick, then 50 CPU per tick will go to the bucket. You will be able to execute either a one-time burst exceeding the limit by 250 CPU every 5 ticks, or a series of 20 bursts for 500 CPU each once per 200 ticks.
The property [`Game.cpu.tickLimit`](/api/#Game.cpu) reflects the amount of CPU that you can spend on a current tick given the accumulation. As soon as the [`Game.cpu.bucket`](/api/#Game.cpu) is full, [`Game.cpu.tickLimit`](/api/#Game.cpu) equals 500. It will start decreasing only after the accumulation is depleted. [`Game.cpu.tickLimit`](/api/#Game.cpu) can never be less than your account limit, i.e the [`Game.cpu.limit`](/api/#Game.cpu) property.
Therefore, you can plan your limit usage by postponing some calculations (for example pathfinding operations) to the moment when you are able to do them in bursts by exceeding the limit.








**Contents**
1. [CPU Limit](#CPU-Limit)
2. [Bucket](#Bucket)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)