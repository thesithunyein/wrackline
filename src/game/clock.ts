/**
 * Myanmar time, used for every daily reset in the game.
 *
 * The jam and most of its players live on UTC+06:30, so a "day" has to turn over
 * there rather than wherever the device happens to be. A player who travels does
 * not get two daily tides by flying west.
 */

export const MMT_OFFSET_MINUTES = 6 * 60 + 30;

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The MMT wall-clock date for an instant, expressed as a UTC-based Date. */
export function mmtDate(now: number = Date.now()): Date {
  return new Date(now + MMT_OFFSET_MINUTES * 60_000);
}

/** `YYYY-MM-DD` on the Myanmar calendar; the key every daily reset is scoped to. */
export function mmtDayKey(now: number = Date.now()): string {
  const d = mmtDate(now);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days since the epoch for a day key, so keys can be compared and ordered. */
export function dayIndex(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** Days from one key to another: 1 means the second day follows the first. */
export function daysBetweenKeys(from: string, to: string): number {
  return dayIndex(to) - dayIndex(from);
}

/** Milliseconds until the next MMT midnight, for "resets in 6h" style copy. */
export function msUntilNextMmtDay(now: number = Date.now()): number {
  const shifted = now + MMT_OFFSET_MINUTES * 60_000;
  return DAY_MS - (shifted % DAY_MS);
}
