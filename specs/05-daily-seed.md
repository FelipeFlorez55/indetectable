# 05 — Daily Seed & Scene Generation

> Expands CLAUDE.md §8. Owns: `src/scene/`. Pure TS, no DOM, no dependencies
> (inline PRNG). Deterministic: same UTC day → same scene for everyone, no server.

## Goal

Derive the entire daily challenge — the **motif**, its **motion signature**, the
instance **count**, and each instance's **transform + variance** — deterministically
from the UTC date, so all players get the identical scene with zero backend.

> **Model (CLAUDE.md §1, §7).** The day's scene is **N instances of ONE motif**,
> all drawn in a shared machine "handwriting": same shape, same pace, same tremor
> amplitude, with small per-instance variance. The player forges one more instance.
> This replaces v0's "N random independent strokes."

## PRNG (inline, no dependency — CLAUDE.md §3)

```ts
/** Hash a string to a 32-bit seed. */
export function xmur3(str: string): () => number;

/** Seeded PRNG → float in [0, 1). */
export function mulberry32(seed: number): () => number;

/** Convenience: build an rng from a string key. */
export function rngFromKey(key: string): () => number;
```

## Day index & seed (CLAUDE.md §8)

```ts
/** UTC day index. Injectable clock for tests (no Date.now() in pure logic). */
export function utcDayIndex(now?: number): number; // Math.floor(now / 86_400_000), now defaults to Date.now()

/** Stable per-day key, e.g. `indetectable-<dayIndex>`. */
export function seedKey(dayIndex: number): string;

/** The rng for a given day. */
export function dailyRng(dayIndex: number): () => number;
```

> **UTC, on purpose** (CLAUDE.md §8): the "day" aligns globally so comparisons
> are fair. `Date.now()` is confined to the thin edge that reads the real clock;
> all generation logic takes `dayIndex`/`rng` so it's unit-testable and
> deterministic.

## Motifs

```ts
/** The day's shape. The tier's pool (04) picks ONE; the generator draws N of it. */
export type MotifKind =
  | "line" | "arc" | "wave"            // tier 1
  | "w" | "zigzag" | "ess" | "loop"    // tier 2
  | "spiral" | "figure8" | "squiggle"; // tier 3

/**
 * Parametric form of a motif in a CANONICAL unit box ([-1,1]², centered), as a
 * function of u ∈ [0,1]. Pure geometry — no transform, no signature, no timing.
 * Each instance applies its own affine transform + signature on top.
 */
export function motifCurve(kind: MotifKind): (u: number) => { x: number; y: number };

/** Whether the motif is orientation-sensitive (shape feature must NOT free-rotate it, 03 §2.0). */
export function motifOrientationSensitive(kind: MotifKind): boolean;
```

## The motion signature

```ts
/** The machine's shared "handwriting" for the day (CLAUDE.md §7). */
export type Signature = {
  speed: number;       // px/ms, base pace
  speedVar: number;    // intra-cluster spread of pace
  tremorAmp: number;   // px of high-freq perpendicular tremor (the always-on jitter)
  shapeVar: number;    // low-freq per-instance shape wobble
};

/** Deterministic signature for the day. Amplitudes are tuned constants (04); seed sets the phases/spread. */
export function dailySignature(rng: () => number): Signature;
```

## Scene generation

```ts
import type { Stroke, Scene } from "../detector/index.ts";
import type { Level } from "../difficulty/index.ts";

export type Transform = { tx: number; ty: number; scale: number; rotation: number };

export type SceneSpec = {
  dayIndex: number;
  level: Level;             // tier (04) → motif pool
  motif: MotifKind;         // the chosen motif (seed picks from the tier pool)
  signature: Signature;     // shared machine handwriting
  width: number;            // logical canvas units (CSS px)
  height: number;
  instanceCount: number;    // N, from rng within a sensible range (e.g. 4–7)
  transforms: Transform[];  // per-instance placement (anywhere on the board), length N
};

/** Build the N deterministic motif instances for a scene (the calibration cluster). */
export function generateProceduralStrokes(spec: SceneSpec, rng: () => number): Stroke[];

/** Full daily scene spec (tier via 04, motif/signature/transforms via rng). humanStroke filled later by capture. */
export function buildSceneSpec(dayIndex: number): SceneSpec;

/** Practice mode: a random (non-daily) scene; does not touch the streak (§11). */
export function buildPracticeSceneSpec(level: Level, salt: number): SceneSpec;
```

### Motif-instance synthesis

Each instance is built from the **same** motif + signature, differing only by its
transform and small seeded variance:

1. Sample `motifCurve(motif)` densely, arc-length **resample** → uniform spacing.
2. Apply the instance **transform**: scale, rotate, translate to its spot on the
   board (positions may overlap — "sobreexpuestas" — that's cosmetic; the detector
   is position-invariant, §13.5).
3. Add the signature's **shape wobble** (low-freq, `shapeVar`) + **tremor** (high-
   freq, `tremorAmp`) as seeded perpendicular noise — this is the always-on motor
   signature, NOT a per-level decoy. Per-instance phase/amplitude jitter gives the
   cluster its intra-cluster variance.
4. Synthesize timestamps from the signature's `speed` (+ per-instance `speedVar`
   and small micro-rhythm), so every instance has a valid, machine-characteristic
   `Point.t` series.

> **Critical difference from v0.** There is no `decoyJitter ∈ {0, low, high}` knob.
> The signature is **always on** and **identical in character** every day; only the
> motif changes by tier (04). The detector self-calibrates against whatever spread
> the N instances exhibit (03 §2–3).

### Composition into a Scene

```ts
// at play time:
const spec      = buildSceneSpec(utcDayIndex());
const rng       = dailyRng(spec.dayIndex);
const procedural = generateProceduralStrokes(spec, rng);
// humanStroke comes from capture (01); together they form the Scene the detector reads.
const scene: Scene = { procedural, humanStroke };
```

## Acceptance criteria

- [ ] `xmur3` + `mulberry32` are deterministic and reproduce known vectors
      (golden test values committed).
- [ ] Same `dayIndex` → byte-identical `SceneSpec` and procedural strokes across
      runs and machines (deep-equal over 100 runs).
- [ ] Different `dayIndex` → different scenes (no accidental collisions over a
      year of indices); the chosen `motif` always comes from the day's tier pool.
- [ ] All N instances are recognizably the **same motif** (small, tight
      `shapeDistance` to the cluster mean form — verified via the detector, 03 §2.0).
- [ ] The cluster has real **intra-cluster variance** on every feature (std > 0),
      so z-scores are finite and there is a target *zone* with width (feeds 04's
      fairness invariant).
- [ ] The signature is **always on**: every instance has a nonzero, consistent
      tremor/pace (no "clean machine" baseline anymore).
- [ ] No `Date.now()` inside generation logic — only `utcDayIndex` reads the clock,
      and it accepts an injected `now` for tests.
- [ ] Procedural strokes have strictly non-decreasing `t`.

## Out of scope

- Rendering the strokes → [02-rendering](./02-rendering.md).
- The level→knobs mapping → [04-difficulty](./04-difficulty.md).
