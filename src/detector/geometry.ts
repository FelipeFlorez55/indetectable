// Pure geometry helpers for the detector. No DOM, no dependencies.
// All operate on the raw points (or internal copies); none mutate their input.

import type { Point } from "./types.ts";

export const EPS = 1e-9;

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Total polyline length over the raw points. */
export function strokeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Arithmetic mean of a list (ignores NaN). Returns 0 for an empty list. */
export function mean(xs: number[]): number {
  let sum = 0;
  let n = 0;
  for (const x of xs) {
    if (!Number.isNaN(x)) {
      sum += x;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/** Population standard deviation (ignores NaN). */
export function std(xs: number[]): number {
  const valid = xs.filter((x) => !Number.isNaN(x));
  if (valid.length === 0) return 0;
  const m = mean(valid);
  const variance = valid.reduce((acc, x) => acc + (x - m) ** 2, 0) / valid.length;
  return Math.sqrt(variance);
}

export function variance(xs: number[]): number {
  return std(xs) ** 2;
}

/**
 * Savitzky-Golay quadratic smoothing (window 5). Unlike a moving average, a
 * quadratic fit follows smooth curvature with ~zero residual and removes only
 * high-frequency tremor — so the jitter residual measures the hand, not the
 * shape. Edge points (first/last 2) are returned unchanged. New array.
 */
export function sgSmooth(points: Point[]): Point[] {
  const c = [-3, 12, 17, 12, -3];
  const norm = 35;
  const out = points.map((p) => ({ ...p }));
  for (let i = 2; i < points.length - 2; i++) {
    let sx = 0;
    let sy = 0;
    for (let k = -2; k <= 2; k++) {
      sx += c[k + 2] * points[i + k].x;
      sy += c[k + 2] * points[i + k].y;
    }
    out[i] = { x: sx / norm, y: sy / norm, t: points[i].t };
  }
  return out;
}

/**
 * Resample a polyline to roughly uniform arc-length spacing into `count`
 * points. Used by curvature so spacing doesn't bias the measure (spec 03 §2).
 * Returns a NEW array; timestamps are linearly interpolated.
 */
export function resampleUniform(points: Point[], count: number): Point[] {
  if (points.length < 2 || count < 2) return points.map((p) => ({ ...p }));
  const total = strokeLength(points);
  if (total < EPS) return points.map((p) => ({ ...p }));
  const step = total / (count - 1);
  const out: Point[] = [{ ...points[0] }];
  let segIdx = 1;
  let distSoFar = 0;
  let prev = points[0];
  for (let k = 1; k < count - 1; k++) {
    const target = k * step;
    while (segIdx < points.length) {
      const segLen = dist(prev, points[segIdx]);
      if (distSoFar + segLen >= target) {
        const r = (target - distSoFar) / Math.max(segLen, EPS);
        const a = prev;
        const b = points[segIdx];
        out.push({
          x: a.x + r * (b.x - a.x),
          y: a.y + r * (b.y - a.y),
          t: a.t + r * (b.t - a.t),
        });
        break;
      }
      distSoFar += segLen;
      prev = points[segIdx];
      segIdx++;
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

// ---- Shape conformance ($1-Unistroke / Procrustes style, spec 03 §2.0) --------

export const SHAPE_SAMPLES = 64;

/**
 * Canonical, position/scale/rotation-invariant point set for one stroke, as a
 * flat [x0,y0,x1,y1,…] array of length 2·SHAPE_SAMPLES. Steps:
 *   1. arc-length resample to SHAPE_SAMPLES points (kills speed/sampling bias),
 *   2. translate centroid to the origin,
 *   3. scale to unit RMS radius (size-invariant),
 *   4. rotate so the first point lies on +x (indicative angle → rotation-invariant).
 * Returns geometry only; pure, allocates a new array.
 */
export function shapeDescriptor(points: Point[]): number[] {
  if (points.length < 2) return new Array(SHAPE_SAMPLES * 2).fill(0);
  const rs = resampleUniform(points, SHAPE_SAMPLES);

  // Centroid.
  let cx = 0;
  let cy = 0;
  for (const p of rs) {
    cx += p.x;
    cy += p.y;
  }
  cx /= rs.length;
  cy /= rs.length;

  // Centered coords + RMS radius.
  const xs = rs.map((p) => p.x - cx);
  const ys = rs.map((p) => p.y - cy);
  let sumSq = 0;
  for (let i = 0; i < rs.length; i++) sumSq += xs[i] * xs[i] + ys[i] * ys[i];
  const rms = Math.sqrt(sumSq / rs.length) || 1;

  // Indicative angle: angle of the first centered point; rotate by -angle.
  const angle = Math.atan2(ys[0], xs[0]);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  const out: number[] = new Array(rs.length * 2);
  for (let i = 0; i < rs.length; i++) {
    const x = xs[i] / rms;
    const y = ys[i] / rms;
    out[2 * i] = x * cos - y * sin;
    out[2 * i + 1] = x * sin + y * cos;
  }
  return out;
}

/** Elementwise mean of several descriptors (the motif's mean form). */
export function meanDescriptor(descriptors: number[][]): number[] {
  if (descriptors.length === 0) return [];
  const n = descriptors[0].length;
  const out = new Array(n).fill(0);
  for (const d of descriptors) for (let i = 0; i < n; i++) out[i] += d[i];
  for (let i = 0; i < n; i++) out[i] /= descriptors.length;
  return out;
}

/** Mean per-point Euclidean distance between two equal-length flat descriptors. */
export function descriptorDistance(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return NaN;
  let sum = 0;
  const pointCount = a.length / 2;
  for (let i = 0; i < pointCount; i++) {
    const dx = a[2 * i] - b[2 * i];
    const dy = a[2 * i + 1] - b[2 * i + 1];
    sum += Math.hypot(dx, dy);
  }
  return sum / pointCount;
}

/** Signed turning angle (radians) between vectors (a→b) and (b→c). */
export function turningAngle(a: Point, b: Point, c: Point): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  return Math.atan2(cross, dot);
}
