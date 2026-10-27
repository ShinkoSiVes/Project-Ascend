import {
  IDLE_WATCH,
  isFocusRunning,
  watchForeground,
  type WatchState
} from '../../shared/distraction';
import type { SessionState } from '../../shared/session';

export interface DistractionWatcherOptions {
  // The clock, replaced in tests.
  now?: () => number;
  // The name of the app in front, or null if it cannot be read. Left out, nothing is ever seen.
  foregroundApp?: () => string | null;
  // The apps that count as a distraction.
  blocklist: () => readonly string[];
  // The unfinished session, or null if there is none.
  session: () => SessionState | null;
  // Hears each distraction once, with the app's plain name and the session it happened in.
  onDistraction: (app: string, session: SessionState) => void;
}

// Looks at the app in front about once a second and reports a distraction when a blocked app stays
// there too long during a running focus round. The rules are in shared/distraction.ts. This class
// only gathers what they need, so the reader and the clock can be replaced in tests.
export class DistractionWatcher {
  private watch: WatchState = IDLE_WATCH;
  private readonly now: () => number;
  private readonly foregroundApp: () => string | null;
  private readonly blocklist: () => readonly string[];
  private readonly session: () => SessionState | null;
  private readonly onDistraction: (app: string, session: SessionState) => void;

  constructor(options: DistractionWatcherOptions) {
    this.now = options.now ?? Date.now;
    this.foregroundApp = options.foregroundApp ?? (() => null);
    this.blocklist = options.blocklist;
    this.session = options.session;
    this.onDistraction = options.onDistraction;
  }

  // Called about once a second. Without a running focus round it does not even read the front
  // app, so nothing is looked at outside a session.
  tick(): void {
    const session = this.session();
    if (!session || !isFocusRunning(session)) {
      this.watch = IDLE_WATCH;
      return;
    }

    const result = watchForeground(
      this.watch,
      this.foregroundApp(),
      this.blocklist(),
      true,
      this.now()
    );
    this.watch = result.state;

    if (result.distraction !== null) {
      this.onDistraction(result.distraction, session);
    }
  }
}
