# Architecture

How Project: Ascend is built. Product behavior is described in the [overview](overview.md); build order is in the [roadmap](roadmap.md). Libraries named here are planned choices and may change during the build.

## Components

```
+---------------------------+        localhost        +---------------------------+
|  Electron main process    | <---------------------> |  Chrome extension (MV3)   |
|  - session engine         |    WebSocket (token)    |  - lists open tabs        |
|  - run / stage engine     |                         |  - enforces whitelist     |
|  - active-window watcher  |                         +---------------------------+
|  - idle detection         |
|  - bridge server          |        HTTPS            +---------------------------+
|  - SQLite (better-sqlite3)| <---------------------> |  Spotify Web API          |
|  - Spotify client         |      OAuth (PKCE)       +---------------------------+
+-------------+-------------+
              | IPC (contextBridge)
+-------------v-------------+
|  Renderer (React + Vite)  |
|  dashboard, prep, session,|
|  stage map, pet, trophies |
+---------------------------+
```

- **Main process** owns all state and all system access. The renderer never touches the database, the filesystem or the network directly.
- **Renderer** is a React app styled as a retro game menu. It talks to the main process only through a small, typed IPC API exposed with `contextBridge`, with `contextIsolation` on and `nodeIntegration` off.
- **Chrome extension** is a Manifest V3 extension that reports tabs and enforces the link whitelist.
- Everything runs locally. The only outside network calls are to Spotify.

## Data storage

Local SQLite file in the app's user-data folder, accessed from the main process with `better-sqlite3`. Planned tables:

| Table | Purpose |
|---|---|
| `goals` | Title, target hours, difficulty, strictness default, created date |
| `todos` | Per-goal tasks: title, pomodoro estimate, status, order, completed date |
| `runs` | One row per run: goal, seed, tier, current stage, status, cause of end |
| `stages` | Generated stages of a run: type, biome, modifiers, quota, window, result |
| `sessions` | Focus sessions: stage, active to-do, start/end, focused seconds, distractions, state |
| `pets` | Species, evolution branch, run level, mood |
| `dex` | Collected species and variants |
| `whitelists` | Allowed URLs, domains and path prefixes, per goal |
| `unlocked_achievements` | Achievement id, unlocked date |
| `settings` | Strictness defaults, Pomodoro lengths, daily cap, audio |

Achievement definitions, perk definitions, modifier pools and species data live in versioned JSON files shipped with the app, not in the database. The database stores only player progress, so content can be updated without migrations.

## Run and stage engine

- A run is created with a **seed**. A seeded random generator produces the stage map from the goal's total hours, the difficulty slider and the ascension tier. The same seed always gives the same map.
- Stage types, biomes and modifiers are drawn from weighted pools. The generator keeps a short history and rejects an immediate repeat of the same stage type or event.
- Difficulty ramps with stage index. Each stage gets a quota (focused minutes) and a time window.
- Perk drafting and random events are generated from the same seeded generator, so a seed replays identically.
- The engine is a pure module with no Electron imports, so it can be unit tested: same seed gives the same map, difficulty ramps monotonically, and a missed quota resets the run to Stage 1 with a new seed while permanent progress is kept.

## Session engine

A session is a state machine: `prep`, `focus`, `break`, `ended`.

- **Prep:** the user picks the to-do, whitelist, strictness and Pomodoro settings. Nothing is enforced yet.
- **Focus:** the whitelist is frozen and enforcement turns on. A one-second tick counts focused time only when the active window is allowed and the user is not idle.
- **Break:** enforcement relaxes, achievement toasts can show, and Spotify stays available.
- **Ended:** the stage result is computed from focused time against the quota, and the run engine applies the outcome.

The session state is written to SQLite on every transition and about every 15 seconds while running.

### Session recovery

On launch the app checks for a session left in `focus`. If one exists in medium or hard strictness, it was quit or killed mid-session, so the stage is marked failed. In gentle mode the user is offered to resume. This is how the no-quiet-exit rule works without needing to stop the process.

## Focus enforcement

- **Active window:** the main process polls the foreground window (planned library: `active-win`) and matches the process name and window title against the allowed and blocked app lists.
- **Idle detection:** Electron's `powerMonitor.getSystemIdleTime()` pauses the quota clock after a configurable idle time.
- **Lock screen:** during focus the app shows an always-on-top overlay window with the timer, pet and active to-do. Leaving it triggers the strictness rule.
- **Responses by strictness:**
  - Gentle: warn and deduct HP.
  - Medium: block or minimize, with an override that costs tokens.
  - Hard: close blocked apps, no override.
- **Limit:** a normal desktop app cannot stop Task Manager or a determined user. Enforcement works through consequences (lost run, lost streak) and friction.

## Browser bridge and link whitelist

The whitelist is built in the prep phase and enforced by the Chrome extension.

- **Bridge:** the main process runs a WebSocket server bound to `127.0.0.1` only, on a fixed port. The extension connects to it.
- **Pairing:** on first run the app shows a one-time pairing token that the user enters in the extension. After that, every message carries the token and the server rejects anything without it, so other local web pages cannot talk to the bridge.
- **Prep phase:** the extension sends the list of open tabs (title and URL) so the user can tick the ones to allow. The user can also add a URL, a whole domain or a path prefix by hand. Rules are saved per goal in `whitelists`.
- **Focus phase:** the app pushes the frozen rule set to the extension. The extension uses `chrome.tabs` and `webNavigation` to intercept navigation. Allowed links navigate freely. Anything else is blocked or redirected to a pixel "blocked" page, according to strictness. New tabs outside the list are handled the same way.
- **Matching rules:** exact URL, domain (including subdomains) or path prefix. Query strings are ignored unless the rule is an exact URL, so a single YouTube video can be allowed without allowing the whole site.
- **Extension permissions** are kept minimal: `tabs`, `webNavigation`, and host access only as needed for enforcement.
- If the extension is not connected when a session starts, the app warns in prep. In hard mode the session cannot start without it.

## Spotify

- **Auth:** OAuth 2.0 authorization code flow with PKCE, using a Spotify developer app the user creates. No client secret is stored. The app opens the browser for consent and receives the code on a local redirect URL.
- **Tokens:** the access token is kept in memory. The refresh token is encrypted with Electron's `safeStorage` and stored locally. It never goes in the database in plain text or in logs.
- **Control:** now playing, play, pause, skip, volume and playlist choice through the Spotify Web API. Playback control needs Spotify Premium.
- **Prep:** a playlist can be chosen as part of the session loadout.
- If Spotify is unavailable, the app keeps working without music.

## Audio and visuals

- Pixel font and sprite sheets are bundled locally, so the app works fully offline.
- Sprites are rendered with `image-rendering: pixelated` and stepped CSS animation or canvas.
- Sound effects are short bundled files or generated chiptune tones. Audio never plays over Spotify at full volume; effects are ducked.

## Security and privacy

- Electron hardening: `contextIsolation` on, `nodeIntegration` off, a strict content security policy, no remote content in the renderer, and navigation locked to the app.
- The bridge only listens on `127.0.0.1` and requires the pairing token.
- Secrets (the Spotify refresh token) are encrypted with `safeStorage`. API keys, tokens and `.env` files are never committed.
- All data stays on the machine. The app collects no analytics and sends nothing except Spotify requests.
- Art, names and sounds are original. No assets are copied from other games.

## Project layout (planned)

```
main/         Electron main process: session, run engine, watcher, bridge, db, spotify
renderer/     React UI: dashboard, prep, session, stage map, pet, trophies
extension/    Chrome extension: manifest.json, background script, blocked page
content/      JSON data: species, perks, modifiers, achievements, events
docs/         Documentation
```

## Testing

- Unit tests for the run engine (determinism, ramp, no-repeat rule, reset behavior) and the whitelist matcher.
- Unit tests for the achievement engine against recorded event sequences.
- Manual end-to-end check of the extension: pick open tabs, add a URL, start a session, confirm allowed links navigate and everything else is blocked at medium and hard.
- Manual check of Spotify login and controls with a Premium account.
- Manual check of session recovery by killing the app mid-session.
