// Difficulty tests (spec 04 §acceptance). DOM-free.

import { describe, it, expect } from "vitest";
import { LEVELS, DETECTOR_CONFIG, levelForDay, toDetectorConfig, type Level } from "./levels.ts";

const ALL: Level[] = [1, 2, 3];

describe("levelForDay", () => {
  it("is deterministic and pure", () => {
    expect(levelForDay(200)).toBe(levelForDay(200));
  });
  it("maps the weekly rotation (dayIndex 0 = Thursday)", () => {
    expect(levelForDay(0)).toBe(LEVELS[2].level); // Thu → Medium
    expect(levelForDay(4)).toBe(LEVELS[1].level); // Mon → Easy
    expect(levelForDay(2)).toBe(LEVELS[3].level); // Sat → Hard
  });
  it("handles negative day indices", () => {
    expect(ALL).toContain(levelForDay(-5));
  });
});

describe("the constant detector config (single knob = motif complexity, §7)", () => {
  it("weights sum to 1 over the active features", () => {
    const sum = DETECTOR_CONFIG.activeFeatures.reduce(
      (acc, k) => acc + (DETECTOR_CONFIG.weights[k] ?? 0),
      0,
    );
    expect(sum).toBeCloseTo(1, 10);
  });
  it("always scores shape + the motor features", () => {
    expect(DETECTOR_CONFIG.activeFeatures).toContain("shape");
    expect(DETECTOR_CONFIG.activeFeatures).toContain("jitter");
  });
  it("toDetectorConfig is the SAME constant regardless of tier", () => {
    for (const lvl of ALL) expect(toDetectorConfig(lvl)).toBe(DETECTOR_CONFIG);
    expect(toDetectorConfig()).toBe(DETECTOR_CONFIG);
  });
});

describe("motif tiers", () => {
  it("every tier has a non-empty motif pool", () => {
    for (const lvl of ALL) expect(LEVELS[lvl].motifs.length).toBeGreaterThan(0);
  });
  it("tier motif pools are disjoint (each motif belongs to one complexity tier)", () => {
    const all = ALL.flatMap((l) => LEVELS[l].motifs);
    expect(new Set(all).size).toBe(all.length);
  });
});
