// Core data model shared across the app.
// The detector consumes the RAW captured points only — never the smoothed
// display path. See CLAUDE.md §5.1 / §6.3 and specs/03-detector.md.

/** A single captured sample. `t` = timestamp in ms (from a high-res clock). */
export type Point = { x: number; y: number; t: number };

/** One stroke: its raw points and, when available (stylus/touch), pressure. */
export type Stroke = { points: Point[]; pressure?: number[] };

/** The day's scene: machine-painted procedural strokes + the player's stroke. */
export type Scene = {
  procedural: Stroke[];
  humanStroke: Stroke;
};

/** Named features. Order is stable; weights are keyed by this. (spec 03 §1) */
export type FeatureKey =
  | "shape" // §5.3.0 form conformance vs the motif cluster (one-sided)
  | "jitter" // §5.3.1 micro-tremor (motor, two-sided)
  | "speedCV" // §5.3.2 coefficient of variation of speed (motor, two-sided)
  | "speedPauses" // §5.3.2 reversals / dt-spikes, normalized (motor, two-sided)
  | "curvature" // §5.3.3 variance of curvature derivative (motor, two-sided)
  | "pressure" // §5.3.4 pressure variance (optional, OFF in v1 — §13.3)
  | "overshoot"; // §5.3.5 endpoint overshoot (optional)

export const FEATURE_KEYS: readonly FeatureKey[] = [
  "shape",
  "jitter",
  "speedCV",
  "speedPauses",
  "curvature",
  "pressure",
  "overshoot",
];

/**
 * Which features are two-sided. MOTOR features (jitter, speed, curvature) are
 * two-sided (|z|): the machine has a real motion signature, so deviating in
 * EITHER direction — too clean OR too noisy — is suspicious. `shape` is one-sided
 * (closer to the motif's mean form is never suspicious). See spec 03 §3.
 */
export const TWO_SIDED: Record<FeatureKey, boolean> = {
  shape: false,
  jitter: true,
  speedCV: true,
  speedPauses: true,
  curvature: true,
  pressure: true,
  overshoot: false,
};

/** A single scalar measured on one stroke. `NaN` = feature unavailable. */
export type FeatureVector = Record<FeatureKey, number>;

/** Per-feature z-score of the human stroke vs the procedural cluster. */
export type ZVector = Partial<Record<FeatureKey, number>>;

export type StrokeScore = {
  /** Weighted, normalized humanness in [0, 1]. */
  humanness: number;
  /** Raw features, for dev-mode logging / calibration (§7). */
  features: FeatureVector;
  /** z-scores actually used (only the level's active, available features). */
  z: ZVector;
};

export type Verdict = {
  /** Index into the full stroke list (procedural ++ [human]). */
  guessIndex: number;
  /** Detector's confidence in its accusation, in [0, 1]. */
  confidence: number;
  /** Did it point at the human stroke? */
  caughtHuman: boolean;
  /** Per-stroke humanness, parallel to the input stroke list. */
  scores: StrokeScore[];
  /** Player outcome (see spec 03 §4 win condition). */
  playerWon: boolean;
  /** Player score in [0, 100] (§5.5) — invisibility + any camouflage bonus. */
  playerScore: number;
  /**
   * How invisible the human stroke was, in [0, 100], ALWAYS computed (even on a
   * loss) so progress is visible. 50 = the catch line (humanness == T); above 50
   * you'd win on your own stroke, below 50 you're caught. Drives the meter.
   */
  invisibility: number;
  /** Per-active-feature mean of the procedural cluster (F3 "X× the machine"). */
  clusterMean?: Partial<Record<FeatureKey, number>>;
};

/** Knobs supplied by the difficulty level (see specs/04-difficulty). */
export type DetectorConfig = {
  activeFeatures: FeatureKey[];
  /** w_f; renormalized over the active, available feature set. */
  weights: Partial<Record<FeatureKey, number>>;
  /** T, in [0, 1]. */
  threshold: number;
};

/** Optional anchor points the human stroke is expected to connect to. */
export type Anchor = { start?: Point; end?: Point };

/** The pluggable contract. v1 = AlgorithmicDetector; v2 = VlmDetector (§14). */
export interface Detector {
  evaluate(scene: Scene, config: DetectorConfig): Verdict;
}
