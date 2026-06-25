// Synthetic stroke fixtures for the separability suite (spec 03 §6.1). All
// deterministic from a seed; no DOM, no recordings required for CI.
//
// The day's scene is N instances of ONE motif drawn with the machine's always-on
// motion signature. A human FORGERY is the same motif drawn with a hand model
// whose tremor/pace match the machine more closely as `fidelity` rises.

import type { Stroke } from "../types.ts";
import {
  buildMotifInstance,
  dailySignature,
  type MotifKind,
  type Signature,
  type Transform,
} from "../../scene/generate.ts";
import { rngFromKey, uniform } from "../../scene/prng.ts";

const W = 800;
const H = 600;
const MIN_DIM = Math.min(W, H);

/** A placement on the board (matches the generator's distribution). */
function randomTransform(rng: () => number): Transform {
  const scale = uniform(rng, MIN_DIM * 0.16, MIN_DIM * 0.28);
  return {
    tx: uniform(rng, scale, W - scale),
    ty: uniform(rng, scale, H - scale),
    scale,
    rotation: uniform(rng, -0.5, 0.5),
    sx: uniform(rng, 0.78, 1.22),
    sy: uniform(rng, 0.78, 1.22),
    shear: uniform(rng, -0.22, 0.22),
  };
}

export type MotifClusterOptions = {
  motif?: MotifKind;
  count?: number;
  seed: number;
};

/**
 * N instances of one motif sharing the day's signature (the calibration cluster).
 * Per-instance transforms + noise phases give it real intra-cluster variance.
 */
export function makeMotifCluster(opts: MotifClusterOptions): Stroke[] {
  const motif = opts.motif ?? "wave";
  const count = opts.count ?? 6;
  const rng = rngFromKey(`cluster-${motif}-${opts.seed}`);
  const signature = dailySignature(rng);
  const out: Stroke[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      buildMotifInstance(rng, {
        motif,
        transform: randomTransform(rng),
        signature,
        samples: 64,
      }),
    );
  }
  return out;
}

export type ForgeryOptions = {
  motif: MotifKind;
  /** 0 = naive human (too shaky, jittery pace), 1 = near-perfect forger (matches the signature). */
  fidelity?: number;
  /** Override the motor signature directly (e.g. to make a "too clean" stroke). */
  signature?: Partial<Signature>;
  transform?: Transform;
  samples?: number;
  seed: number;
};

// Machine signature character (matches dailySignature's constants).
const MACHINE: Signature = { speed: 0.6, speedVar: 0.18, tremorAmp: 1.6, shapeVar: 5 };
// Naive-human character: shakier hand, more erratic pace.
const NAIVE: Signature = { speed: 0.6, speedVar: 0.7, tremorAmp: 6, shapeVar: 12 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * A human forgery of `motif`. Right shape (so the shape feature is satisfied), but
 * a hand model that interpolates between naive and machine-perfect by `fidelity`.
 * Low fidelity → motor features land far outside the cluster (caught); high
 * fidelity → in-distribution (blends in).
 */
export function makeForgery(opts: ForgeryOptions): Stroke {
  const f = opts.fidelity ?? 0;
  const sig: Signature = {
    speed: opts.signature?.speed ?? MACHINE.speed,
    speedVar: opts.signature?.speedVar ?? lerp(NAIVE.speedVar, MACHINE.speedVar, f),
    tremorAmp: opts.signature?.tremorAmp ?? lerp(NAIVE.tremorAmp, MACHINE.tremorAmp, f),
    shapeVar: opts.signature?.shapeVar ?? lerp(NAIVE.shapeVar, MACHINE.shapeVar, f),
  };
  const rng = rngFromKey(`forge-${opts.motif}-${opts.seed}-${f}`);
  // A sloppier hand (low fidelity) also distorts the FORM more, not just the motion:
  // extra non-uniform stretch/shear on top of the placement.
  const base = opts.transform ?? randomTransform(rng);
  const slop = (1 - f) * 0.35;
  const transform: Transform = {
    ...base,
    sx: base.sx * (1 + uniform(rng, -slop, slop)),
    sy: base.sy * (1 + uniform(rng, -slop, slop)),
    shear: base.shear + uniform(rng, -slop, slop),
  };
  return buildMotifInstance(rng, {
    motif: opts.motif,
    transform,
    signature: sig,
    samples: opts.samples ?? 64,
  });
}
