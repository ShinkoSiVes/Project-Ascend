# Roadmap

The build order for Project: Ascend. Each step should be shippable on its own and land through its own branches and pull requests (see [CONTRIBUTING.md](../CONTRIBUTING.md)). Product behavior is in the [overview](overview.md) and the design is in the [architecture](architecture.md).

Status values: `todo`, `in progress`, `done`.

| # | Step | Status |
|---|---|---|
| 0 | Planning and documentation | done |
| 1 | Scaffold, database and dashboard | done |
| 2 | Pomodoro timer and to-do list | done |
| 3 | Pet, starters, XP and evolution | todo |
| 4 | Stage generator, quotas and roguelike runs | todo |
| 5 | Enforcement: window detection, lock screen, recovery | todo |
| 6 | Chrome extension and link whitelist | todo |
| 7 | Spotify | todo |
| 7b | Engagement and replay layer | todo |
| 8 | Sound, animation and polish | todo |

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

- Starter selection on first launch.
- XP, evolution thresholds and branching evolution paths.
- Mood sprites that react to focus and distraction.

**Done when:** a pet gains XP from a session and evolves at a threshold.

## 4. Stage generator, quotas and roguelike runs

- Seeded stage generator with weighted pools and no-immediate-repeat rule.
- Quotas, time windows and a difficulty ramp with the difficulty slider.
- Stage types, modifiers, perk drafting and random events built into the generator from the start.
- Run engine: missed quota or 0 HP ends the run, resets to Stage 1 with a new seed, and keeps permanent progress.
- Run history on the dashboard.

**Done when:** unit tests show the same seed gives the same map, difficulty ramps up, and a failed run resets correctly while permanent stats persist.

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

## Working rules

- Each step is split into small branches and pull requests, one topic per branch.
- This roadmap's status column is updated in the pull request that finishes a step.
- Decisions that change the design update the overview or architecture doc in the same pull request.
