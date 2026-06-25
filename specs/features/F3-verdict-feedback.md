# F3 — Verdict feedback: "what gave you away" + threshold tick

> Expands CLAUDE.md §5 (the detector's per-feature z-scores) and §15 (learnable
> daily loop). Owns: a pure selector in `src/detector/` (reads the `z` /
> `features` the verdict **already computes and discards**) + presentation in
> `VerdictPanel.tsx`. **No detector math change.**

---

## 0. Problem

`scoreStroke` computes a full per-feature `z` vector for every stroke and the
verdict keeps `scores[]`, but the UI shows only a single confidence percentage.
The player learns nothing transferable → no reason hypothesis-test tomorrow. A
daily game lives on "every result teaches" (Wordle).

Also: confidence `71%` is meaningless without seeing the **line** (`T`) it was
measured against. "So close" is only a feeling if you can *see* close.

## 1. Goal

1. **Dominant feature readout:** tell the player which feature most drove the
   accusation against the human stroke ("Your hand trembled 2.3× more than the
   machine").
2. **Threshold tick:** draw a marker at `T` on the confidence meter so every
   result is a visible near-miss or comfortable clear.

Both reuse data already in the `Verdict`. Cheap, no new systems.

## 2. Dominant feature (pure)

Add to `src/detector/detector.ts` (or a sibling `insight.ts`), unit-tested:

```ts
export type Insight = {
  feature: FeatureKey;        // top contributor for the HUMAN stroke
  contribution: number;       // weight·normalizeZ(z), in [0,1]
  ratio: number;              // featureValue(human) / clusterMean — "2.3×" (NaN-safe)
};

export function humanInsight(verdict: Verdict, config: DetectorConfig, /* cluster stats */): Insight | null;
```

- Operate on `verdict.scores[humanIndex]` (last). For each active feature,
  `contribution = weight · normalizeZ(z[f])`; pick the max.
- `ratio` needs the cluster mean for that feature → compute once in `evaluate`
  and stash on the verdict (extend `Verdict` with an optional
  `clusterMean?: Partial<Record<FeatureKey, number>>`), OR recompute via
  `clusterStats` in the selector. Prefer stashing it in `evaluate` to keep the
  selector dependency-free.
- Returns `null` when no active feature has positive contribution (e.g. the
  player out-machined the machine on every axis — itself a flex, surface a
  "nothing gave you away" line).

### Feature → human-readable label

`feature` maps to an i18n key, NOT a raw key name:

| FeatureKey | i18n key | EN label |
|---|---|---|
| jitter | `feature.jitter` | tremor |
| speedCV | `feature.speedCV` | uneven pace |
| speedPauses | `feature.speedPauses` | pauses & reversals |
| curvature | `feature.curvature` | shaky curves |
| overshoot | `feature.overshoot` | overshot endpoints |
| pressure | `feature.pressure` | pressure |

Verdict line template (i18n, interpolated):
`feature.tell` = `What gave you away: {label} ({ratio}× the machine).`
On a win, optionally show the *closest* feature as a "what almost caught you"
coaching line — same selector, softer copy. On `null`, `feature.clean` = "Nothing
gave you away. Machine-clean."

## 3. Threshold tick

Pure presentation in `VerdictPanel.tsx`. `T` reaches the panel via props (from the
level config; thread it through like `verdict`). On the existing meter:

- Render an absolutely-positioned 2px vertical tick at `left: T*100%`.
- Label it subtly (`T` / a tiny "límite" caption) on hover/title.
- The fill stays `confidence`; the visual gap between the fill edge and the tick
  is the margin. Color stays emerald (won) / red (caught).

Accessibility: tick has `aria-hidden`; the numeric `confidence%` already conveys
the value. Respect existing layout (`compact`).

## 4. L1 note

At L1 only `jitter` is active, so the dominant feature is always "tremor" — still
useful (it teaches the core skill). The readout earns its keep at L2/L3 where it
disambiguates which axis sank you. Optionally suppress the readout on L1 if it
feels redundant (config flag, not required for v1).

## 5. Tests (`src/detector/insight.test.ts`)

1. Picks the feature with the largest weighted contribution (construct a verdict
   where `speedCV` dominates → returns `speedCV`).
2. `ratio` is NaN-safe (cluster mean 0 → ratio omitted/Infinity guarded).
3. Returns `null` when the human is below the cluster on every active feature.
4. Determinism.

## 6. Out of scope

- Full stacked per-feature bar chart (future polish; F3 ships the single dominant
  readout + the tick).
- The "closest decoy" highlight (that's F4's accused-stroke highlight territory).
