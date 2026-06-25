// Scoring / z-score tests (spec 03 §6.3). DOM-free.

import { describe, it, expect } from "vitest";
import {
  zScore,
  normalizeZ,
  suspicionMagnitude,
  scoreStroke,
  clusterStats,
  FEATURE_FLOORS,
} from "./scoring.ts";
import type { DetectorConfig, Stroke } from "./types.ts";
import { DETECTOR_CONFIG } from "../difficulty/index.ts";
import { makeMotifCluster, makeForgery } from "./__fixtures__/strokes.ts";

const cluster = (seed = 1) => makeMotifCluster({ motif: "wave", count: 6, seed });

function clusterMeanHumanness(c: Stroke[], cfg: DetectorConfig): number {
  return c.reduce((acc, s) => acc + scoreStroke(s, c, cfg).humanness, 0) / c.length;
}

describe("zScore std→0 guard", () => {
  it("never returns Infinity when std is 0 (uses the floor)", () => {
    const z = zScore(0.02, 0.0, 0, FEATURE_FLOORS.jitter);
    expect(Number.isFinite(z)).toBe(true);
    expect(z).toBeGreaterThan(0);
  });
  it("returns NaN for a NaN value (unavailable feature)", () => {
    expect(Number.isNaN(zScore(NaN, 0, 1))).toBe(true);
  });
});

describe("normalizeZ maps a non-negative magnitude", () => {
  it("0 → 0, negative clamps to 0, rises monotonically", () => {
    expect(normalizeZ(0)).toBe(0);
    expect(normalizeZ(-10)).toBe(0);
    expect(normalizeZ(20)).toBeGreaterThan(0.99);
    expect(normalizeZ(2)).toBeGreaterThan(normalizeZ(1));
    expect(normalizeZ(2)).toBeLessThan(1);
  });
});

describe("suspicionMagnitude (sidedness)", () => {
  it("motor features are two-sided: too-clean (z<0) is as suspicious as too-noisy", () => {
    expect(suspicionMagnitude("jitter", -3)).toBe(3);
    expect(suspicionMagnitude("jitter", 3)).toBe(3);
    expect(suspicionMagnitude("speedCV", -2)).toBe(2);
  });
  it("shape is one-sided: below the mean form is never suspicious", () => {
    expect(suspicionMagnitude("shape", -3)).toBe(0);
    expect(suspicionMagnitude("shape", 3)).toBe(3);
  });
});

describe("scoreStroke", () => {
  it("humanness is always in [0,1]", () => {
    const c = cluster();
    for (const s of [...c, makeForgery({ motif: "wave", fidelity: 0, seed: 99 })]) {
      const { humanness } = scoreStroke(s, c, DETECTOR_CONFIG);
      expect(humanness).toBeGreaterThanOrEqual(0);
      expect(humanness).toBeLessThanOrEqual(1);
    }
  });

  it("a naive (too-shaky) forgery scores above the cluster mean", () => {
    const c = cluster(5);
    const naive = makeForgery({ motif: "wave", fidelity: 0, seed: 5 });
    expect(scoreStroke(naive, c, DETECTOR_CONFIG).humanness).toBeGreaterThan(
      clusterMeanHumanness(c, DETECTOR_CONFIG),
    );
  });

  it("a TOO-CLEAN stroke also scores above the cluster mean (two-sided motor)", () => {
    const c = cluster(8);
    // Right shape, but almost no tremor / dead-even pace — an outlier BELOW the machine.
    const tooClean = makeForgery({
      motif: "wave",
      seed: 8,
      signature: { tremorAmp: 0.1, shapeVar: 0.4, speedVar: 0.02 },
    });
    expect(scoreStroke(tooClean, c, DETECTOR_CONFIG).humanness).toBeGreaterThan(
      clusterMeanHumanness(c, DETECTOR_CONFIG),
    );
  });

  it("drops NaN (unavailable) features and renormalizes weights to sum 1", () => {
    const c = cluster();
    const jitterOnly: DetectorConfig = {
      activeFeatures: ["jitter"],
      weights: { jitter: 1 },
      threshold: 0.6,
    };
    const withPressure: DetectorConfig = {
      activeFeatures: ["jitter", "pressure"],
      weights: { jitter: 0.5, pressure: 0.5 },
      threshold: 0.6,
    };
    const human = makeForgery({ motif: "wave", fidelity: 0, seed: 3 });
    expect(scoreStroke(human, c, withPressure).humanness).toBeCloseTo(
      scoreStroke(human, c, jitterOnly).humanness,
      10,
    );
  });
});

describe("clusterStats", () => {
  it("ignores NaN feature values (e.g. pressure on mouse strokes)", () => {
    const { mean, std } = clusterStats(cluster(), "pressure");
    expect(mean).toBe(0);
    expect(std).toBe(0);
  });
  it("shape stats are computed against the cluster's own mean form (std > 0)", () => {
    const { std } = clusterStats(cluster(), "shape");
    expect(std).toBeGreaterThan(0);
  });
});
