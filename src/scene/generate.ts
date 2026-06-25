// Deterministic procedural scene generation (spec 05, CLAUDE.md §8).
// The day's scene is N instances of ONE motif, all drawn in a shared machine
// "handwriting": same shape, same pace, same tremor amplitude, with small
// per-instance variance (the calibration cluster the detector self-calibrates
// against, §5.2). The player forges one more instance. There is NO per-level
// `decoyJitter` knob anymore — the motion signature is ALWAYS on (§7); only the
// MOTIF changes by tier (specs/04).

import type { Point, Stroke } from "../detector/index.ts";
import { resampleUniform, strokeLength } from "../detector/geometry.ts";
import { LEVELS, levelForDay, type Level } from "../difficulty/index.ts";
import { dailyRng, utcDayIndex } from "./seed.ts";
import { pick, randInt, uniform } from "./prng.ts";

const TAU = Math.PI * 2;

// ---- Motifs --------------------------------------------------------------------

/** The day's shape. The tier pool (04) picks ONE; the generator draws N of it. */
export type MotifKind =
  | "line"
  | "arc"
  | "wave" // tier 1
  | "w"
  | "zigzag"
  | "ess"
  | "loop" // tier 2
  | "spiral"
  | "figure8"
  | "squiggle"; // tier 3

type Vec = { x: number; y: number };
type UnitCurve = (u: number) => Vec;

/** Linear interpolation across vertex y-values (for sharp-cornered motifs). */
function polyline(u: number, ys: number[]): number {
  const n = ys.length - 1;
  const s = Math.min(Math.max(u, 0) * n, n - 1e-9);
  const i = Math.floor(s);
  return ys[i] + (ys[i + 1] - ys[i]) * (s - i);
}

/**
 * Parametric form of a motif in a CANONICAL unit box (~[-1,1]²), as a function of
 * u ∈ [0,1]. Pure geometry — no transform, no signature, no timing. Each instance
 * applies its own affine transform + signature on top.
 */
export function motifCurve(kind: MotifKind): UnitCurve {
  switch (kind) {
    case "line":
      return (u) => ({ x: 2 * u - 1, y: 0 });
    case "arc":
      return (u) => {
        const a = Math.PI * u; // upper semicircle
        return { x: Math.cos(a), y: Math.sin(a) - 0.4 };
      };
    case "wave":
      return (u) => ({ x: 2 * u - 1, y: 0.6 * Math.sin(TAU * u) });
    case "w":
      return (u) => ({ x: 2 * u - 1, y: 0.8 * polyline(u, [1, -1, 1, -1, 1]) });
    case "zigzag":
      return (u) => ({ x: 2 * u - 1, y: 0.8 * polyline(u, [-1, 1, -1, 1]) });
    case "ess":
      return (u) => ({ x: 0.6 * Math.sin(TAU * u), y: 2 * u - 1 });
    case "loop":
      return (u) => ({ x: Math.sin(TAU * u), y: 0.7 * Math.cos(TAU * u) + (2 * u - 1) * 0.3 });
    case "spiral": {
      return (u) => {
        const r = 0.2 + 0.8 * u;
        const a = TAU * 2.5 * u;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      };
    }
    case "figure8":
      return (u) => ({ x: Math.sin(TAU * u), y: 0.5 * Math.sin(2 * TAU * u) });
    case "squiggle":
      return (u) => ({
        x: 2 * u - 1,
        y:
          0.4 * Math.sin(TAU * 1.5 * u) +
          0.3 * Math.sin(TAU * 3.2 * u + 1) +
          0.15 * Math.sin(TAU * 5 * u),
      });
  }
}

// ---- Motion signature ----------------------------------------------------------

/** The machine's shared "handwriting" for the day (CLAUDE.md §7). Always on. */
export type Signature = {
  speed: number; // px/ms, base pace
  speedVar: number; // intra-stroke pace variation (→ speedCV/pauses)
  tremorAmp: number; // px of high-freq perpendicular tremor (the always-on jitter)
  shapeVar: number; // px of low-freq per-instance shape wobble
};

// Tuned constants — the same character of distribution every day (specs/04 §6.5).
const SIG_SPEED_VAR = 0.18;
const SIG_TREMOR_AMP = 1.6;
const SIG_SHAPE_VAR = 5;

/** Deterministic signature for the day. Seed sets the base pace; amplitudes are constants. */
export function dailySignature(rng: () => number): Signature {
  return {
    speed: uniform(rng, 0.4, 0.8),
    speedVar: SIG_SPEED_VAR,
    tremorAmp: SIG_TREMOR_AMP,
    shapeVar: SIG_SHAPE_VAR,
  };
}

// ---- Noise (band-limited, deterministic) ---------------------------------------

const DENSE = 256; // dense param-space samples before arc-length resampling
const NOISE_MODES = 4;
const TREMOR_WAVELENGTHS = [3, 4, 5.5]; // in samples; short → SG can't track, but Nyquist-safe

/** Band-limited LOW-freq noise in [-1, 1]-ish — bends the curve's shape (SG tracks it). */
function makeNoise(rng: () => number): (u: number) => number {
  const modes = Array.from({ length: NOISE_MODES }, () => ({
    freq: uniform(rng, 1, 6),
    phase: uniform(rng, 0, TAU),
    amp: uniform(rng, 0.5, 1),
  }));
  const norm = modes.reduce((acc, m) => acc + m.amp, 0) || 1;
  return (u) => modes.reduce((acc, m) => acc + m.amp * Math.sin(TAU * m.freq * u + m.phase), 0) / norm;
}

/**
 * High-frequency tremor in [-1, 1]-ish. Frequencies derived from SAMPLE-RELATIVE
 * wavelengths so the wobble survives Savitzky-Golay smoothing as jitter residual
 * without aliasing, regardless of the stroke's sample count `n`.
 */
function makeTremor(rng: () => number, n: number): (u: number) => number {
  const span = Math.max(n - 1, 1);
  const modes = TREMOR_WAVELENGTHS.map((w) => ({
    freq: span / (w * uniform(rng, 0.9, 1.1)),
    phase: uniform(rng, 0, TAU),
    amp: uniform(rng, 0.6, 1),
  }));
  const norm = modes.reduce((acc, m) => acc + m.amp, 0) || 1;
  return (u) => modes.reduce((acc, m) => acc + m.amp * Math.sin(TAU * m.freq * u + m.phase), 0) / norm;
}

// ---- Instance synthesis --------------------------------------------------------

export type Transform = {
  tx: number;
  ty: number;
  scale: number;
  rotation: number;
  // Per-instance shape variance: non-uniform stretch + shear. Uniform scale and
  // rotation are normalized away by the shape descriptor (03 §2.0), but sx≠sy and
  // shear are NOT — so these give the cluster genuine shape diversity ("4 W en
  // diferente forma"), widening the target zone so a similar human isn't an
  // instant outlier. Applied in the canonical unit box, before scale/rotate.
  sx: number;
  sy: number;
  shear: number;
};

export type MotifInstanceOptions = {
  motif: MotifKind;
  transform: Transform;
  signature: Signature;
  samples: number;
};

/**
 * Build one motif instance: the canonical motif → affine transform (place it
 * anywhere on the board) → arc-length resample → always-on signature (low-freq
 * shape wobble + high-freq tremor) → signature-paced timestamps. Per-instance
 * noise phases (from `rng`) give the cluster its intra-cluster variance.
 */
export function buildMotifInstance(rng: () => number, opts: MotifInstanceOptions): Stroke {
  const f = motifCurve(opts.motif);
  const { tx, ty, scale, rotation } = opts.transform;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  const dense: Point[] = [];
  for (let i = 0; i <= DENSE; i++) {
    const p = f(i / DENSE);
    // Per-instance shape warp (non-uniform stretch + shear) in the unit box.
    const ux = p.x * opts.transform.sx + p.y * opts.transform.shear;
    const uy = p.y * opts.transform.sy;
    const sx = ux * scale;
    const sy = uy * scale;
    dense.push({ x: tx + sx * cosR - sy * sinR, y: ty + sx * sinR + sy * cosR, t: 0 });
  }
  const clean = resampleUniform(dense, opts.samples);

  // Draw order is fixed so the seed stream is stable.
  const spaceNoise = makeNoise(rng);
  const timeNoise = makeNoise(rng);
  const tremorNoise = makeTremor(rng, clean.length);
  const sig = opts.signature;
  const step = strokeLength(clean) / Math.max(clean.length - 1, 1);
  const baseDt = step / Math.max(sig.speed, 1e-6);

  const pts: Point[] = [];
  let t = 0;
  for (let i = 0; i < clean.length; i++) {
    const u = i / Math.max(clean.length - 1, 1);

    const prev = clean[Math.max(0, i - 1)];
    const next = clean[Math.min(clean.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // Always-on signature: low-freq shape wobble + high-freq tremor.
    const off = sig.shapeVar * spaceNoise(u) + sig.tremorAmp * tremorNoise(u);
    pts.push({ x: clean[i].x + nx * off, y: clean[i].y + ny * off, t });

    const dtFactor = 1 + sig.speedVar * timeNoise(u);
    t += baseDt * Math.max(0.1, dtFactor);
  }

  return { points: pts };
}

// ---- Scene spec ----------------------------------------------------------------

export type SceneSpec = {
  dayIndex: number;
  level: Level; // tier (04) → motif pool
  motif: MotifKind; // the chosen motif
  signature: Signature; // shared machine handwriting
  width: number; // logical canvas units (CSS px)
  height: number;
  instanceCount: number; // N
  transforms: Transform[]; // per-instance placement (anywhere on the board), length N
};

export const DEFAULT_SCENE = { width: 800, height: 600 } as const;

/** A per-instance placement; rotation is free (the detector is rotation-invariant, §13.5). */
function randomTransform(rng: () => number, w: number, h: number): Transform {
  const minDim = Math.min(w, h);
  const scale = uniform(rng, minDim * 0.16, minDim * 0.28);
  const margin = scale;
  return {
    tx: uniform(rng, margin, w - margin),
    ty: uniform(rng, margin, h - margin),
    scale,
    rotation: uniform(rng, -0.5, 0.5),
    sx: uniform(rng, 0.78, 1.22),
    sy: uniform(rng, 0.78, 1.22),
    shear: uniform(rng, -0.22, 0.22),
  };
}

/** Build the N deterministic motif instances for a scene (the calibration cluster). */
export function generateProceduralStrokes(spec: SceneSpec, rng: () => number): Stroke[] {
  return spec.transforms.map((transform) =>
    buildMotifInstance(rng, {
      motif: spec.motif,
      transform,
      signature: spec.signature,
      samples: randInt(rng, 48, 80),
    }),
  );
}

function buildSpec(dayIndex: number, level: Level, rng: () => number): SceneSpec {
  const motif = pick(rng, LEVELS[level].motifs);
  const signature = dailySignature(rng);
  const instanceCount = randInt(rng, 4, 7);
  const { width, height } = DEFAULT_SCENE;
  const transforms = Array.from({ length: instanceCount }, () => randomTransform(rng, width, height));
  return { dayIndex, level, motif, signature, width, height, instanceCount, transforms };
}

/** Full daily scene spec. humanStroke is filled later by capture (spec 01). */
export function buildSceneSpec(dayIndex: number = utcDayIndex()): SceneSpec {
  return buildSpec(dayIndex, levelForDay(dayIndex), dailyRng(dayIndex));
}

/** Practice mode: a random (non-daily) scene; does not affect the streak (§11). */
export function buildPracticeSceneSpec(level: Level, salt: number): SceneSpec {
  return buildSpec(-1, level, dailyRng(salt));
}
