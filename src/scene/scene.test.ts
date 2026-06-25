// Deterministic scene / PRNG tests (spec 05 §acceptance). DOM-free.

import { describe, it, expect } from "vitest";
import { xmur3, mulberry32, rngFromKey } from "./prng.ts";
import { utcDayIndex, seedKey, dailyRng, msUntilNextUtcDay } from "./seed.ts";
import { buildSceneSpec, generateProceduralStrokes } from "./generate.ts";
import { jitter, AlgorithmicDetector, clusterMeanForm, shapeDistance } from "../detector/index.ts";
import { toDetectorConfig, LEVELS } from "../difficulty/index.ts";
import { makeForgery } from "../detector/__fixtures__/strokes.ts";

describe("PRNG determinism", () => {
  it("same key → identical sequence; different key → different", () => {
    const a = rngFromKey("indetectable-100");
    const b = rngFromKey("indetectable-100");
    const c = rngFromKey("indetectable-101");
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    const seqC = Array.from({ length: 8 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("mulberry32 outputs are in [0,1)", () => {
    const r = mulberry32(xmur3("x")());
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("UTC day index", () => {
  it("is the floor of ms/86_400_000 and accepts an injected clock", () => {
    expect(utcDayIndex(0)).toBe(0);
    expect(utcDayIndex(86_400_000)).toBe(1);
    expect(utcDayIndex(86_400_000 * 142 + 5)).toBe(142);
  });
  it("msUntilNextUtcDay is within (0, day]", () => {
    expect(msUntilNextUtcDay(86_400_000 * 10 + 1)).toBe(86_400_000 - 1);
  });
});

describe("seed key is locale-independent (spec 09 hinge)", () => {
  it("is exactly indetectable-<dayIndex>", () => {
    expect(seedKey(142)).toBe("indetectable-142");
  });
});

describe("scene determinism", () => {
  it("same dayIndex → identical SceneSpec", () => {
    expect(buildSceneSpec(200)).toEqual(buildSceneSpec(200));
  });
  it("same dayIndex → byte-identical procedural strokes", () => {
    const spec = buildSceneSpec(200);
    const a = generateProceduralStrokes(spec, dailyRng(200));
    const b = generateProceduralStrokes(spec, dailyRng(200));
    expect(a).toEqual(b);
  });
  it("different days → different scenes", () => {
    const a = generateProceduralStrokes(buildSceneSpec(200), dailyRng(200));
    const b = generateProceduralStrokes(buildSceneSpec(201), dailyRng(201));
    expect(a).not.toEqual(b);
  });
  it("the chosen motif always belongs to the day's tier pool", () => {
    for (const day of [200, 201, 202, 203, 204, 205, 206]) {
      const spec = buildSceneSpec(day);
      expect(LEVELS[spec.level].motifs).toContain(spec.motif);
    }
  });
});

describe("the always-on motion signature (no clean-machine baseline anymore)", () => {
  it("instances have strictly non-decreasing t and a nonzero tremor signature", () => {
    const spec = buildSceneSpec(201);
    const strokes = generateProceduralStrokes(spec, dailyRng(201));
    for (const s of strokes) {
      const pts = s.points;
      for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t);
      // Always-on signature → real (nonzero) jitter residual, but bounded.
      const j = jitter(s);
      expect(j).toBeGreaterThan(0);
      expect(j).toBeLessThan(0.2);
    }
  });
});

describe("N instances of ONE motif (the cluster)", () => {
  it("all instances are recognizably the same motif (tight shape cluster)", () => {
    const spec = buildSceneSpec(202);
    const strokes = generateProceduralStrokes(spec, dailyRng(202));
    const meanForm = clusterMeanForm(strokes);
    for (const s of strokes) expect(shapeDistance(s, meanForm)).toBeLessThan(0.6);
  });
});

describe("misdirection (the 'framed the machine' win is reachable)", () => {
  it("across seeds, a decent forgery sometimes makes a machine instance the top suspect", () => {
    const det = new AlgorithmicDetector();
    const cfg = toDetectorConfig();
    let framed = 0;
    for (let s = 0; s < 30; s++) {
      const spec = buildSceneSpec(30000 + s);
      const procedural = generateProceduralStrokes(spec, dailyRng(30000 + s));
      const human = makeForgery({ motif: spec.motif, fidelity: 0.85, seed: 5000 + s });
      const v = det.evaluate({ procedural, humanStroke: human }, cfg);
      if (v.playerWon && !v.caughtHuman) framed++;
    }
    expect(framed).toBeGreaterThan(0);
  });
});
