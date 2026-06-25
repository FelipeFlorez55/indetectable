# 06 — Persistence & Streak

> Expands CLAUDE.md §9. Owns: `src/store/`. A thin wrapper over `localStorage`
> plus the streak state machine. No accounts, no sync, no backend (CLAUDE.md §2).
> The serialization/streak logic is pure and unit-testable without the DOM.

## Goal

Persist streak, history, and stats to `localStorage`; enforce the one-attempt-
per-day Wordle lock; expose an optional export/import string for manual backup.

## State (CLAUDE.md §9)

```ts
export type HistoryEntry = { day: number; score: number; caught: boolean };

export type GameState = {
  lastPlayedDay: number;   // UTC dayIndex of the last play (-1 = never)
  currentStreak: number;
  maxStreak: number;
  bestScore: number;
  history: HistoryEntry[]; // capped (e.g. last 60 days) to bound storage
  totalPlayed: number;
};

export const STORAGE_KEY = "indetectable:v1";
export const SCHEMA_VERSION = 1; // bump → migrate on read
```

## Pure logic (no DOM)

```ts
/** Apply a finished round. Pure: returns the next state, never mutates. */
export function applyResult(
  state: GameState,
  todayIndex: number,
  result: { score: number; caught: boolean },
): GameState;

/** Has today's attempt already been used? */
export function hasPlayedToday(state: GameState, todayIndex: number): boolean;

/** Streak as it should display today, accounting for gaps since last play. */
export function effectiveStreak(state: GameState, todayIndex: number): number;
```

### Streak rules (CLAUDE.md §9)

- `lastPlayedDay === todayIndex` → already played; **no new attempt** (show result).
- `lastPlayedDay === todayIndex − 1` and not caught → streak **continues** (`+1`).
- Gap (`lastPlayedDay < todayIndex − 1`) → streak **resets** to this round's value.
- `caught === true` → streak **breaks** (→ 0) even though the day counts as played.
- `bestScore`, `maxStreak`, `totalPlayed`, `history` updated accordingly.

> `effectiveStreak` exists because a stored `currentStreak` can be stale: if the
> player skipped yesterday, today's display should already read 0 before they
> play. UI reads `effectiveStreak`, not the raw field.

## Storage wrapper (thin DOM edge)

```ts
/** Read + validate + migrate. Returns a fresh default on absent/corrupt data. */
export function loadState(storage?: Storage): GameState;

/** Serialize + persist. No-op-safe if storage is unavailable (private mode). */
export function saveState(state: GameState, storage?: Storage): void;

/** Migrate an older-schema blob to the current shape. */
export function migrate(raw: unknown): GameState;
```

- `storage` is injectable → tests pass a fake `Storage`, no DOM needed.
- Corrupt JSON / failed validation / `QuotaExceededError` / disabled storage are
  caught; the game still runs (in-memory) and never throws into the UI.

## Export / import (CLAUDE.md §9 "optional backup")

```ts
/** State → compact, copyable, URL-safe string (base64 of JSON + version + checksum). */
export function exportState(state: GameState): string;

/** Copyable string → state. Throws a typed error on bad checksum/format. */
export function importState(blob: string): GameState;
```

- "Poor man's sync": user copies the string on one device, pastes on another.
- Checksum guards against truncated paste; version enables migration.

## Zustand store

```ts
type GameStore = GameState & {
  hydrated: boolean;
  loadFromStorage: () => void;                       // hydrate on app start
  record: (todayIndex: number, r: { score: number; caught: boolean }) => void; // applyResult + save
  importFrom: (blob: string) => { ok: boolean; error?: string };
  exportTo: () => string;
};
```

The store calls the pure functions then persists via the wrapper. The pure layer
is where all tests live.

## Acceptance criteria

- [ ] `applyResult`, `hasPlayedToday`, `effectiveStreak` are pure and fully
      unit-tested across: first play, consecutive day, skipped day, caught day,
      replay-same-day (no-op).
- [ ] One-attempt lock holds: a second `record` on the same `todayIndex` does not
      change streak/score/totalPlayed.
- [ ] `caught` breaks the streak but still increments `totalPlayed` and appends
      history.
- [ ] `history` is capped; oldest entries drop first.
- [ ] `loadState` returns valid defaults on absent/corrupt/old-schema data and
      never throws.
- [ ] Disabled/full `localStorage` degrades gracefully (game runs in-memory).
- [ ] `exportState`/`importState` round-trip is lossless; a corrupted blob is
      rejected with a typed error.
- [ ] All pure tests run in `environment: 'node'` with an injected fake storage.

## Out of scope

- IndexedDB (CLAUDE.md §9: not in v1). No server sync.
