import type { DatabaseSync } from 'node:sqlite';
import {
  XP_TASK_COMPLETE,
  petStateFrom,
  sessionXp,
  stageForXp,
  type PetState,
  type PetUpdate,
  type XpSource
} from '../../shared/pet';
import type { SessionState } from '../../shared/session';
import { addXp, choosePet, getPetRecord, getPetState, lastFocusedAt, totalXp } from '../db/pet';

// Owns the pet: choosing the starter and paying out XP. Every payout is a row in a ledger that
// allows each session and each task to pay only once, so nothing can be earned twice.
export class PetService {
  private readonly db: DatabaseSync;
  private readonly onChange: (update: PetUpdate) => void;

  constructor(db: DatabaseSync, onChange: (update: PetUpdate) => void = () => {}) {
    this.db = db;
    this.onChange = onChange;
  }

  // The chosen pet with its progress, or null before a starter has been picked.
  get(): PetState | null {
    return getPetState(this.db);
  }

  // Picks the starter pet. It can only be done once.
  choose(input: unknown): PetState {
    choosePet(this.db, input);
    return this.get() as PetState;
  }

  // Pays for a session that has ended: its focused minutes, plus a bonus if it was completed.
  // Returns the XP paid, which is 0 if this session was already paid or earned nothing.
  awardSession(sessionId: number, state: SessionState): number {
    const amount = sessionXp(state.focusedMs, state.endReason === 'completed');
    return this.award('session', sessionId, amount);
  }

  // Pays the bonus for finishing a task. Checking the same task off again pays nothing more.
  awardTask(todoId: number): number {
    return this.award('task', todoId, XP_TASK_COMPLETE);
  }

  private award(source: XpSource, refId: number, amount: number): number {
    const before = totalXp(this.db);
    if (!addXp(this.db, source, refId, amount)) {
      return 0;
    }

    // Without a pet there is nobody to tell. The XP stays in the ledger and counts as soon as
    // a starter is chosen.
    const record = getPetRecord(this.db);
    if (record) {
      const after = before + amount;
      this.onChange({
        pet: petStateFrom(record, after, lastFocusedAt(this.db)),
        gained: amount,
        evolved: stageForXp(after) > stageForXp(before)
      });
    }
    return amount;
  }
}
