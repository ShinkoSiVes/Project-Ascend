// Rules for noticing a distraction: a blocked app in front while a focus round is running.
// Everything here is plain data and pure functions with no clock and no operating system calls,
// so the main process and the renderer can both use it. Reading the front app is done elsewhere.
//
// Only app names are ever looked at, never window titles, and nothing is kept but names and counts.

import { DISTRACTION_GRACE_SECONDS } from './run';
import { isAway, isPaused, type SessionState } from './session';

// App names are process names such as 'discord'. These are the presets the blocklist starts from.
// They are only a starting point: the person edits the list.
export const BLOCKLIST_PRESETS = {
  games: ['steam', 'epicgameslauncher', 'riotclientservices', 'leagueclient', 'minecraft'],
  chat: ['discord', 'telegram', 'whatsapp', 'messenger', 'signal'],
  social: ['tiktok', 'instagram', 'snapchat', 'facebook']
} as const;

export type BlocklistPresetId = keyof typeof BLOCKLIST_PRESETS;

// A process name made comparable: no spaces around it, lower case, and no '.exe' on the end.
export function normalizeApp(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, '');
}

// Whether an app is on the blocklist. An empty name never matches.
export function isBlocked(app: string | null, blocklist: readonly string[]): boolean {
  if (app === null) {
    return false;
  }
  const name = normalizeApp(app);
  return name !== '' && blocklist.some((entry) => normalizeApp(entry) === name);
}

export const MAX_BLOCKLIST_ENTRIES = 200;
export const MAX_APP_NAME_LENGTH = 100;

// The list a person starts with: every preset switched on.
export function defaultBlocklist(): string[] {
  return Object.values(BLOCKLIST_PRESETS).flat();
}

// The blocklist cleaned up: every name in its plain form, with blanks and repeats left out.
export function normalizeBlocklist(entries: readonly string[]): string[] {
  const names = entries.map(normalizeApp).filter((name) => name !== '');
  return [...new Set(names)];
}

// Checks a blocklist that came from the renderer or from storage. It returns a message, or null
// when the list is fine.
export function checkBlocklist(input: unknown): string | null {
  if (!Array.isArray(input)) {
    return 'The blocklist must be a list of app names';
  }
  if (input.length > MAX_BLOCKLIST_ENTRIES) {
    return `The blocklist can hold at most ${MAX_BLOCKLIST_ENTRIES} apps`;
  }
  for (const entry of input) {
    if (typeof entry !== 'string') {
      return 'Every app name must be text';
    }
    if (normalizeApp(entry).length > MAX_APP_NAME_LENGTH) {
      return `An app name can be at most ${MAX_APP_NAME_LENGTH} characters`;
    }
  }
  return null;
}

// A distraction only counts while the focus clock is really running: not in a break, not paused
// and not away. Being on a blocked app at those times costs nothing.
export function isFocusRunning(session: SessionState): boolean {
  return session.phase === 'focus' && !isPaused(session) && !isAway(session);
}

// What the watcher remembers between looks at the front app.
export interface WatchState {
  // The blocked app that has been in front without a break, or null if there is none.
  app: string | null;
  // When that app came to the front (epoch ms).
  since: number | null;
  // Whether this stretch has already cost something.
  counted: boolean;
}

export const IDLE_WATCH: WatchState = { app: null, since: null, counted: false };

export interface WatchResult {
  state: WatchState;
  // The name of the app that just became a distraction, or null.
  distraction: string | null;
}

// Looks at the front app once. A blocked app that stays in front for the grace period is a
// distraction, and it is counted once per stretch: only switching away and coming back, or
// moving to another blocked app, starts a new stretch. Anything else ends the stretch, including
// a moment when the focus clock is not running.
export function watchForeground(
  state: WatchState,
  app: string | null,
  blocklist: readonly string[],
  focusRunning: boolean,
  now: number
): WatchResult {
  if (!focusRunning || app === null || !isBlocked(app, blocklist)) {
    return { state: IDLE_WATCH, distraction: null };
  }

  const name = normalizeApp(app);
  const stretch: WatchState =
    state.app === name && state.since !== null ? state : { app: name, since: now, counted: false };

  const graceMs = DISTRACTION_GRACE_SECONDS * 1000;
  if (!stretch.counted && now - (stretch.since ?? now) >= graceMs) {
    return { state: { ...stretch, counted: true }, distraction: name };
  }
  return { state: stretch, distraction: null };
}
