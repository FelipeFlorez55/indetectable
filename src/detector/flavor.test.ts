// F2 — verdictTone tests. Pure, DOM-free.

import { describe, it, expect } from "vitest";
import { verdictTone } from "./flavor.ts";
import type { StrokeScore, Verdict } from "./types.ts";

const score = (humanness: number): StrokeScore => ({ humanness, features: {} as never, z: {} });

// Build a verdict whose LAST stroke is the human with the given humanness.
function verdict(p: Partial<Verdict> & { humanH: number }): Verdict {
  return {
    guessIndex: 0,
    confidence: p.confidence ?? 0,
    caughtHuman: p.caughtHuman ?? false,
    scores: [score(0.0), score(p.humanH)],
    playerWon: p.playerWon ?? true,
    playerScore: 0,
    invisibility: 0,
  };
}

const T = 0.5;

describe("verdictTone", () => {
  it("won.decoy takes priority over humanness bands", () => {
    const v = verdict({ humanH: 0.01, playerWon: true, caughtHuman: false });
    expect(verdictTone(v, T)).toBe("won.decoy");
  });

  it("won bands by margin under the threshold", () => {
    expect(verdictTone(verdict({ humanH: 0.02, playerWon: true, caughtHuman: true }), T)).toBe("won.flawless");
    expect(verdictTone(verdict({ humanH: 0.47, playerWon: true, caughtHuman: true }), T)).toBe("won.hair");
    expect(verdictTone(verdict({ humanH: 0.3, playerWon: true, caughtHuman: true }), T)).toBe("won.clean");
  });

  it("caught bands by how far confidence cleared the threshold", () => {
    const caught = (confidence: number) =>
      verdict({ humanH: 0.9, playerWon: false, caughtHuman: true, confidence });
    expect(verdictTone(caught(0.9), T)).toBe("caught.instant"); // margin 0.40
    expect(verdictTone(caught(0.62), T)).toBe("caught.clear"); // margin 0.12
    expect(verdictTone(caught(0.53), T)).toBe("caught.close"); // margin 0.03
  });

  it("is deterministic", () => {
    const v = verdict({ humanH: 0.3, playerWon: true, caughtHuman: true });
    expect(verdictTone(v, T)).toBe(verdictTone(v, T));
  });
});
