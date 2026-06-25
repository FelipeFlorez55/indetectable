// Persistence & streak (spec 06, CLAUDE.md §9). Pure logic + a thin localStorage
// wrapper. No accounts, no sync, no backend. The pure functions are DOM-free.

import { xmur3 } from "../scene/prng.ts";

export type HistoryEntry = { day: number; score: number; caught: boolean };

export type GameState = {
  lastPlayedDay: number; // UTC dayIndex of the last play (-1 = never)
  currentStreak: number;
  maxStreak: number;
  bestScore: number;
  history: HistoryEntry[];
  totalPlayed: number;
};

export const STORAGE_KEY = "indetectable:v1";
export const SCHEMA_VERSION = 1;
export const HISTORY_CAP = 60;

export const initialGameState: GameState = {
  lastPlayedDay: -1,
  currentStreak: 0,
  maxStreak: 0,
  bestScore: 0,
  history: [],
  totalPlayed: 0,
};

/** Has today's attempt already been used? */
export function hasPlayedToday(state: GameState, todayIndex: number): boolean {
  return state.lastPlayedDay === todayIndex;
}

/**
 * Streak as it should display today, accounting for gaps since last play.
 * Played today or continuing yesterday → currentStreak; any gap → 0.
 */
export function effectiveStreak(state: GameState, todayIndex: number): number {
  if (state.lastPlayedDay === todayIndex) return state.currentStreak;
  if (state.lastPlayedDay === todayIndex - 1) return state.currentStreak;
  return 0;
}

/**
 * Apply a finished round. Pure: returns the next state, never mutates.
 * A second call for the same day is a no-op (one-attempt lock, §9).
 */
export function applyResult(
  state: GameState,
  todayIndex: number,
  result: { score: number; caught: boolean },
): GameState {
  if (hasPlayedToday(state, todayIndex)) return state; // already played → locked

  const base = effectiveStreak(state, todayIndex); // gap-adjusted streak before today
  const currentStreak = result.caught ? 0 : base + 1;

  const history = [...state.history, { day: todayIndex, score: result.score, caught: result.caught }];
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);

  return {
    lastPlayedDay: todayIndex,
    currentStreak,
    maxStreak: Math.max(state.maxStreak, currentStreak),
    bestScore: Math.max(state.bestScore, result.score),
    history,
    totalPlayed: state.totalPlayed + 1,
  };
}

// ── Storage wrapper (thin DOM edge) ──────────────────────────────────────────

function isHistoryEntry(x: unknown): x is HistoryEntry {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as HistoryEntry).day === "number" &&
    typeof (x as HistoryEntry).score === "number" &&
    typeof (x as HistoryEntry).caught === "boolean"
  );
}

/** Migrate an older-schema / unknown blob to the current shape. */
export function migrate(raw: unknown): GameState {
  if (typeof raw !== "object" || raw === null) return { ...initialGameState };
  const obj = raw as Record<string, unknown>;
  const state = (obj.state ?? obj) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const history = Array.isArray(state.history) ? state.history.filter(isHistoryEntry) : [];
  return {
    lastPlayedDay: num(state.lastPlayedDay, -1),
    currentStreak: num(state.currentStreak, 0),
    maxStreak: num(state.maxStreak, 0),
    bestScore: num(state.bestScore, 0),
    history: history.slice(-HISTORY_CAP),
    totalPlayed: num(state.totalPlayed, 0),
  };
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read + validate + migrate. Returns a fresh default on absent/corrupt data. */
export function loadState(storage?: Storage): GameState {
  const s = getStorage(storage);
  if (!s) return { ...initialGameState };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { ...initialGameState };
    return migrate(JSON.parse(raw));
  } catch {
    return { ...initialGameState };
  }
}

/** Serialize + persist. No-op-safe if storage is unavailable (private mode/quota). */
export function saveState(state: GameState, storage?: Storage): void {
  const s = getStorage(storage);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state }));
  } catch {
    /* quota exceeded / disabled — game continues in-memory */
  }
}

// ── Export / import (poor man's sync, §9) ────────────────────────────────────

function checksum(json: string): string {
  return xmur3(json)().toString(36);
}

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromUrlSafe(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
}

export class ImportError extends Error {}

/** State → compact, copyable, URL-safe string (version + checksum + payload). */
export function exportState(state: GameState): string {
  const json = JSON.stringify(state);
  const payload = JSON.stringify({ v: SCHEMA_VERSION, c: checksum(json), s: state });
  return toUrlSafe(btoa(payload));
}

/** Copyable string → state. Throws ImportError on bad checksum/format. */
export function importState(blob: string): GameState {
  let parsed: { v?: number; c?: string; s?: unknown };
  try {
    parsed = JSON.parse(atob(fromUrlSafe(blob.trim())));
  } catch {
    throw new ImportError("Malformed backup string");
  }
  if (typeof parsed.c !== "string" || parsed.s === undefined) {
    throw new ImportError("Invalid backup payload");
  }
  if (checksum(JSON.stringify(parsed.s)) !== parsed.c) {
    throw new ImportError("Checksum mismatch — the string was truncated or edited");
  }
  return migrate(parsed.s);
}
