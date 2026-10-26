# Roadmap

The build order for Project: Ascend. Each step should be shippable on its own and land through its own branches and pull requests (see [CONTRIBUTING.md](../CONTRIBUTING.md)). Product behavior is in the [overview](overview.md) and the design is in the [architecture](architecture.md).

Status values: `todo`, `in progress`, `done`.

| # | Step | Status |
|---|---|---|
| 0 | Planning and documentation | done |
| 1 | Scaffold, database and dashboard | done |
| 2 | Pomodoro timer and to-do list | done |
| 3 | Pet, starters, XP and evolution | done |
| 4 | Stage generator, quotas and roguelike runs | done |
| 5 | Enforcement: window detection, lock screen, recovery | todo |
| 6 | Chrome extension and link whitelist | todo |
| 7 | Spotify | todo |
| 7b | Engagement and replay layer | todo |
| 8 | Sound, animation and polish | todo |
| 9 | Dashboard overhaul | todo |

## 0. Planning and documentation

- README and contribution rules: done.
- Overview and architecture docs: done.
- Roadmap: this document.

## 1. Scaffold, database and dashboard

- Electron and React (Vite) scaffold with a hardened main/renderer split.
- Pixel theme, pixel font and base UI components, so every later screen is styled from the start.
- SQLite setup with migrations.
- Dashboard form to create a goal: title, target hours, difficulty and strictness.

**Done when:** `npm start` opens the app and a goal can be created and saved across restarts.

## 2. Pomodoro timer and to-do list

- Session state machine (`prep`, `focus`, `break`, `ended`) with the timer UI. Defaults: 25 minute focus, 5 minute break, 15 minute long break every 4 rounds. Pauses depend on strictness (gentle unlimited, medium 2 pauses of up to 5 minutes, hard none), and abandoning a session keeps the focus time already done.
- Per-goal to-do list: add, edit, reorder, check off, delete, with a pomodoro estimate.
- Pick the active to-do in prep, and count focused time against it.
- Bonus XP on completing a to-do.

**Done when:** a full Pomodoro session runs against a chosen to-do and the result is saved.

## 3. Pet, starters, XP and evolution

- Starter selection on first launch: Ember, Tide or Leaf, each with a name chosen by the player.
- XP ledger and rules: 1 XP per focused minute, +25 per finished task, +50 per completed session. Evolution at 300 and 1200 XP (3 stages: baby, teen, final).
- Code-drawn pixel sprites for every species and stage, with mood variants that react to focus and distraction.
- Pet panel with an XP bar, and an evolution moment when the pet grows.
- Branching evolution paths are left for the engagement layer (7b).

Split into two pull requests: the pure rules, database, XP service and IPC first, then the screens and sprites.

**Done when:** a pet gains XP from a session and evolves at a threshold.

## 4. Stage generator, quotas and roguelike runs

- Seeded stage generator: one stage per calendar day, daily quotas from the difficulty, a ramp, boss days and rest days.
- Run engine: a missed quota ends the run unless a Shield forgives it, a failed run restarts at stage 1 with a new seed, and the pet keeps its growth. (0 HP from distractions is added in step 5.)
- Perk drafting after each cleared stage: Shield, XP boost, Lighter quota and Reroll.
- Run history, best stage and total focus hours on the dashboard.
- Stage map, daily quota progress, perk draft and run result screens.
- Stage modifiers, random events and more stage types are left for the engagement layer (7b).

Split into three pull requests: the pure generator and run rules, then saving runs and the daily rollover in the main process, then the screens.

**Done when:** unit tests show the same seed gives the same map, quotas ramp up, a missed day fails the run (or spends a Shield), and a failed run restarts while the pet and the permanent stats persist.

## 5. Enforcement: window detection, lock screen, recovery

- Active-window watcher with allowed and blocked app lists.
- Idle and away detection that pauses the quota clock.
- Always-on-top focus lock screen.
- Strictness behavior for gentle, medium and hard.
- Session recovery: quitting mid-session on medium or hard counts as a failed stage.

**Done when:** opening a blocked app triggers the right response at each strictness, and killing the app mid-session fails the stage on next launch.

## 6. Chrome extension and link whitelist

- Manifest V3 extension with tab reporting and navigation enforcement.
- Localhost WebSocket bridge with one-time pairing token.
- Prep screen to pick open tabs and add URLs, domains or path prefixes, saved per goal.
- Blocking per strictness level, including new tabs outside the list.

**Done when:** allowed links navigate freely during a session and everything else is blocked at medium and hard.

## 7. Spotify

- OAuth with PKCE and an encrypted refresh token.
- Now playing, play, pause, skip, volume and playlist choice in the app (Premium required).

**Done when:** logging in works and the controls change playback.

## 7b. Engagement and replay layer

- Achievement book and event-based achievement engine, with break-time toasts.
- Loot drops, eggs and the pet dex.
- Streaks with freeze tokens, daily quests and the weekly boss.
- Ascension tiers, daily seed challenge and shareable seeds.
- Unlock tree and the daily focus cap with a rest reminder.

**Done when:** a full run produces loot and achievements, and a second run plays noticeably differently.

## 8. Sound, animation and polish

- Chiptune-style sound effects with ducking over Spotify.
- Pet mood animations and stage transitions.
- Accessibility and settings pass.

**Done when:** the app feels finished end to end and the manual checks in the architecture doc pass.

## 9. Dashboard overhaul

Done last, once every other step is implemented.

- Only **focus mode** (the timer screen while a session runs) keeps the 8-bit pixel look.
- The dashboard and the selection screens (starter picker, session prep, stage map, perk draft and results) get a high-end modern design, with animation and interactive, animated elements.
- The design direction (mood, palette, how playful) is decided with the player before any design work starts.
- The overview's description of the look and feel is updated in the same pull request.
- Behavior, data and tests stay as they are; this step changes presentation only.

**Done when:** the dashboard and selection screens use the new design, focus mode still looks 8-bit, and everything stays keyboard accessible and respects reduced motion.

## Working rules

- Each step is split into small branches and pull requests, one topic per branch.
- This roadmap's status column is updated in the pull request that finishes a step.
- Decisions that change the design update the overview or architecture doc in the same pull request.
