// Day index & seed (spec 05, CLAUDE.md §8). UTC-based so the "day" aligns
// globally. Date.now() is confined here; all generation takes dayIndex/rng.

import { rngFromKey } from "./prng.ts";

const MS_PER_DAY = 86_400_000;

/** UTC day index. `now` is injectable for tests (defaults to the real clock). */
export function utcDayIndex(now: number = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

/**
 * Stable per-day key. NEVER localized (spec 09) — the daily scene must be
 * identical worldwide regardless of UI language.
 */
export function seedKey(dayIndex: number): string {
  return `indetectable-${dayIndex}`;
}

/** The rng for a given day. */
export function dailyRng(dayIndex: number): () => number {
  return rngFromKey(seedKey(dayIndex));
}

/** Ms until the next UTC midnight (for the daily-lock countdown, spec 08). */
export function msUntilNextUtcDay(now: number = Date.now()): number {
  return MS_PER_DAY - (now % MS_PER_DAY);
}
