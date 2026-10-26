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
|  - SQLite (node:sqlite)   | <---------------------> |  Spotify Web API          |
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

Local SQLite file (`ascend.db`) in the app's user-data folder, accessed from the main process with Node's built-in `node:sqlite` module. Electron bundles Node 24, so there is no native module to rebuild or unpack. The module is still marked as a release candidate in Node 24, so all database access stays behind `src/main/db/` and can be swapped for another driver without touching the rest of the app.

- **Migrations:** versioned SQL in `src/main/db/migrations.ts`, applied in order inside a transaction and tracked with SQLite's `user_version`. A shipped migration is never edited; changes go in a new one.
- **Validation:** the renderer is untrusted, so the main process validates every input and the tables also carry `CHECK` constraints as a second line of defense.
- **Tables:** `goals`, `settings`, `todos`, `sessions`, `pets` and `xp_events` exist now; the rest are added by the step that needs them. Planned tables:

| Table | Purpose |
|---|---|
| `goals` | Title, target hours, difficulty (1 to 5), strictness default, created date |
| `todos` | Per-goal tasks: title, pomodoro estimate, status (open or done), position, completed date |
| `runs` | One row per run: goal, seed, tier, current stage, status, cause of end |
| `stages` | Generated stages of a run: type, biome, modifiers, quota, window, result |
| `sessions` | Focus sessions: goal, active to-do, the engine state as JSON, phase, focused time, end reason, last seen. Stage and distraction counts are added later. |
| `pets` | The chosen pet: species, name, chosen date. One row only; evolution branches and run level come later |
| `xp_events` | Every XP payout: source (session or task), reference id, amount, date. The pet's XP is the sum |
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

The state machine is a pure module in `src/shared/sessionEngine.ts`, with its types and rules in `src/shared/session.ts`:

- **No clock inside.** Every function takes the current time as an argument and returns a new state, so it is tested without waiting. The state stores timestamps, and the remaining time is derived from the state and `now`.
- **Catch-up.** `advance(state, now)` completes every phase that is already due, each at its own scheduled time. A laptop that slept for hours ends up exactly where the schedule says it should be.
- **Rounds.** Defaults are 25 minutes of focus, 5 of break, and a 15 minute long break after every 4th round. The last round ends the session with no break after it.
- **Pausing** depends on strictness: gentle is unlimited, medium allows 2 pauses of at most 5 minutes each (a longer pause ends by itself), and hard allows none. Paused time never counts as focus time.
- **Abandoning** ends the session but keeps the focus time already done. Whether that fails a stage is decided by the run engine, not here.
- **Saving.** The state is plain JSON, so it can be stored and restored at any moment.

The session state is written to SQLite on every transition, and a heartbeat ("last seen") is written every 15 seconds while a session is open and once more when the app quits.

The main process owns the one unfinished session in `SessionManager` (`src/main/session/`). It applies the pure engine to the saved state, saves every change, and pushes each new state to the window, which derives the countdown from it. A ticker calls `tick()` once a second. A unique index on `sessions` allows at most one unfinished session, and a damaged row is closed instead of blocking new sessions.

Known limit: the engine counts wall-clock time, so a laptop that sleeps in the middle of a round still counts that time as focus. Idle and away detection (roadmap step 5) will stop the clock while nobody is at the keyboard.

### Session recovery

On launch the app checks for a session left unfinished. If one exists, it was quit or killed mid-session. The time the app was closed must not count as focus, so the session is ended as abandoned at its last heartbeat, and only the focus time before that counts. This is how the no-quiet-exit rule works without needing to stop the process.

Planned for roadmap step 5: in medium or hard strictness the stage is also marked failed, and in gentle mode the user is offered to resume.

## Pet and XP

The pet rules are pure data and functions in `src/shared/pet.ts`. `PetService` (`src/main/pet/`) owns the pet and pays XP.

- **Starters:** Ember (fire), Tide (water) and Leaf (plant), each with three stages (baby, teen, final). The species and stage names are placeholders. One pet at a time, and the choice is made once.
- **XP ledger:** every payout is a row in `xp_events`, and the pet's XP is the sum of the rows. `(source, ref_id)` is unique, so a session or a task can pay only once. Un-checking and re-checking a task earns nothing extra. A ledger also makes it easy to count only the XP of one run when run resets arrive in roadmap step 4.
- **Rules:** 1 XP per whole focused minute, +25 XP for finishing a task, +50 XP for completing a whole session. An abandoned session still pays its focused minutes.
- **Evolution:** stage 2 at 300 XP and stage 3 at 1200 XP, about 5 and 20 focused hours. Each payout tells the window the new state, the amount gained and whether it just evolved.
- **When XP is paid:** the session manager tells the service when a session ends, including a session closed by crash recovery. Finishing a task pays through the IPC handler. XP earned before a starter is chosen stays in the ledger and counts once one is chosen.

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

- Electron hardening: renderer `sandbox` and `contextIsolation` on, `nodeIntegration` off, a strict content security policy, no remote content in the renderer, navigation locked to the app, external links opened only over `https:`, and all permission requests denied until a feature needs one.
- The preload script exposes only a small typed `window.api`, never Electron's IPC objects directly.
- The bridge only listens on `127.0.0.1` and requires the pairing token.
- Secrets (the Spotify refresh token) are encrypted with `safeStorage`. API keys, tokens and `.env` files are never committed.
- All data stays on the machine. The app collects no analytics and sends nothing except Spotify requests.
- Art, names and sounds are original. No assets are copied from other games.

## Project layout

The app is TypeScript, built with electron-vite. Folders marked (planned) do not exist yet.

```
src/main/        Electron main process: session, run engine, watcher, bridge, db, spotify
src/preload/     Preload script: the typed window.api exposed to the renderer
src/shared/      Types and limits shared by main, preload and renderer
src/renderer/    React UI: dashboard, prep, session, stage map, pet, trophies
extension/       (planned) Chrome extension: manifest.json, background script, blocked page
content/         (planned) JSON data: species, perks, modifiers, achievements, events
docs/            Documentation
```

## Testing

- Unit tests (Vitest, `npm test`) for migrations and goal validation, using in-memory databases.
- Unit tests for the run engine (determinism, ramp, no-repeat rule, reset behavior) and the whitelist matcher.
- Unit tests for the achievement engine against recorded event sequences.
- Manual end-to-end check of the extension: pick open tabs, add a URL, start a session, confirm allowed links navigate and everything else is blocked at medium and hard.
- Manual check of Spotify login and controls with a Premium account.
- Manual check of session recovery by killing the app mid-session.
