// Feature functions (spec 03 §2). Each is pure, DOM-free, individually testable,
// and reads the RAW points. Functions that need uniform spacing resample an
// internal copy; resampling never escapes the function.

import type { Anchor, FeatureKey, FeatureVector, Stroke } from "./types.ts";
import {
  EPS,
  descriptorDistance,
  dist,
  mean,
  meanDescriptor,
  resampleUniform,
  sgSmooth,
  shapeDescriptor as descriptorFromPoints,
  std,
  strokeLength,
  turningAngle,
  variance,
} from "./geometry.ts";

const CURVATURE_SAMPLES = 64;

/**
 * §2.0 Shape conformance (the form backbone). Position/scale/rotation-invariant
 * via the canonical descriptor (geometry). `shape` is RELATIONAL: it needs the
 * cluster's mean form to measure against, so it takes `meanForm` (precomputed once
 * per scene). One-sided: large distance = wrong/sloppy form = suspicious.
 */
export function shapeDescriptor(stroke: Stroke): number[] {
  return descriptorFromPoints(stroke.points);
}

/** The motif's mean form: elementwise mean descriptor across the procedural instances. */
export function clusterMeanForm(procedural: Stroke[]): number[] {
  return meanDescriptor(procedural.map((s) => descriptorFromPoints(s.points)));
}

/** Distance from this stroke's normalized form to the cluster mean form. NaN if no meanForm. */
export function shapeDistance(stroke: Stroke, meanForm?: number[]): number {
  if (!meanForm || meanForm.length === 0) return NaN;
  return descriptorDistance(descriptorFromPoints(stroke.points), meanForm);
}

/**
 * §2.1 Jitter / micro-tremor (backbone). RMS deviation of the raw points from a
 * Savitzky-Golay baseline (which follows the intended curve but not the tremor),
 * normalized by stroke length. Human = high residual; clean procedural = ~0.
 */
export function jitter(stroke: Stroke): number {
  const pts = stroke.points;
  if (pts.length < 7) return 0;
  const sm = sgSmooth(pts);
  let sumSq = 0;
  let count = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const dx = pts[i].x - sm[i].x;
    const dy = pts[i].y - sm[i].y;
    sumSq += dx * dx + dy * dy;
    count++;
  }
  if (count === 0) return 0;
  const rms = Math.sqrt(sumSq / count);
  const len = strokeLength(pts);
  return len < EPS ? 0 : rms / len;
}

/** Per-segment speeds v_i = dist / max(dt, eps). */
function segmentSpeeds(stroke: Stroke): number[] {
  const pts = stroke.points;
  const speeds: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    speeds.push(dist(pts[i - 1], pts[i]) / Math.max(dt, EPS));
  }
  return speeds;
}

/** §2.2 Coefficient of variation of speed. Human → high (accel/decel). */
export function speedCV(stroke: Stroke): number {
  const speeds = segmentSpeeds(stroke);
  if (speeds.length < 2) return 0;
  const m = mean(speeds);
  if (m < EPS) return 0;
  return std(speeds) / m;
}

/**
 * §2.2 Normalized count of dt-spikes (micro-pauses) + direction reversals.
 * Length-invariant: divided by the number of segments.
 */
export function speedPauses(stroke: Stroke): number {
  const pts = stroke.points;
  if (pts.length < 3) return 0;

  const dts: number[] = [];
  for (let i = 1; i < pts.length; i++) dts.push(pts[i].t - pts[i - 1].t);
  const mDt = mean(dts);
  const sDt = std(dts);
  const spikeThreshold = mDt + 2 * sDt;
  let dtSpikes = 0;
  for (const dt of dts) if (dt > spikeThreshold) dtSpikes++;

  // Reversals: consecutive segment vectors pointing > 90° apart.
  let reversals = 0;
  for (let i = 2; i < pts.length; i++) {
    const v1x = pts[i - 1].x - pts[i - 2].x;
    const v1y = pts[i - 1].y - pts[i - 2].y;
    const v2x = pts[i].x - pts[i - 1].x;
    const v2y = pts[i].y - pts[i - 1].y;
    if (v1x * v2x + v1y * v2y < 0) reversals++;
  }

  const segments = pts.length - 1;
  return (dtSpikes + reversals) / segments;
}

/**
 * §2.3 Curvature smoothness. Variance of the derivative of the turning angle
 * along an arc-length-resampled copy. Angle-based (not divided by arc length)
 * so it is scale-invariant: uniform scaling preserves angles. Human → noisy.
 */
export function curvature(stroke: Stroke): number {
  const pts = stroke.points;
  if (pts.length < 4) return 0;
  const rs = resampleUniform(pts, Math.min(CURVATURE_SAMPLES, pts.length));
  if (rs.length < 4) return 0;

  const angles: number[] = [];
  for (let i = 1; i < rs.length - 1; i++) {
    angles.push(turningAngle(rs[i - 1], rs[i], rs[i + 1]));
  }
  if (angles.length < 2) return 0;

  const dAngle: number[] = [];
  for (let i = 1; i < angles.length; i++) dAngle.push(angles[i] - angles[i - 1]);
  return variance(dAngle);
}

/**
 * §2.4 Pressure variance. OFF in v1 scoring (§13.3): returns NaN when pressure
 * is absent so it is excluded and weights renormalize. Flavor only.
 */
export function pressureVar(stroke: Stroke): number {
  if (!stroke.pressure || stroke.pressure.length === 0) return NaN;
  return variance(stroke.pressure);
}

/**
 * §2.5 Endpoint overshoot. Gap between the stroke endpoints and the expected
 * anchors. Returns NaN (excluded) when no anchor is provided.
 */
export function overshoot(stroke: Stroke, anchor?: Anchor): number {
  if (!anchor || (!anchor.start && !anchor.end)) return NaN;
  const pts = stroke.points;
  if (pts.length < 1) return NaN;
  const gaps: number[] = [];
  if (anchor.start) gaps.push(dist(pts[0], anchor.start));
  if (anchor.end) gaps.push(dist(pts[pts.length - 1], anchor.end));
  const len = strokeLength(pts);
  const raw = mean(gaps);
  return len < EPS ? raw : raw / len;
}

/** §2.6 Compute every feature once. `meanForm` enables the relational `shape` feature. */
export function featureVector(stroke: Stroke, anchor?: Anchor, meanForm?: number[]): FeatureVector {
  return {
    shape: shapeDistance(stroke, meanForm),
    jitter: jitter(stroke),
    speedCV: speedCV(stroke),
    speedPauses: speedPauses(stroke),
    curvature: curvature(stroke),
    pressure: pressureVar(stroke),
    overshoot: overshoot(stroke, anchor),
  };
}

export function featureValue(
  stroke: Stroke,
  key: FeatureKey,
  anchor?: Anchor,
  meanForm?: number[],
): number {
  switch (key) {
    case "shape":
      return shapeDistance(stroke, meanForm);
    case "jitter":
      return jitter(stroke);
    case "speedCV":
      return speedCV(stroke);
    case "speedPauses":
      return speedPauses(stroke);
    case "curvature":
      return curvature(stroke);
    case "pressure":
      return pressureVar(stroke);
    case "overshoot":
      return overshoot(stroke, anchor);
  }
}
