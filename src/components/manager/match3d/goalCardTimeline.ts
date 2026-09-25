import type { MatchSimEvent } from '@/match-engine';

/**
 * When the scorer's card shows, when it leaves, and when the match is paused and
 * resumed around it — as plain logic, so it can be checked against the real engine
 * without a browser. GoalScorerCard drives it from its frame loop and does what it says.
 *
 * The engine holds play for its own short celebration after a goal and then kicks off
 * again (at x4 a fraction of a second later). If that kick-off arrives while the card is
 * still up, the timeline asks for a pause, and for the resume once the card is gone —
 * through the live screen's own pause, the one the menu uses. A pause the viewer made
 * themselves is theirs: it is never resumed by the card, and never doubled.
 */

/** How long the card stays up, real milliseconds; and how long it takes to leave. */
export const CARD_MS = 3000;
export const LEAVE_MS = 280;

export type GoalCardAction =
  | { kind: 'show'; playerId: string; side: 'home' | 'away' | undefined; minute: number }
  | { kind: 'leave' }
  | { kind: 'hide' }
  | { kind: 'pause' }
  | { kind: 'resume' };

export class GoalCardTimeline {
  private until = 0;
  private leaving = false;
  private waitingKickoff = false;
  private pausedByCard = false;

  /** Feed each new engine event, with the real time it was seen. */
  event(event: MatchSimEvent, now: number, paused: boolean, out: GoalCardAction[]): void {
    if (event.type === 'goal') {
      // An own goal with no scorer on record gets no card.
      if (!event.playerId) return;
      out.push({ kind: 'show', playerId: event.playerId, side: event.side, minute: Math.min(90, event.minute + 1) });
      this.until = now + CARD_MS;
      this.leaving = false;
      this.waitingKickoff = true;
      return;
    }
    if (event.type === 'kickoff' && this.waitingKickoff) {
      this.waitingKickoff = false;
      if (now < this.until && !paused && !this.pausedByCard) {
        this.pausedByCard = true;
        out.push({ kind: 'pause' });
      }
    }
  }

  /** Once a frame, after the events. */
  tick(now: number, paused: boolean, out: GoalCardAction[]): void {
    if (this.until === 0) return;
    if (!this.leaving && now >= this.until - LEAVE_MS) {
      this.leaving = true;
      out.push({ kind: 'leave' });
    }
    if (now >= this.until) {
      this.until = 0;
      this.waitingKickoff = false;
      out.push({ kind: 'hide' });
      this.release(paused, out);
    }
  }

  /** The view is going away: give back a pause the card took. */
  release(paused: boolean, out: GoalCardAction[]): void {
    if (this.pausedByCard && paused) out.push({ kind: 'resume' });
    this.pausedByCard = false;
  }
}
