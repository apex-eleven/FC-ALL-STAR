import { PERSONAS, STALE_MS } from './constants';
import type { BotDayCounters, BotProfile } from './types';

/**
 * When a bot plays. Pure: `now` and `rng` come in, dates go out.
 *
 * A bot's day is a handful of sessions inside its own online window. Inside a session
 * actions are tens of seconds apart; between sessions it is gone for hours. That rhythm
 * — and the jitter on every number — is what keeps a dozen bots from all ranking up
 * on the same minute.
 */

export function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function randBetween(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar day, the unit daily caps and income are counted in. */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function emptyDay(now: Date): BotDayCounters {
  return { day: dayKey(now), packs: 0, matches: 0, rankups: 0, cups: 0, chats: 0, paid: false };
}

/** Today's counters, starting fresh when the day has turned. */
export function currentDay(saved: BotDayCounters | undefined, now: Date): BotDayCounters {
  return saved && saved.day === dayKey(now) ? saved : emptyDay(now);
}

/** Hours since local midnight, fractional. */
function hourOf(now: Date): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

/** Inside [from, to), where `to` may run past 24 to cross midnight. */
export function isOnline(profile: Pick<BotProfile, 'activeFrom' | 'activeTo'>, now: Date): boolean {
  const hour = hourOf(now);
  const { activeFrom: from, activeTo: to } = profile;
  return (hour >= from && hour < to) || (hour + 24 >= from && hour + 24 < to);
}

/** The next moment the window opens, strictly after `now` when it is closed. */
export function nextWindowOpen(profile: Pick<BotProfile, 'activeFrom' | 'activeTo'>, now: Date): Date {
  const open = new Date(now);
  open.setHours(Math.floor(profile.activeFrom), Math.round((profile.activeFrom % 1) * 60), 0, 0);
  if (open.getTime() <= now.getTime()) open.setDate(open.getDate() + 1);
  return open;
}

/** A fresh bot's online window: the persona's, shifted and stretched a little. */
export function rollWindow(persona: BotProfile['persona'], rng: () => number): { from: number; to: number } {
  const [from, to] = PERSONAS[persona].hours;
  const start = Math.max(0, from + randBetween(-2, 2, rng));
  const end = Math.min(start + 23, to + randBetween(-1.5, 1.5, rng));
  return { from: Math.round(start * 4) / 4, to: Math.round(Math.max(start + 2, end) * 4) / 4 };
}

/** The next action inside a session. */
export function nextInSession(profile: BotProfile, now: Date, rng: () => number): Date {
  const [min, max] = PERSONAS[profile.persona].actionGap;
  return new Date(now.getTime() + randBetween(min, max, rng) * 1000);
}

/**
 * Where the next session starts, once this one is over.
 *
 * The online window divided by sessions-per-day gives the average gap; each gap is
 * then stretched or shrunk by up to half. A start that lands after the window
 * closes moves to the next opening, a little late, the way people log on.
 */
export function nextSession(profile: BotProfile, now: Date, rng: () => number): Date {
  const spec = PERSONAS[profile.persona];
  const hours = Math.max(1, profile.activeTo - profile.activeFrom);
  const perDay = randInt(spec.sessionsPerDay[0], spec.sessionsPerDay[1], rng);
  const gapMs = (hours / Math.max(1, perDay)) * 3_600_000 * randBetween(0.5, 1.5, rng);
  const candidate = new Date(now.getTime() + Math.max(10 * 60_000, gapMs));
  if (isOnline(profile, candidate)) return candidate;
  const open = nextWindowOpen(profile, now);
  return new Date(open.getTime() + randBetween(0, 75, rng) * 60_000);
}

/** Where a bot that is due should pick up — a long-overdue one is spread out first. */
export function isStale(profile: BotProfile, now: Date): boolean {
  return now.getTime() - Date.parse(profile.nextActionAt) > STALE_MS;
}

/** A soon, spread-out restart for bots the runner missed while nobody had it open. */
export function restartSoon(now: Date, rng: () => number): Date {
  return new Date(now.getTime() + randBetween(0.5, 20, rng) * 60_000);
}
