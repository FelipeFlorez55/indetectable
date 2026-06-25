// Per-feature separability (spec 03 §6.2). DOM-free (environment: 'node').

import { describe, it, expect } from "vitest";
import {
  jitter,
  speedCV,
  curvature,
  featureValue,
  shapeDescriptor,
  shapeDistance,
  clusterMeanForm,
} from "./features.ts";
import type { FeatureKey, Stroke } from "./types.ts";
import { makeMotifCluster, makeForgery } from "./__fixtures__/strokes.ts";

const N = 40;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
}
/** Cohen's d denominator: within-class pooled standard deviation. */
function pooledStd(a: number[], b: number[]): number {
  return Math.sqrt((variance(a) + variance(b)) / 2);
}

/** One machine instance of a motif (the cluster baseline). */
function machineInstance(motif: Parameters<typeof makeForgery>[0]["motif"], seed: number): Stroke {
  return makeMotifCluster({ motif, count: 1, seed })[0];
}

// Motor features where the band-limited machine signature vs a shakier human hand
// gives a robust margin. (speedPauses/curvature are weak with band-limited noise;
// the combined, two-sided detector covers them — see detector.test.)
const SCORERS: { key: FeatureKey; fn: (s: Stroke) => number; minMargin: number }[] = [
  { key: "jitter", fn: jitter, minMargin: 1.2 },
  { key: "speedCV", fn: speedCV, minMargin: 0.8 },
];

describe("motor features: naive human is more irregular than the machine", () => {
  for (const { key, fn, minMargin } of SCORERS) {
    it(`${key}: naive forgery > machine instance on average, margin ≥ ${minMargin}`, () => {
      const machine: number[] = [];
      const human: number[] = [];
      let wins = 0;
      for (let s = 0; s < N; s++) {
        const m = fn(machineInstance("wave", s));
        const h = fn(makeForgery({ motif: "wave", fidelity: 0, seed: s }));
        machine.push(m);
        human.push(h);
        if (h > m) wins++;
      }
      expect(mean(human)).toBeGreaterThan(mean(machine));
      const margin = (mean(human) - mean(machine)) / (pooledStd(machine, human) || 1e-9);
      expect(margin).toBeGreaterThanOrEqual(minMargin);
      expect(wins).toBeGreaterThanOrEqual(Math.floor(N * 0.7));
    });
  }
});

describe("shape feature (form conformance)", () => {
  it("a same-motif forgery is far closer to the cluster form than a different motif", () => {
    let sameWins = 0;
    for (let s = 0; s < N; s++) {
      const cluster = makeMotifCluster({ motif: "wave", seed: s });
      const meanForm = clusterMeanForm(cluster);
      const same = shapeDistance(makeForgery({ motif: "wave", fidelity: 0.8, seed: s }), meanForm);
      const wrong = shapeDistance(makeForgery({ motif: "spiral", fidelity: 0.8, seed: s }), meanForm);
      if (same < wrong) sameWins++;
    }
    expect(sameWins).toBeGreaterThanOrEqual(Math.floor(N * 0.9));
  });

  it("a sloppy (low-fidelity) forgery distorts the form more than a clean one", () => {
    let monotone = 0;
    for (let s = 0; s < N; s++) {
      const cluster = makeMotifCluster({ motif: "w", seed: s });
      const meanForm = clusterMeanForm(cluster);
      const sloppy = shapeDistance(makeForgery({ motif: "w", fidelity: 0, seed: s }), meanForm);
      const clean = shapeDistance(makeForgery({ motif: "w", fidelity: 1, seed: s }), meanForm);
      if (sloppy > clean) monotone++;
    }
    expect(monotone).toBeGreaterThanOrEqual(Math.floor(N * 0.7));
  });

  it("machine instances cluster tightly around their own mean form", () => {
    const cluster = makeMotifCluster({ motif: "wave", count: 8, seed: 1 });
    const meanForm = clusterMeanForm(cluster);
    const dists = cluster.map((s) => shapeDistance(s, meanForm));
    // Every instance is recognizably the same motif (small distance).
    for (const d of dists) expect(d).toBeLessThan(0.6);
  });
});

describe("invariance", () => {
  it("shape descriptor is invariant to translation, uniform scale, and rotation", () => {
    const base = makeForgery({ motif: "ess", fidelity: 1, seed: 3 });
    const a = shapeDescriptor(base);

    const theta = 0.9;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const transformed: Stroke = {
      points: base.points.map((p) => ({
        x: 120 + 2.3 * (p.x * cos - p.y * sin),
        y: -40 + 2.3 * (p.x * sin + p.y * cos),
        t: p.t,
      })),
    };
    const b = shapeDescriptor(transformed);

    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    expect(maxDiff).toBeLessThan(0.05);
  });

  it("motor features are ~unchanged under uniform coordinate scaling", () => {
    const s = makeForgery({ motif: "wave", fidelity: 0, seed: 7 });
    const scaled: Stroke = { points: s.points.map((p) => ({ x: p.x * 2, y: p.y * 2, t: p.t })) };
    for (const key of ["jitter", "speedCV", "speedPauses", "curvature"] as FeatureKey[]) {
      const a = featureValue(s, key);
      const b = featureValue(scaled, key);
      expect(Math.abs(a - b) / (Math.abs(a) + 1e-9)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe("degenerate inputs", () => {
  it("short strokes return 0, never throw or NaN", () => {
    const tiny: Stroke = { points: [{ x: 0, y: 0, t: 0 }] };
    expect(jitter(tiny)).toBe(0);
    expect(speedCV(tiny)).toBe(0);
    expect(curvature(tiny)).toBe(0);
  });
  it("shapeDistance returns NaN without a mean form (feature excluded)", () => {
    expect(Number.isNaN(shapeDistance(makeForgery({ motif: "wave", seed: 1 })))).toBe(true);
    expect(Number.isNaN(shapeDistance(makeForgery({ motif: "wave", seed: 1 }), []))).toBe(true);
  });
});
