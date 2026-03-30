import { SeededRNG } from './seededRandom';

/**
 * Generate a deterministic seed from a date string (YYYY-MM-DD).
 * Uses a simple hash so the same date always produces the same seed.
 */
function hashDateString(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // hash * 31 + char (32-bit)
  }
  return Math.abs(hash);
}

/** Returns today's date in YYYY-MM-DD format (local time) */
export function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns the daily seed derived from today's date */
export function getDailySeed(): number {
  return hashDateString(getTodayKey());
}

/** Returns the Daily Run seed number for a given date key */
export function getSeedForDate(dateKey: string): number {
  return hashDateString(dateKey);
}

/** Create a SeededRNG seeded with today's daily seed */
export function createDailyRNG(): SeededRNG {
  return new SeededRNG(getDailySeed());
}

/** Compute how many milliseconds remain until midnight */
export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Check if a stored date key is still "today" */
export function isToday(dateKey: string): boolean {
  return dateKey === getTodayKey();
}
