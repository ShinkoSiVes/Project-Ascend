# Overview

Project: Ascend is a local focus app. You set a goal, enter focus mode, and a game wraps around the work: a pet that grows, stages that get harder, and a run that resets if you fail. This document describes the product and its game design. See [architecture](architecture.md) and the [roadmap](roadmap.md) for how it is built.

## Goals

- Keep you focused on one task, and enforce it when willpower runs out.
- Keep your attention with a game loop that feels rewarding and never goes stale.
- Run entirely on your own machine.

## Look and feel

- **8-bit pixel art** throughout: a pixel font, chunky borders, a limited palette and chiptune-style sounds.
- **Pets** are original, Neopets-style creatures: cute, round and colorful. Their sprite shows a mood (happy, neutral, sad when you are distracted, hurt at low HP).
- The UI looks like a retro game menu, with HP and XP bars and pixel buttons.

## Core loop

1. Open the **dashboard** and create a goal (title, target hours, difficulty) with a **to-do list**.
2. In the **prep phase**, pick the active to-do, the links you may move freely between, the strictness level and the Pomodoro settings.
3. Start **focus mode**. The whitelist is locked, and the timer and pet run on a lock screen.
4. Reach the stage's **focus quota** to clear it, pick a perk, and move on to the next stage.
5. Miss a quota and the run is over: it resets to Stage 1 with a new seed.

## Roguelike runs

- A quest can be played as a **run**: a path of randomly generated stages. A seed makes each run reproducible. Only one run is active at a time.
- **A stage is one calendar day.** Its **quota** is an amount of focused time to reach that day, counting only sessions for the run's quest. Stage *k* takes place on the *k*th day of the run, and the day ends at local midnight. Clearing a stage early does not skip ahead: extra focus that day only earns XP, and tomorrow is the next stage.
- **Quota size** depends on the quest's difficulty stars: 20, 30, 45, 60 or 90 minutes a day at the start, growing up to 50% by the last stage. Every 5th stage and the last one is a **boss** day with a 50% bigger quota. A **rest** day with half the quota may appear now and then. It never comes first or on a boss day, and never within 6 stages of another rest day. Every quota is a multiple of 5 minutes. The number of stages follows the quest's target hours, between 3 and 30.
- A difficulty slider scales how fast difficulty ramps up and how often modifiers appear.
- **Missing a quota** ends the run, unless a Shield forgives it. A run also fails when HP reaches 0 from distractions (planned for roadmap step 5). If the app is not opened for several days, each missed day is settled in order the next time it runs.
- **Failing a run restarts it at stage 1 with a new seed and a new stage map. The pet keeps its XP and evolution.** What a failed run loses is the run itself: its stage progress, perks and map.
- **What persists after a reset:** the pet, best stage reached, total focus hours, run history, unlocks and achievements, and your quests and to-do lists.
- **Perks** are offered 3 at a time after each cleared stage, and an offer that is not picked expires at midnight. The first four are **Shield** (forgives one missed quota), **XP boost** (+25% XP from focus sessions for the rest of the run, stacking), **Lighter quota** (tomorrow's quota is 30% smaller) and **Reroll** (a token to redraw the offers at a later draft).

## Pets and evolution

- Choose one of three starters at first launch.
- Clearing stages gives XP. At set thresholds the pet evolves, and each starter has several evolution branches chosen by play style.
- Eggs found as loot hatch into new species and rare color variants.
- A pet dex tracks everything you have collected.

## Stages and replayability

Stages come from a weighted pool that rejects back-to-back repeats:

- **Types:** normal, boss and rest to begin with. Sprint, endurance and treasure stages come later.
- **Biomes** that change the look of the map and the pet's surroundings.
- **Modifiers:** no pause, shorter breaks, double or nothing, silent mode, stricter distraction penalty.
- **Perk drafting:** after each cleared stage, pick 1 of 3 random perks, so every run builds differently. More perks arrive over time.
- **Random events** between stages offer risk and reward choices.
- **Ascension tiers:** clearing a run unlocks a harder tier with new modifiers.
- **Daily seed** challenge and shareable seeds to replay or compare runs.

## Focus enforcement

Strictness is chosen per session:

| Level | Behavior |
|---|---|
| Gentle | Distractions are warned about and cost HP. One revive per run. |
| Medium | Non-whitelisted apps and tabs are blocked. Overriding costs tokens. |
| Hard | Blocked apps are closed. No revive, no override. |

Other enforcement:

- A focus lock screen shows the timer, pet and active to-do. Leaving it triggers the strictness rule.
- Time only counts while you are active in an allowed window. Idle and away detection pauses the quota clock.
- Quitting or killing the app mid-session on medium or hard counts as a failed stage.
- A desktop app cannot fully prevent Task Manager. Enforcement works through consequences and friction, not a system lockdown.

## Engagement

- **Loot** after each stage, from common to legendary: eggs, cosmetics, perks and pet food.
- **Combos** for unbroken focus, with XP ticking every minute.
- **Streaks** with freeze tokens, **daily quests** and a **weekly boss** stage.
- **Pet care:** your pet's mood follows your focus. It gets less happy when you are away, but is never harmed.
- **Unlock tree** funded by focus hours, so a failed run still earns something.

## Achievements

A trophy room shows every achievement as a pixel badge in four tiers: bronze, silver, gold and legendary. Locked ones appear as silhouettes with a hint and a progress bar, and some are hidden.

- **Categories:** focus time, streaks, run progress, pet collection, discipline, to-dos and secrets.
- **Rewards:** XP, a title, a cosmetic or an egg, with a bigger prize for completing a category.
- **Toasts** appear only during breaks, never mid-focus.
- Achievements are permanent and survive run resets.

## Wellbeing guardrails

The app aims to be habit-forming without dark patterns:

- No guilt-trip messages.
- A daily focus cap with a rest reminder.
- The pet is never harmed, only less happy.
