import { create } from "zustand";
import {
  applyResult,
  effectiveStreak,
  exportState,
  hasPlayedToday,
  importState,
  initialGameState,
  loadState,
  saveState,
  type GameState,
} from "./persistence.ts";

// Zustand store over the pure persistence layer (spec 06). The store calls the
// pure functions then persists via the wrapper; all logic/tests live in the
// pure layer (persistence.ts).

type GameStore = GameState & {
  hydrated: boolean;
  loadFromStorage: () => void;
  record: (todayIndex: number, r: { score: number; caught: boolean }) => void;
  hasPlayedToday: (todayIndex: number) => boolean;
  effectiveStreak: (todayIndex: number) => number;
  importFrom: (blob: string) => { ok: boolean; error?: string };
  exportTo: () => string;
  reset: () => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialGameState,
  hydrated: false,

  loadFromStorage: () => set({ ...loadState(), hydrated: true }),

  record: (todayIndex, r) => {
    const next = applyResult(get(), todayIndex, r);
    saveState(next);
    set(next);
  },

  hasPlayedToday: (todayIndex) => hasPlayedToday(get(), todayIndex),
  effectiveStreak: (todayIndex) => effectiveStreak(get(), todayIndex),

  importFrom: (blob) => {
    try {
      const next = importState(blob);
      saveState(next);
      set(next);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Import failed" };
    }
  },

  exportTo: () => exportState(get()),

  reset: () => {
    saveState(initialGameState);
    set({ ...initialGameState });
  },
}));
