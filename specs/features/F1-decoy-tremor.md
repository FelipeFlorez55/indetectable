# F1 — High-frequency decoy tremor (keystone)

> Expands CLAUDE.md §7 (`decoyJitter`) and specs/04-difficulty + specs/05-daily-seed.
> Owns: `src/scene/generate.ts` (procedural noise). **No detector change** — the
> detector reads `jitter()` verbatim. Deterministic, seed-derived, pure.

---

## 0. Problem

The spec's central fantasy (CLAUDE.md §7) is that at higher levels the machine
strokes carry deliberate tremor, so the game becomes *"imitate how much THIS
machine trembles today"* — and the detective can be **fooled into accusing a
procedural decoy** (the `!caughtHuman` win + `CAMO_BONUS`, spec 03 §4 / §5.5).

**Today this is dormant.** `makeNoise` builds the decoy offset from 4 sinusoids at
`freq ∈ [1,6]` over the whole stroke. The `jitter` feature measures the residual
of the raw points against a **Savitzky-Golay** baseline (features.ts §2.1). An SG
filter *follows* a 1–6 cycle wave almost perfectly, so the residual ≈ 0. Decoys
therefore score ~0 on the backbone feature and are **never** the most-suspicious
stroke. Verified empirically: `avgDecoyHumanness ≈ 0.0–0.05` even at L3
(`decoyJitter = 0.45`).

So `decoyJitter` currently only bends the stroke's **shape** (low-freq waviness),
never its **tremor** (high-freq residual) — the wrong signal.

## 1. Goal

Make `decoyJitter` inject **high-frequency** perpendicular tremor that the SG
baseline cannot track, so procedural decoys register real `jitter` and become
believable false suspects. Keep everything deterministic from the seed and keep
the existing low-frequency shape waviness (it's a fine *visual* variety knob).

## 2. Design

Split the decoy offset into two bands, both scaled by `decoyJitter`:

- **Shape band (existing):** `makeNoise` low-freq sinusoids (`freq ∈ [1,6]`).
  Keep as-is — bends the curve, SG follows it, contributes ~0 jitter. Visual
  variety only.
- **Tremor band (new):** high-frequency perpendicular wobble the SG baseline
  cannot follow → shows up as `jitter` residual. This is what makes a decoy look
  hand-drawn to the detector.

### 2.1 The tremor function

```ts
const DECOY_TREMOR_AMP = 1.8; // px of perpendicular tremor at decoyJitter = 1
const TREMOR_MODES = 3;       // few high-freq sinusoids (deterministic, smooth-ish)
const TREMOR_FREQ = [18, 27, 41]; // cycles over the whole stroke (well above SG window)
```

Build a band-limited high-frequency wobble in roughly `[-1, 1]`:

```ts
function makeTremor(rng: () => number): (u: number) => number {
  const modes = TREMOR_FREQ.map((f) => ({
    freq: f * uniform(rng, 0.85, 1.15), // jitter the freq so days differ
    phase: uniform(rng, 0, Math.PI * 2),
    amp: uniform(rng, 0.6, 1),
  }));
  const norm = modes.reduce((a, m) => a + m.amp, 0) || 1;
  return (u) =>
    modes.reduce((a, m) => a + m.amp * Math.sin(2 * Math.PI * m.freq * u + m.phase), 0) / norm;
}
```

> **Why sinusoids, not `rng()` white noise:** must stay deterministic per seed AND
> survive arc-length resampling without aliasing chaos. A few high-freq sinusoids
> at >15 cycles are already far above the SG smoothing window (so they survive as
> residual) while remaining reproducible. Frequencies must stay **below Nyquist**
> for the sample count: procedural strokes use `samples ∈ [48,80]`, Nyquist ≈
> 24–40 cycles. 41 is borderline at 48 samples — clamp the top mode to
> `min(freq, samples * 0.45)` inside `buildProceduralStroke` to avoid aliasing.

### 2.2 Apply in `buildProceduralStroke`

Add the tremor offset to the existing perpendicular space offset, same local
normal:

```ts
const tremor = makeTremor(rng);
// inside the per-point loop, alongside the existing `off`:
const tremorOff = opts.decoyJitter * DECOY_TREMOR_AMP * tremor(u);
const totalOff = off + tremorOff; // off = existing low-freq shape wiggle
pts.push({ x: clean[i].x + nx * totalOff, y: clean[i].y + ny * totalOff, t });
```

Draw the tremor rng **after** the existing `spaceNoise`/`timeNoise` so prior
seed-dependent output is unchanged where `decoyJitter = 0` (L1 stays byte-identical
— see §4).

## 3. Calibration target

After implementing, re-run the diagnostic (synthetic human vs procedural cluster).
Targets:

- **L1** (`decoyJitter = 0`): decoys still ~0 (no tremor band). Unchanged.
- **L2** (`0.15`): `avgDecoyHumanness` lifts to ~0.10–0.20 — a few plausible
  suspects, but the human is usually still top.
- **L3** (`0.45`): `avgDecoyHumanness` ~0.25–0.45 and **at least sometimes a decoy
  out-scores a careful human** → the `!caughtHuman` win fires for a player who
  matches the tremor band. This is the success criterion for the feature.

`DECOY_TREMOR_AMP` is the tuning knob; adjust so the L3 number lands in range
without making decoys beat the human *every* time (that would be unfair the other
way). Thresholds in `levels.ts` may need a small re-tune after this lands.

## 4. Determinism / fairness invariants

- Everything is seed-derived → the day's scene stays byte-identical worldwide
  (CLAUDE.md §8, §16). No `Date.now`/`Math.random`.
- **L1 must not change** (`decoyJitter = 0` ⇒ `tremorOff = 0`). The added rng
  draws shift the stream, so guard the L1-identical claim with a test, or accept
  the L1 scene changes once and re-snapshot (L1 has no decoys to break, so a
  shifted-but-still-clean scene is acceptable — document which choice was made).

## 5. Tests (`src/scene/scene.test.ts`, `src/detector/detector.test.ts`)

1. **Decoys gain jitter with decoyJitter.** `jitter(decoy@0.45) > jitter(decoy@0)`
   for the same seed/kind.
2. **Determinism.** Same seed + `decoyJitter` → identical points (deep-equal).
3. **Decoy becomes a believable suspect.** Build an L3 scene; assert the max
   procedural `humanness` is meaningfully > 0 (e.g. > 0.15).
4. **Misdirection can fire.** A careful synthetic human (low tremor) in an L3
   scene with jittery decoys: assert there exist seeds where `!caughtHuman` (the
   detective accuses a decoy). Statistical — sample N seeds, assert > 0.
5. **No aliasing blowup.** `jitter(decoy)` stays finite and bounded for all kinds
   at `samples = 48` (the low end).

## 6. Out of scope

- Detector changes. The detector already reads `jitter()`.
- New difficulty knob. Reuse `decoyJitter`.
- The live "tremor budget" HUD (future; see the depth analysis) — F1 only makes
  the band *exist*, not *visible while drawing*.
