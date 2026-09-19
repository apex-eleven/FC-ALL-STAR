/**
 * "What day is it" when a day does not start at midnight.
 *
 * Every period in this game turns over at an admin-set hour rather than at 00:00 —
 * shop limits, mission counts, daily login, the cups. Someone playing at 02:00 is
 * still in the previous day, which is what "รีเซ็ต 06:00" has to mean, or the
 * entries and claims they have left disappear while they are using them.
 *
 * These two functions used to live in the league's `season.ts` and were imported
 * from there by the shop, which meant the shop's daily limits were one deleted
 * folder away from breaking. They belong to nothing in particular, so they live here.
 */

/** The most recent `resetHour` boundary at or before `now`, in local time. */
export function dayStartAt(now: Date, resetHour: number): Date {
  const start = new Date(now);
  start.setHours(resetHour, 0, 0, 0);
  // Before today's boundary means the moment still belongs to yesterday.
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

/** YYYY-MM-DD of that boundary — a key two moments in the same day agree on. */
export function dayKeyAt(now: Date, resetHour: number): string {
  const start = dayStartAt(now, resetHour);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}
