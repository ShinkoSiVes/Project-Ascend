import { useCallback, useEffect, useState } from 'react';
import { stageForXp, type PetState } from '../../../shared/pet';

// An evolution the person has not seen yet: the stage before and the stage after.
export interface PendingEvolution {
  from: number;
  to: number;
}

// XP just earned, with a counter so the same amount twice in a row still shows again.
export interface XpGain {
  amount: number;
  key: number;
}

interface UsePet {
  pet: PetState | null;
  // False until the first answer from the main process.
  ready: boolean;
  gain: XpGain | null;
  evolution: PendingEvolution | null;
  setPet: (pet: PetState) => void;
  dismissEvolution: () => void;
}

const GAIN_SHOWN_MS = 4000;

// Follows the pet owned by the main process: asks once at startup, then listens for XP.
export function usePet(): UsePet {
  const [pet, setPet] = useState<PetState | null>(null);
  const [ready, setReady] = useState(false);
  const [gain, setGain] = useState<XpGain | null>(null);
  const [evolution, setEvolution] = useState<PendingEvolution | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stopListening = window.api.pet.onChange((update) => {
      if (cancelled) {
        return;
      }
      setPet(update.pet);
      setGain((previous) => ({ amount: update.gained, key: (previous?.key ?? 0) + 1 }));
      if (update.evolved) {
        setEvolution({ from: stageForXp(update.pet.xp - update.gained), to: update.pet.stage });
      }
    });

    window.api.pet
      .get()
      .then((current) => {
        if (!cancelled) {
          // A payout pushed while waiting is newer than the answer, so it wins.
          setPet((pushed) => pushed ?? current);
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

  // The "+XP" note fades away by itself.
  useEffect(() => {
    if (gain === null) {
      return;
    }
    const timer = setTimeout(() => setGain(null), GAIN_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [gain]);

  const dismissEvolution = useCallback(() => setEvolution(null), []);

  return { pet, ready, gain, evolution, setPet, dismissEvolution };
}
