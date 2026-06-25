// Scoring (spec 03 §3). Self-calibration: each feature of a stroke becomes a
// z-score against the distribution of the day's procedural cluster, mapped to
// [0,1] suspicion and combined with the level's weights.

import type {
  Anchor,
  DetectorConfig,
  FeatureKey,
  FeatureVector,
  Stroke,
  StrokeScore,
  ZVector,
} from "./types.ts";
import { TWO_SIDED } from "./types.ts";
import { clusterMeanForm, featureValue, featureVector } from "./features.ts";
import { mean, std } from "./geometry.ts";

/**
 * Per-feature std floor (spec 03 §3 "std → 0 guard"). When the procedurals are
 * identical on a feature (e.g. decoyJitter = 0 → jitter std ≈ 0), z would
 * explode. Each floor is set to the feature's natural human-vs-machine scale so
 * a "reasonably smooth" human sits ~1–2 std out, not infinitely far. These are
 * the primary calibration target (spec 03 §6.5 / §13.4).
 */
export const FEATURE_FLOORS: Record<FeatureKey, number> = {
  shape: 0.07, // descriptor distance — wide enough that a similar-but-imperfect
  // freehand shape sits ~1 std out (winnable), while a wrong motif stays many std out.
  jitter: 0.0015, // residual / length — calibrated so a normal human passes Easy
  speedCV: 0.08, // dimensionless
  speedPauses: 0.03, // normalized count
  curvature: 0.05, // variance of Δ(turning angle)
  pressure: 1e-3, // pressure variance
  overshoot: 0.02, // gap / length
};

/** Mean/std of one feature across the procedural strokes (NaN excluded). */
export function clusterStats(
  procedural: Stroke[],
  key: FeatureKey,
  anchor?: Anchor,
  meanForm?: number[],
): { mean: number; std: number } {
  const mf = key === "shape" ? (meanForm ?? clusterMeanForm(procedural)) : meanForm;
  const values = procedural
    .map((s) => featureValue(s, key, anchor, mf))
    .filter((v) => !Number.isNaN(v));
  return { mean: mean(values), std: std(values) };
}

/** z = (value − mean) / max(std, floor). NaN value → NaN (excluded upstream). */
export function zScore(value: number, mean: number, std: number, floor = 0): number {
  if (Number.isNaN(value)) return NaN;
  const denom = Math.max(std, floor);
  if (denom < 1e-12) return 0;
  return (value - mean) / denom;
}

/**
 * Suspicion scale: z-score (in std units, above the machine cluster) that maps
 * to ~0.76 suspicion. Larger = more forgiving. Primary calibration knob alongside
 * FEATURE_FLOORS and the per-level thresholds.
 */
export const SUSPICION_SCALE = 3;

/**
 * Map a suspicion MAGNITUDE (≥ 0) to [0, 1] via tanh(mag / scale). The caller
 * passes the directional magnitude per the feature's sidedness (see scoreStroke):
 *   - MOTOR features: |z| — too clean OR too noisy vs the machine's signature.
 *   - SHAPE: max(z, 0) — only far-from-form is suspicious; on/under the mean is 0.
 * A negative input is clamped to 0 (defensive; callers pass a non-negative mag).
 */
export function normalizeZ(z: number, scale: number = SUSPICION_SCALE): number {
  if (z <= 0) return 0;
  return Math.tanh(z / scale);
}

/** Directional suspicion magnitude for a feature's z, per TWO_SIDED. */
export function suspicionMagnitude(key: FeatureKey, z: number): number {
  return TWO_SIDED[key] ? Math.abs(z) : Math.max(z, 0);
}

/**
 * humanness(stroke) = Σ w_f · normalizeZ(z_f), with weights renormalized over
 * the active features that are actually available (non-NaN) for this stroke.
 * Result is always in [0, 1].
 */
export function scoreStroke(
  stroke: Stroke,
  procedural: Stroke[],
  config: DetectorConfig,
  anchor?: Anchor,
  meanForm?: number[],
): StrokeScore {
  // The motif's mean form, for the relational `shape` feature. Computed once if
  // the caller (detector) didn't pass it.
  const mf = meanForm ?? clusterMeanForm(procedural);
  const features: FeatureVector = featureVector(stroke, anchor, mf);
  const z: ZVector = {};

  // Resolve usable features: active, with a positive weight, and not NaN.
  const usable: { key: FeatureKey; weight: number; suspicion: number }[] = [];
  for (const key of config.activeFeatures) {
    const weight = config.weights[key] ?? 0;
    if (weight <= 0) continue;
    const value = features[key];
    if (Number.isNaN(value)) continue; // unavailable (e.g. pressure on a mouse)
    const stats = clusterStats(procedural, key, anchor, mf);
    const zf = zScore(value, stats.mean, stats.std, FEATURE_FLOORS[key]);
    z[key] = zf;
    // Two-sided for motor features (|z|), one-sided for shape (max(z,0)).
    usable.push({ key, weight, suspicion: normalizeZ(suspicionMagnitude(key, zf)) });
  }

  const totalWeight = usable.reduce((acc, u) => acc + u.weight, 0);
  const humanness =
    totalWeight <= 0
      ? 0
      : usable.reduce((acc, u) => acc + (u.weight / totalWeight) * u.suspicion, 0);

  return { humanness, features, z };
}
