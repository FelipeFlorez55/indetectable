// Difficulty (spec 04, CLAUDE.md §7). Pure data + pure functions. The single
// source of difficulty truth, read by the scene (05). The DETECTOR is CONSTANT —
// difficulty moves on ONE knob: motif complexity. A harder motif raises both the
// shape axis and the motion axis at once (more to get right, not a stricter judge).

import type { DetectorConfig } from "../detector/index.ts";
import type { MotifKind } from "../scene/index.ts";

export type Level = 1 | 2 | 3; // complexity tier; "Fine" (FFT) is v3, out of scope

export type LevelConfig = {
  level: Level;
  label: string; // "Easy" | "Medium" | "Hard"
  motifs: MotifKind[]; // pool the day's seed picks ONE from
  feel: string; // design intent, for docs / dev overlay
};

/**
 * The ONE detector config, used every day regardless of tier (spec 04). Features
 * are always on; `shape` is one-sided, motor features two-sided (TWO_SIDED, 03).
 * Numbers are initial guesses; the calibration harness (03 §6.5) tunes weights,
 * threshold, SUSPICION_SCALE, FEATURE_FLOORS, and the signature amplitudes (05).
 * pressure + overshoot stay out of the weighted set in v1 (flavor only, §13.3).
 */
export const DETECTOR_CONFIG: DetectorConfig = {
  activeFeatures: ["shape", "jitter", "speedCV", "speedPauses", "curvature"],
  weights: {
    shape: 0.4, // "did you draw the motif" is the backbone
    jitter: 0.25, // micro-tremor signature
    speedCV: 0.15,
    speedPauses: 0.1,
    curvature: 0.1,
  },
  // T — single tuned constant (not per-tier). Calibrated against the synthetic
  // fixtures (spec 03 §6.5): perfect forgeries top out ~0.21 humanness while naive
  // (≥0.39) and wrong-shape (≥0.46) strokes sit above; 0.33 splits that gap.
  threshold: 0.33,
};

// Tiers = motif complexity pools. The geometry of each MotifKind lives in the
// scene generator (05). Complexity is monotone across tiers.
export const LEVELS: Record<Level, LevelConfig> = {
  1: {
    level: 1,
    label: "Easy",
    motifs: ["line", "arc", "wave"],
    feel: "One simple curve. Forgiving to forge.",
  },
  2: {
    level: 2,
    label: "Medium",
    motifs: ["w", "zigzag", "ess", "loop"],
    feel: "A real shape with corners; match its rhythm.",
  },
  3: {
    level: 3,
    label: "Hard",
    motifs: ["spiral", "figure8", "squiggle"],
    feel: "Many direction changes — nail the form AND the tremor.",
  },
};

// Weekly rotation (RESOLVED §13.2). dayIndex 0 = 1970-01-01 = Thursday, so
// weekday = (dayIndex + 4) % 7 (0 = Sunday). Hardest motifs on the weekend.
const WEEKDAY_TO_LEVEL: Record<number, Level> = {
  0: 3, // Sun
  1: 1, // Mon
  2: 1, // Tue
  3: 2, // Wed
  4: 2, // Thu
  5: 3, // Fri
  6: 3, // Sat
};

/** The tier for a given day — deterministic weekly rotation (fair per seed). */
export function levelForDay(dayIndex: number): Level {
  return WEEKDAY_TO_LEVEL[(((dayIndex + 4) % 7) + 7) % 7];
}

/**
 * The detector config — CONSTANT across tiers (§7). The `level` param is accepted
 * for a stable call site (App passes it) but does not change the config.
 */
export function toDetectorConfig(_level?: Level): DetectorConfig {
  return DETECTOR_CONFIG;
}
