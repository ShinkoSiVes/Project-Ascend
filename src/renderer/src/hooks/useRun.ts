import { useCallback, useEffect, useState } from 'react';
import type { RunState } from '../../../shared/run';

interface UseRun {
  // The run being played, or null. An abandoned run is not shown.
  active: RunState | null;
  // A run that failed or was won and has not been read yet, or null.
  result: RunState | null;
  // False until the first answer from the main process.
  ready: boolean;
  // Marks the result as read and clears it from the screen.
  dismissResult: () => Promise<void>;
}

// Follows the run owned by the main process: asks once at startup, then listens for changes.
export function useRun(): UseRun {
  const [run, setRun] = useState<RunState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const stopListening = window.api.run.onChange((next) => {
      if (!cancelled) {
        setRun(next);
      }
    });

    window.api.run
      .get()
      .then((current) => {
        if (!cancelled) {
          // A change pushed while waiting is newer than the answer, so it wins.
          setRun((pushed) => pushed ?? current);
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

  const dismissResult = useCallback(async () => {
    try {
      await window.api.run.dismiss();
    } finally {
      setRun(null);
    }
  }, []);

  return {
    active: run?.status === 'active' ? run : null,
    result: run?.status === 'failed' || run?.status === 'completed' ? run : null,
    ready,
    dismissResult
  };
}
