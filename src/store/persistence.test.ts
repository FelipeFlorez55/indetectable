// Persistence / streak tests (spec 06 §acceptance). DOM-free with a fake Storage.

import { describe, it, expect } from "vitest";
import {
  applyResult,
  effectiveStreak,
  exportState,
  hasPlayedToday,
  importState,
  initialGameState,
  loadState,
  saveState,
  migrate,
  ImportError,
  HISTORY_CAP,
  STORAGE_KEY,
  type GameState,
} from "./persistence.ts";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const win = { score: 80, caught: false };
const loss = { score: 0, caught: true };

describe("applyResult", () => {
  it("first play (win) starts a streak of 1", () => {
    const s = applyResult(initialGameState, 100, win);
    expect(s.currentStreak).toBe(1);
    expect(s.totalPlayed).toBe(1);
    expect(s.lastPlayedDay).toBe(100);
    expect(s.bestScore).toBe(80);
  });

  it("consecutive winning days grow the streak", () => {
    let s = applyResult(initialGameState, 100, win);
    s = applyResult(s, 101, win);
    s = applyResult(s, 102, win);
    expect(s.currentStreak).toBe(3);
    expect(s.maxStreak).toBe(3);
  });

  it("a gap resets the streak to 1 on the next win", () => {
    let s = applyResult(initialGameState, 100, win);
    s = applyResult(s, 101, win); // streak 2
    s = applyResult(s, 105, win); // gap → reset to 1
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });

  it("being caught breaks the streak but still counts as played", () => {
    let s = applyResult(initialGameState, 100, win); // streak 1
    s = applyResult(s, 101, loss); // caught
    expect(s.currentStreak).toBe(0);
    expect(s.totalPlayed).toBe(2);
    expect(s.history.at(-1)).toEqual({ day: 101, score: 0, caught: true });
  });

  it("one-attempt lock: replaying the same day is a no-op", () => {
    const first = applyResult(initialGameState, 100, win);
    const second = applyResult(first, 100, { score: 999, caught: false });
    expect(second).toBe(first); // unchanged reference
  });

  it("history is capped, oldest dropped first", () => {
    let s: GameState = initialGameState;
    for (let d = 0; d < HISTORY_CAP + 10; d++) s = applyResult(s, d, win);
    expect(s.history).toHaveLength(HISTORY_CAP);
    expect(s.history[0].day).toBe(10);
  });
});

describe("hasPlayedToday / effectiveStreak", () => {
  it("hasPlayedToday reflects the last played day", () => {
    const s = applyResult(initialGameState, 100, win);
    expect(hasPlayedToday(s, 100)).toBe(true);
    expect(hasPlayedToday(s, 101)).toBe(false);
  });
  it("effectiveStreak is gap-adjusted before today's play", () => {
    const s = applyResult(initialGameState, 100, win); // currentStreak 1
    expect(effectiveStreak(s, 100)).toBe(1); // played today
    expect(effectiveStreak(s, 101)).toBe(1); // continues (yesterday)
    expect(effectiveStreak(s, 103)).toBe(0); // gap → already 0 before playing
  });
});

describe("loadState / saveState", () => {
  it("round-trips through a fake storage", () => {
    const storage = fakeStorage();
    const s = applyResult(initialGameState, 100, win);
    saveState(s, storage);
    expect(loadState(storage)).toEqual(s);
  });
  it("returns defaults on absent or corrupt data", () => {
    const storage = fakeStorage();
    expect(loadState(storage)).toEqual(initialGameState);
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadState(storage)).toEqual(initialGameState);
  });
  it("degrades gracefully when storage throws (quota/disabled)", () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("disabled");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveState(applyResult(initialGameState, 1, win), throwing)).not.toThrow();
    expect(loadState(throwing)).toEqual(initialGameState);
  });
});

describe("migrate", () => {
  it("coerces a bare state object and a wrapped one", () => {
    const bare = { lastPlayedDay: 5, currentStreak: 2, maxStreak: 2, bestScore: 9, history: [], totalPlayed: 2 };
    expect(migrate(bare)).toEqual(bare);
    expect(migrate({ version: 1, state: bare })).toEqual(bare);
  });
  it("fills defaults for garbage", () => {
    expect(migrate(42)).toEqual(initialGameState);
    expect(migrate({ history: "nope" })).toEqual(initialGameState);
  });
});

describe("export / import", () => {
  it("round-trips losslessly", () => {
    const s = applyResult(applyResult(initialGameState, 100, win), 101, win);
    expect(importState(exportState(s))).toEqual(s);
  });
  it("rejects a corrupted blob with ImportError", () => {
    const blob = exportState(applyResult(initialGameState, 100, win));
    const corrupted = blob.slice(0, -3) + "xyz";
    expect(() => importState(corrupted)).toThrow(ImportError);
  });
  it("rejects total garbage", () => {
    expect(() => importState("!!!not-base64!!!")).toThrow(ImportError);
  });
});
