// End-to-end verdict tests (spec 03 §6.4). DOM-free.
// The detector config is CONSTANT across tiers (§7); only the motif changes.

import { describe, it, expect } from "vitest";
import { AlgorithmicDetector } from "./detector.ts";
import type { Scene } from "./types.ts";
import { toDetectorConfig } from "../difficulty/index.ts";
import { makeMotifCluster, makeForgery, type ForgeryOptions } from "./__fixtures__/strokes.ts";

const detector = new AlgorithmicDetector();
const cfg = toDetectorConfig();

function scene(motif: ForgeryOptions["motif"], human: Scene["humanStroke"], seed = 1): Scene {
  return { procedural: makeMotifCluster({ motif, count: 6, seed }), humanStroke: human };
}

describe("no DOM", () => {
  it("runs without a browser environment", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });
});

describe("motion axis", () => {
  it("catches a naive forgery (right shape, human-shaky motion)", () => {
    let caught = 0;
    for (let s = 0; s < 20; s++) {
      const naive = makeForgery({ motif: "wave", fidelity: 0, seed: s });
      const v = detector.evaluate(scene("wave", naive, s), cfg);
      if (!v.playerWon) caught++;
    }
    // The strong majority of naive humans are caught.
    expect(caught).toBeGreaterThanOrEqual(15);
  });

  it("lets a high-fidelity forgery (matched signature) through", () => {
    let won = 0;
    for (let s = 0; s < 20; s++) {
      const good = makeForgery({ motif: "wave", fidelity: 1, seed: s });
      const v = detector.evaluate(scene("wave", good, s), cfg);
      if (v.playerWon) won++;
    }
    expect(won).toBeGreaterThanOrEqual(15);
  });
});

describe("shape axis (the form gate)", () => {
  it("catches machine-perfect motion drawn on the WRONG motif", () => {
    let caught = 0;
    for (let s = 0; s < 20; s++) {
      const wrongShape = makeForgery({ motif: "spiral", fidelity: 1, seed: s });
      const v = detector.evaluate(scene("wave", wrongShape, s), cfg);
      if (!v.playerWon) caught++;
    }
    expect(caught).toBeGreaterThanOrEqual(15);
  });
});

describe("invisibility score (progress even on a loss)", () => {
  it("is always in [0,100]; a wrong-shape loss still scores > 0", () => {
    let lossWithCredit = 0;
    for (let s = 0; s < 20; s++) {
      const wrong = makeForgery({ motif: "spiral", fidelity: 1, seed: s });
      const v = detector.evaluate(scene("wave", wrong, s), cfg);
      expect(v.invisibility).toBeGreaterThanOrEqual(0);
      expect(v.invisibility).toBeLessThanOrEqual(100);
      if (!v.playerWon && v.invisibility > 0) lossWithCredit++;
    }
    // A loss is no longer a flat 0 — most caught attempts still register progress.
    expect(lossWithCredit).toBeGreaterThanOrEqual(15);
  });

  it("a high-fidelity forgery lands above the 50% catch line", () => {
    let above = 0;
    for (let s = 0; s < 20; s++) {
      const good = makeForgery({ motif: "wave", fidelity: 1, seed: s });
      if (detector.evaluate(scene("wave", good, s), cfg).invisibility > 50) above++;
    }
    expect(above).toBeGreaterThanOrEqual(16);
  });
});

describe("determinism", () => {
  it("same scene + config → identical verdict across runs", () => {
    const human = makeForgery({ motif: "w", fidelity: 0.5, seed: 8 });
    const s = scene("w", human, 8);
    const a = detector.evaluate(s, cfg);
    const b = detector.evaluate(s, cfg);
    expect(a).toEqual(b);
  });
});

describe("verdict invariants", () => {
  it("guessIndex is valid and confidence in [0,1]", () => {
    const human = makeForgery({ motif: "wave", fidelity: 0.4, seed: 11 });
    const s = scene("wave", human, 11);
    const v = detector.evaluate(s, cfg);
    expect(v.guessIndex).toBeGreaterThanOrEqual(0);
    expect(v.guessIndex).toBeLessThan(s.procedural.length + 1);
    expect(v.confidence).toBeGreaterThanOrEqual(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
    expect(v.scores).toHaveLength(s.procedural.length + 1);
  });
});
