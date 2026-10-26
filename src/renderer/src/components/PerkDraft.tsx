import { useState } from 'react';
import { PERKS, type PerkId, type RunState } from '../../../shared/run';
import { friendlyError } from '../lib/errors';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';

interface PerkDraftProps {
  run: RunState;
}

// The three perks on offer after a stage is cleared. Picking one takes it, and the offer is gone
// at midnight if nobody picks.
function PerkDraft({ run }: PerkDraftProps): React.JSX.Element | null {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (run.offers === null) {
    return null;
  }

  // Runs one request to the main process. The new run state comes back through the app's
  // listener, so nothing is stored here except a failure message.
  async function ask(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PixelPanel title="Choose a perk">
      <div className="pixel-stack">
        <p className="pixel-note">
          Stage {run.stageIndex} is cleared. Pick one perk for the rest of the run.
        </p>

        <div className="perk-cards">
          {run.offers.map((perk: PerkId) => (
            <button
              key={perk}
              type="button"
              className="perk-card"
              disabled={busy}
              onClick={() => ask(() => window.api.run.pickPerk(perk))}
            >
              <span className="perk-card__name">{PERKS[perk].name}</span>
              <span className="perk-card__blurb">{PERKS[perk].blurb}</span>
            </button>
          ))}
        </div>

        {message && (
          <p className="pixel-error" role="alert">
            {message}
          </p>
        )}

        <div className="pixel-row">
          <PixelButton
            size="small"
            disabled={busy || run.rerolls < 1}
            onClick={() => ask(() => window.api.run.reroll())}
          >
            Reroll ({run.rerolls})
          </PixelButton>
        </div>
        <p className="pixel-note">The offer expires at midnight if you do not pick.</p>
      </div>
    </PixelPanel>
  );
}

export default PerkDraft;
