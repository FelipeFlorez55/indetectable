// F3 — humanInsight tests. Pure, DOM-free.

import { describe, it, expect } from "vitest";
import { humanInsight, suspectOrder, accusedKind } from "./insight.ts";
import type { DetectorConfig, FeatureVector, StrokeScore, Verdict } from "./types.ts";

const FV = (over: Partial<FeatureVector>): FeatureVector => ({
  shape: NaN, jitter: 0, speedCV: 0, speedPauses: 0, curvature: 0, pressure: NaN, overshoot: NaN, ...over,
});

function verdict(humanScore: StrokeScore, clusterMean?: Verdict["clusterMean"]): Verdict {
  return {
    guessIndex: 1, confidence: 0.7, caughtHuman: true,
    scores: [{ humanness: 0, features: FV({}), z: {} }, humanScore],
    playerWon: false, playerScore: 0, invisibility: 0, clusterMean,
  };
}

const cfg: DetectorConfig = {
  activeFeatures: ["jitter", "speedCV", "speedPauses"],
  weights: { jitter: 0.6, speedCV: 0.25, speedPauses: 0.15 },
  threshold: 0.5,
};

describe("humanInsight", () => {
  it("picks the feature with the largest weighted contribution", () => {
    // speedCV has a huge z; jitter small. Even at lower weight, speedCV dominates.
    const hs: StrokeScore = {
      humanness: 0.6,
      features: FV({ jitter: 0.003, speedCV: 0.9 }),
      z: { jitter: 0.5, speedCV: 6, speedPauses: 0.2 },
    };
    expect(humanInsight(verdict(hs), cfg)?.feature).toBe("speedCV");
  });

  it("computes ratio vs cluster mean, NaN-safe when the mean is ~0", () => {
    const hs: StrokeScore = {
      humanness: 0.5, features: FV({ jitter: 0.006 }), z: { jitter: 4 },
    };
    expect(humanInsight(verdict(hs, { jitter: 0.002 }), cfg)?.ratio).toBeCloseTo(3);
    expect(Number.isNaN(humanInsight(verdict(hs, { jitter: 0 }), cfg)!.ratio)).toBe(true);
  });

  it("a too-clean motor feature (z<0) IS a tell now (two-sided)", () => {
    // Below the machine on jitter — under the imitation model that's an outlier.
    const hs: StrokeScore = {
      humanness: 0.3, features: FV({ jitter: 0.0005 }), z: { jitter: -4, speedCV: 0, speedPauses: 0 },
    };
    expect(humanInsight(verdict(hs), cfg)?.feature).toBe("jitter");
  });

  it("returns null when the human matched the machine on every feature (z≈0)", () => {
    const hs: StrokeScore = {
      humanness: 0, features: FV({}), z: { jitter: 0, speedCV: 0, speedPauses: 0 },
    };
    expect(humanInsight(verdict(hs), cfg)).toBeNull();
  });
});

describe("accusedKind (F4) — colour follows the OUTCOME, not just the index", () => {
  const v = (playerWon: boolean, caughtHuman: boolean): Verdict => ({
    guessIndex: caughtHuman ? 1 : 0, confidence: 0.5, caughtHuman,
    scores: [{ humanness: 0, features: FV({}), z: {} }, { humanness: 0.4, features: FV({}), z: {} }],
    playerWon, playerScore: 0, invisibility: 0,
  });
  it("lost → caught (red)", () => expect(accusedKind(v(false, true))).toBe("caught"));
  it("won by framing a decoy → framed (emerald)", () => expect(accusedKind(v(true, false))).toBe("framed"));
  it("won but its top suspect was you → suspected (amber, never red)", () =>
    expect(accusedKind(v(true, true))).toBe("suspected"));
});

describe("suspectOrder (F4)", () => {
  it("orders stroke indices by humanness, descending, ties by index", () => {
    const s = (h: number): StrokeScore => ({ humanness: h, features: FV({}), z: {} });
    const v = verdict(s(0.2)); // base; override scores below
    v.scores = [s(0.1), s(0.9), s(0.5), s(0.1)];
    expect(suspectOrder(v)).toEqual([1, 2, 0, 3]);
  });
});
