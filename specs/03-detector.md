# 03 — Detector (project core)

> Expands CLAUDE.md §5. Owns: `src/detector/`. **Pure TypeScript, no DOM, no
> dependencies, deterministic.** This is the most critical and most heavily
> tested module. It is built and validated **before** any UI exists, against
> synthetic strokes (CLAUDE.md §12).

---

## 0. Non-negotiables

1. Reads the **raw captured points only** (CLAUDE.md §5.1 / §6.3). Never the
   smoothed display path. Any resampling/smoothing the detector needs is done on
   an internal copy.
2. **No external training data.** Self-calibrating: each feature of the human
   stroke is a z-score against the distribution of the *day's motif instances*
   (CLAUDE.md §5.2). The N procedural strokes are copies of one motif with
   deliberate intra-cluster variance, so every feature has a real mean+std to
   calibrate against — on **both** the shape axis and the motion axis.
   Deterministic — same scene in → same verdict out.
3. No dependencies. ~200 readable lines is the target (CLAUDE.md §3).
4. Pluggable behind a `Detector` interface so the v2 VLM detector drops in
   without a rewrite (CLAUDE.md §14).

---

## 1. Types

```ts
import type { Point, Stroke, Scene } from "./types.ts";

/** Named features. Order is stable; weights are keyed by this. */
export type FeatureKey =
  | "shape"         // §5.3.0 form conformance vs the motif cluster (one-sided)
  | "jitter"        // §5.3.1 micro-tremor (motor, two-sided)
  | "speedCV"       // §5.3.2 coefficient of variation of speed (motor, two-sided)
  | "speedPauses"   // §5.3.2 count of reversals / dt-spikes, normalized (motor, two-sided)
  | "curvature"     // §5.3.3 variance of curvature derivative (motor, two-sided)
  | "pressure"      // §5.3.4 pressure variance (optional, low weight)
  | "overshoot";    // §5.3.5 endpoint overshoot (optional)

/**
 * Which features are two-sided (|z| — being FAR from the cluster in EITHER
 * direction is suspicious) vs one-sided (only large-positive z). Motor features
 * are two-sided because the machine has a real motion signature: too clean is as
 * much an outlier as too noisy. `shape` is one-sided (closer to the mean form is
 * never suspicious). See §3.
 */
export const TWO_SIDED: Record<FeatureKey, boolean> = {
  shape: false,
  jitter: true,
  speedCV: true,
  speedPauses: true,
  curvature: true,
  pressure: true,   // unused in v1
  overshoot: false, // unused in v1
};

/** A single scalar measured on one stroke. */
export type FeatureVector = Record<FeatureKey, number>;

/** Per-feature z-score of the human stroke vs the procedural cluster. */
export type ZVector = Partial<Record<FeatureKey, number>>;

export type StrokeScore = {
  /** Weighted, normalized humanness in [0, 1]. */
  humanness: number;
  /** Raw features, for dev-mode logging / calibration (§7). */
  features: FeatureVector;
  /** z-scores actually used (only the level's active features). */
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
  /** Player outcome (see §4 win condition). */
  playerWon: boolean;
  /** Player score in [0, 100] (§5.5). */
  playerScore: number;
};

/** Knobs supplied by the difficulty level (see 04-difficulty). */
export type DetectorConfig = {
  activeFeatures: FeatureKey[];
  weights: Partial<Record<FeatureKey, number>>; // w_f; renormalized over active set
  threshold: number;                            // T, in [0, 1]
};

/** The pluggable contract. v1 = AlgorithmicDetector; v2 = VlmDetector. */
export interface Detector {
  evaluate(scene: Scene, config: DetectorConfig): Verdict;
}
```

> **Index convention:** the detector is given the ordered list
> `[...scene.procedural, scene.humanStroke]`, so the human stroke is always the
> last index. The *caller* knows the truth; the detector computes a guess and
> only compares at the end. This preserves the v2 "client always knows the truth"
> rule (CLAUDE.md §14).

---

## 2. Feature functions (pure, individually testable)

Each is `(stroke: Stroke) => number`, operating on raw points. All are exported
so each has its own unit test.

> **Two kinds of feature.** `shape` is *relational* — it needs the cluster's mean
> form to measure against, so its public signature takes the cluster (§2.0). The
> motor features are *intrinsic* — a scalar per stroke, z-scored against the
> cluster later in §3. This keeps every feature in the same scoring framework.

### 2.0 `shapeDistance(stroke, clusterMeanForm)` — form conformance (§5.3.0)

The new backbone: *did you draw the motif, regardless of where/how big/what
orientation?* Position/scale/rotation-invariant, $1-Unistroke / Procrustes style.

**Normalize a stroke to a canonical form** (`shapeDescriptor`):

1. Arc-length **resample** to a fixed `N_SHAPE` points (e.g. 64) — kills speed/
   sampling-rate dependence; pure geometry remains.
2. **Translate** so the centroid is at the origin.
3. **Scale** so the RMS radius (or bounding box) is 1 → size-invariant.
4. **Rotate** to an indicative angle (angle from centroid to the first point → 0),
   OR resolve rotation per-comparison via Procrustes / Golden-Section search. Pick
   one and document it; indicative-angle is cheaper, Procrustes is more robust to
   the motif's symmetry.

The descriptor is the resulting `2·N_SHAPE` vector of normalized coords.

**The feature** = mean point-to-point distance between the stroke's descriptor and
the **cluster mean descriptor** (the elementwise mean of the procedural instances'
descriptors). Large = the stroke's form is an outlier vs the motif. *Wrong shape,
or a sloppy rendition, → large distance.*

```ts
/** Canonical, pos/scale/rotation-invariant point set for one stroke. */
export function shapeDescriptor(stroke: Stroke): number[];

/** Elementwise mean descriptor across the procedural instances (the motif's mean form). */
export function clusterMeanForm(procedural: Stroke[]): number[];

/** Feature value: distance from this stroke's form to the cluster mean form. */
export function shapeDistance(stroke: Stroke, meanForm: number[]): number;
```

> **One-sided.** Unlike motor features, shape is only suspicious when *large*
> (far from the motif). Being closer to the mean form than the average instance is
> not suspicious — it's a perfect forgery. So `shape` uses `normalizeZ(z)`, not
> `normalizeZ(|z|)` (§3).

> **Rotation caveat.** If a motif is rotationally symmetric (a circle, a figure-8),
> full rotation-invariance can collapse distinct orientations. The motif library
> (specs/04 / 05) flags which motifs are orientation-sensitive; for those, fix the
> indicative angle from the stroke's start→end direction rather than free rotation.

### 2.1 `jitter(stroke)` — micro-tremor (motor, §5.3.1)

1. Build a smoothed baseline of the raw points: moving average (window `w`, e.g.
   5) **or** Ramer–Douglas–Peucker (epsilon ∝ stroke length) — pick RDP for the
   baseline, MA as fallback; document the choice in code.
2. For each raw point, compute perpendicular distance to the nearest baseline
   segment (the residual).
3. Feature = `RMS(residuals) / strokeLength` (normalized so it's scale-free).

*Human → high residual; procedural → near-zero.*

```ts
export function jitter(stroke: Stroke): number;
```

### 2.2 Speed (§5.3.2) → two features

```ts
export function speedCV(stroke: Stroke): number;     // std(v)/mean(v), v = dist/dt per segment
export function speedPauses(stroke: Stroke): number; // normalized count of dt-spikes & direction reversals
```

- `v_i = dist(p[i-1], p[i]) / max(dt_i, ε)`.
- `speedCV` = coefficient of variation of `{v_i}`.
- `speedPauses` = (number of `dt_i` exceeding `mean+kσ`  +  number of velocity-sign
  reversals) / (#segments), so it's length-invariant.

### 2.3 `curvature(stroke)` (§5.3.3)

- Discrete curvature `κ_i` at each interior point (angle change / arc length).
- Feature = variance of the discrete derivative `Δκ_i`. *Human → noisy.*

```ts
export function curvature(stroke: Stroke): number;
```

### 2.4 `pressureVar(stroke)` (§5.3.4, optional, near-binary)

- If `stroke.pressure` is absent → return `NaN` (signals "unavailable"; excluded
  from scoring, see §3). Else variance of pressure samples.
- **Low weight, flavor only** — never the main difficulty axis (CLAUDE.md §5.3 note).

> **RESOLVED (§13.3): pressure is OFF in v1.** Per the W3C Pointer Events spec, a
> mouse reports `pressure === 0.5` while a button is held and `0` otherwise — zero
> real signal — and most touchscreens without a stylus report a constant value
> too. Only true styluses (Apple Pencil/Wacom) vary, which is a minority. So v1
> **does not score pressure and does not normalize the detector by input type**
> (normalizing would split the procedural calibration cluster for negligible
> gain). `pressure` stays out of every level's weighted set (see 04); the feature
> exists only for a future stylus mode. Capture pressure only when
> `pointerType !== 'mouse'` and it actually varies (see 01).

```ts
export function pressureVar(stroke: Stroke): number;
```

### 2.5 `overshoot(stroke, anchor?)` (§5.3.5, optional)

- Gap between the stroke endpoints and the expected connection anchor(s). If no
  anchor is provided by the scene → `NaN` (excluded).

```ts
export function overshoot(stroke: Stroke, anchor?: { start?: Point; end?: Point }): number;
```

### 2.6 `featureVector(stroke)`

Computes all features once. Because `shape` is relational, the vector builder
takes the cluster's mean form (precomputed once per scene, not per stroke).

```ts
export function featureVector(
  stroke: Stroke,
  meanForm: number[],
  anchor?: { start?: Point; end?: Point },
): FeatureVector;
```

> **Pre-processing contract:** features that need uniform spacing (curvature,
> jitter baseline) arc-length-resample an **internal copy** to a fixed step. The
> original timestamps are preserved separately for speed features. Resampling
> never escapes the function.

---

## 3. Scoring (CLAUDE.md §5.4)

```ts
/** Mean/std of one feature across the procedural instances (the calibration cluster). */
export function clusterStats(procedural: Stroke[], key: FeatureKey, meanForm: number[]): { mean: number; std: number };

/** z = (value − mean) / max(std, floor). NaN features excluded. */
export function zScore(value: number, mean: number, std: number, floor?: number): number;

/**
 * Map a z-score to [0, 1] suspicion via tanh(z / scale).
 *  - MOTOR features (jitter, speed, curvature): pass |z| — two-sided. The machine
 *    has a real signature, so deviating in EITHER direction (too clean OR too
 *    noisy) is suspicious. The machine's own instances sit at a small natural |z|.
 *  - SHAPE: pass z (clamped at 0 for z<0) — one-sided. Closer-than-average to the
 *    motif's mean form is a perfect forgery, never suspicious.
 * The caller selects which via TWO_SIDED[key].
 */
export function normalizeZ(z: number, scale?: number): number; // expects z >= 0; map of a non-negative magnitude

/** humanness(stroke) = Σ w_f · suspicion_f, with weights renormalized over the active, available features. */
export function scoreStroke(
  stroke: Stroke,
  procedural: Stroke[],
  config: DetectorConfig,
  meanForm: number[],
): StrokeScore;
```

Per-feature suspicion inside `scoreStroke`:

```
z_f      = zScore(value_f, mean_f, std_f, FEATURE_FLOORS[f])
mag_f    = TWO_SIDED[f] ? Math.abs(z_f) : Math.max(z_f, 0)
susp_f   = normalizeZ(mag_f)            // tanh(mag / SUSPICION_SCALE) ∈ [0, 1]
```

> **Why two-sided reverses v0.** The old detector was one-sided (`z ≤ 0 → 0`),
> built for "win by being clean." Under the imitation model the machine is *not*
> clean — it has a deliberate tremor/pace (the always-on signature, specs/04). A
> dead-straight constant-speed stroke now has a large *negative* motor z, which
> `|z|` correctly flags. Shape stays one-sided. This is the single change that
> makes "repeat the pattern" the win condition instead of "be smooth."

**std → 0 guard.** Even with intra-cluster variance, a feature's std can be tiny.
Use `std' = max(std, FEATURE_FLOORS[key])`, a small per-feature epsilon at the
feature's natural human-vs-machine scale, so a normal forgery sits ~1–2 std out,
not infinitely far. Document each floor and cover it in tests. These floors,
`SUSPICION_SCALE`, and `T` are the primary calibration targets (§6.5).

**Feature availability.** A feature returning `NaN` (no pressure, no anchor) is
dropped from that round and weights are renormalized over the remaining active
features, so `humanness` stays in `[0, 1]` regardless of input type.

---

## 4. The verdict (CLAUDE.md §5.4 / §5.5)

```ts
export class AlgorithmicDetector implements Detector {
  evaluate(scene: Scene, config: DetectorConfig): Verdict;
}
```

Algorithm:

```
strokes    = [...scene.procedural, scene.humanStroke]   // human = last index
meanForm   = clusterMeanForm(scene.procedural)          // motif mean form, computed ONCE
scores     = strokes.map(s => scoreStroke(s, scene.procedural, config, meanForm))
guessIndex = argmax_i scores[i].humanness               // the stroke that least fits the cluster
top1, top2 = two highest humanness values
confidence = top1                       // v1; optionally (top1 − top2) separation
caughtHuman = guessIndex === strokes.length - 1

// Player win (§5.4): the detective isn't sure enough, OR a machine instance was a bigger outlier.
playerWon = confidence < config.threshold || !caughtHuman

// Player score (§5.5):
humannessNorm = scores[humanIndex].humanness
margin        = clamp(config.threshold − humannessNorm, 0, 1)
playerScore   = round(margin * 100)
if (!caughtHuman && /* a machine instance out-scored the human */) playerScore += CAMO_BONUS
if (caughtHuman && confidence >= threshold) playerScore = 0   // caught → 0, streak breaks
```

> **Calibration note:** every instance is scored against the cluster *including
> itself*; that's intentional — it measures how each instance sits within its own
> family, which is exactly the false-candidate pool the intra-cluster variance
> feeds (CLAUDE.md §7). The shape `meanForm` likewise includes all instances.

---

## 5. Public surface (`src/detector/index.ts`)

```ts
export type { Point, Stroke, Scene } from "./types.ts";
export type { FeatureKey, FeatureVector, StrokeScore, Verdict, DetectorConfig, Detector };
export { TWO_SIDED };
export { shapeDescriptor, clusterMeanForm, shapeDistance };
export { featureVector, jitter, speedCV, speedPauses, curvature, pressureVar, overshoot };
export { clusterStats, zScore, normalizeZ, scoreStroke };
export { AlgorithmicDetector };
```

---

## 6. Synthetic-stroke test plan (the separability validation)

This is the heart of the spec. Goal: **prove each feature, and the combined
score, separates procedural strokes from human strokes** — before any UI exists.
All tests run in `environment: 'node'` (no DOM).

### 6.1 Stroke generators (test fixtures, `src/detector/__fixtures__/`)

```ts
// A motif INSTANCE: the day's motif, sampled with the machine's motion signature
// (deliberate tremor + pace), then transformed (translate/scale/rotate) and given
// small per-instance variance. N of these form the calibration cluster.
function makeMotifInstance(opts: {
  motif: MotifKind;     // "wave" | "w" | "spiral" | ...  (specs/04, 05)
  samples: number;
  signature: { tremorAmp: number; speed: number; speedVar: number }; // shared across the day
  transform: { tx: number; ty: number; scale: number; rotation: number };
  variance: number;     // per-instance jitter around the shared signature/shape
  seed: number;         // deterministic PRNG (reuse 05-daily-seed mulberry32)
}): Stroke;

// Convenience: build a full N-instance cluster for one motif + signature.
function makeMotifCluster(opts: { motif: MotifKind; count: number; seed: number }): Stroke[];

// Recorded human: real captured strokes saved as JSON fixtures (mouse + touch).
// Collected via dev mode (§7). Stored as Point[] arrays under __fixtures__/human/.
function loadHumanStrokes(): Stroke[];

// Synthetic human forging a motif (for CI without recordings): the motif shape +
// a HUMAN tremor model — additive band-limited noise ~8–12 Hz (§5.3.6) + speed
// variation + micro-pauses. `fidelity` controls how well it matches the machine
// signature (low fidelity → caught, high fidelity → blends in).
function makeSyntheticHumanForgery(opts: {
  motif: MotifKind;
  fidelity: number;    // 0 = naive human, 1 = near-perfect forger
  seed: number;
}): Stroke;
```

> Real recorded humans are the gold standard; `makeSyntheticHumanStroke` exists
> so CI is self-contained and doesn't depend on committed recordings. Both are
> tested.

### 6.2 Per-feature separability tests

**Shape (`shapeDistance`):**

- [ ] **Invariance:** the descriptor of a stroke is unchanged (within ε) under
      translation, uniform scaling, and — for non-symmetric motifs — rotation.
- [ ] **Right vs wrong motif:** `shapeDistance(correct-motif-forgery) ≪
      shapeDistance(different-shape)` across ≥ 50 seeded pairs.
- [ ] **Sloppy rendition:** a low-fidelity forgery of the right motif has a larger
      shape distance than a high-fidelity one (monotone in fidelity).
- [ ] **Cluster membership:** each machine instance's distance to `clusterMeanForm`
      is small and tightly distributed (defines the std the human is judged against).

**Motor features `f` in {jitter, speedCV, speedPauses, curvature} — TWO-SIDED:**

- [ ] **Signature is the target, not zero:** with the machine's always-on
      signature, `f(machine instance) > 0`. A naive human (`fidelity 0`) lands
      OUTSIDE the cluster (large `|z|`); a high-fidelity forger lands inside.
- [ ] **Both directions caught:** a too-clean stroke (dead-straight, constant
      speed → `z < 0`) and a too-noisy stroke (`z > 0`) BOTH yield high `|z|`
      suspicion. Assert `normalizeZ(|z|)` is high at both extremes and low near the
      cluster mean.
- [ ] **Scale invariance:** scaling a stroke's coordinates ×2 leaves `f` ~unchanged.
- [ ] **Separation margin:** report `(|mean_z(naive-human)|) ` vs the machine
      instances' mean `|z|`, and assert the gap exceeds a per-feature threshold.
      Printed for calibration.

### 6.3 z-score / scoring tests

- [ ] `zScore` handles `std = 0` via the floor without producing `Infinity`.
- [ ] **Two-sided:** for a motor feature, `normalizeZ(|z|)` for a stroke far BELOW
      the cluster mean (too clean) is as high as for one far ABOVE it (too noisy);
      a stroke at the mean scores ~0.
- [ ] **One-sided shape:** a stroke closer than average to the mean form scores ~0
      on `shape` (not penalized); only far-from-form is suspicious.
- [ ] A high-fidelity forgery (right shape + matched signature) is NOT caught when
      `T` is at its tuned value; a naive human (right shape, human dynamics) IS.
- [ ] `humanness ∈ [0, 1]` for all inputs, including pressure/anchor absent.
- [ ] Weight renormalization: dropping `pressure` (NaN) keeps total weight = 1.

### 6.4 End-to-end verdict tests (per tier, using 04-difficulty motifs)

The detector config is **constant** across tiers (§7); only the motif changes.

- [ ] **Easy motif (simple wave):** a careful human forgery wins; a wrong-shape or
      wildly-off-signature stroke is caught.
- [ ] **Hard motif (spiral):** a forgery with the right shape but human-default
      dynamics (too clean OR too shaky vs the signature) is caught on the motor
      axis; a forgery that matches both shape and signature wins (`guess ≠ human`
      or `confidence < T`).
- [ ] **Shape gate:** a perfectly machine-like *motion* on the WRONG shape is
      caught on the shape axis (you can't win by ignoring the motif).
- [ ] **Determinism:** same `Scene` + same `DetectorConfig` → identical `Verdict`
      across 100 runs (deep-equal).
- [ ] **No-DOM:** the whole suite passes with `environment: 'node'` and never
      references `window`/`document`/`canvas`.

### 6.5 Calibration harness (dev, not CI-gating)

A script/test that prints, per level, the distribution of `humanness` for the
human fixtures vs procedurals, plus the implied false-accuse / false-clear rates
at the configured `T`. Used to tune `weights` and `T` in 04-difficulty before
release (CLAUDE.md §7 "Calibration", §13.4). Marked `it.skip` or behind an env
flag so it doesn't gate CI.

> **RESOLVED (§13.4): sample size.** Because the detector self-calibrates against
> each scene's procedural cluster, human samples only set `T` and `weights` (they
> don't train a model), so the requirement is modest. **Minimum** ~30 strokes per
> input type (CLT rule of thumb); **target ~50–100 total** spanning **≥5 people**
> and **both mouse + touch**, replayed across a spread of seeds. Harvest via dev
> mode (§7) into `__fixtures__/human/`, then pick `T` at the desired false-accuse
> rate from the distributions above. It's an honor-system casual game — don't
> over-engineer this.

---

## 7. Dev-mode feature logging (CLAUDE.md §7 "Calibration")

A hidden mode (query flag, e.g. `?dev=1`) that, after a real stroke, logs its
`FeatureVector` and the per-feature z-scores to the console / a copyable blob, so
human samples can be harvested into `__fixtures__/human/` and weights/thresholds
tuned. Not competitively secure (client-side, public seed) — fine for a casual
honor-system game.

## Acceptance criteria (summary)

- [ ] All feature functions pure, no DOM, no deps, individually unit-tested.
- [ ] Shape feature (pos/scale/rotation-invariant, one-sided) + motor features
      (two-sided `|z|`); `TWO_SIDED` map drives the split.
- [ ] Self-calibration via z-scores against the motif cluster only.
- [ ] `std→0` floor prevents false infinities.
- [ ] Verdict matches the §5.4 win condition and §5.5 scoring exactly.
- [ ] Synthetic separability suite (§6) green, with reported margins ≥ thresholds.
- [ ] Determinism: identical input → identical verdict.
- [ ] `Detector` interface in place so v2 (VLM) plugs in without a rewrite.
