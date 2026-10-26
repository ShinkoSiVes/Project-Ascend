# Project: Ascend

A local "lock in" app that helps you focus on a task while keeping your attention through a game. Everything runs on your own machine.

> Status: planning. This repo currently holds documentation only; code is added later during the build.

## The idea

Pick a starter pet, set a goal, and start a focus run. Each goal is a roguelike run of randomly generated stages that get harder as you go. Hit the focus quota for a stage and your pet grows. Miss it, and the run resets to Stage 1.

## Features

- **Roguelike runs**: seeded, randomly generated stages with a difficulty slider. Stage length scales with the size of your goal. A missed quota resets the run.
- **Pet evolution**: choose a starter, then evolve it as you clear stages. The pets are original, Neopets-style creatures whose mood changes when you get distracted.
- **8-bit look and sound**: pixel art, a pixel font and chiptune-style effects.
- **To-do list per goal**: pick the task you are working on for each session.
- **Pomodoro timer**: work and break cycles tied to the active task.
- **Prep phase with a link whitelist**: before focus mode, choose the links you can move freely between. Everything else is handled by the session's strictness level.
- **Strictness per session**: gentle (warn and penalize), medium (block with an override cost) or hard (no escape).
- **Distraction detection**: notices when you switch to apps or sites that are not allowed.
- **Spotify control**: play, pause, skip and volume from inside the app (Premium required).
- **Dashboard**: where you set up goals, tasks and focus settings and see your run history.

## Tech stack (planned)

- Electron desktop app for Windows, written in TypeScript (built with electron-vite)
- React renderer
- Local SQLite storage
- Companion Chrome extension (Manifest V3) that talks to the app over localhost
- Spotify Web API

## Roadmap

1. Electron and React scaffold, SQLite, dashboard form
2. Pomodoro timer and to-do list
3. Pet, starter selection, XP and evolution
4. Stage generator, quotas and the roguelike run logic
5. Active-window detection and distraction penalties
6. Chrome extension, link whitelist and blocking
7. Spotify
8. Sound, animations and polish

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and pull request rules.
