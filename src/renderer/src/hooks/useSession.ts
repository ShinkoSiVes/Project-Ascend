import { useEffect, useState } from 'react';
import type { SessionState } from '../../../shared/session';

interface UseSession {
  // The session being shown: running, or just ended and waiting to be dismissed.
  session: SessionState | null;
  // False until the first answer from the main process, so the dashboard does not flash.
  ready: boolean;
  // Clears an ended session once the result screen has been read.
  dismiss: () => void;
}

// Follows the session owned by the main process. It asks once at startup and then listens
// for every change the main process pushes.
export function useSession(): UseSession {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const stopListening = window.api.session.onChange((next) => {
      if (!cancelled) {
        setSession(next);
      }
    });

    window.api.session
      .get()
      .then((current) => {
        if (!cancelled) {
          // A change pushed while waiting is newer than the answer, so it wins.
          setSession((pushed) => pushed ?? current);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  return { session, ready, dismiss: () => setSession(null) };
}
