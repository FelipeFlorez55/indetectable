# 04 — Difficulty

> Expands CLAUDE.md §7. Owns: the difficulty config consumed by the detector
> (03) and the scene generator (05). Pure data + pure functions, no DOM.

## Goal

Move difficulty on **one knob: motif complexity** (RESOLVED §13.2). The detector
is **constant** — same features, same weights, same threshold `T`, every day. What
changes is *which motif* the player must forge, and a harder motif raises **both**
the shape axis and the motion axis at once:

- **Shape** — more corners/cusps/direction changes are harder to reproduce, so the
  shape z-score climbs naturally.
- **Motion** — a complex path is harder to draw *while also* matching the machine's
  pace + tremor, so the motor features get harder in lockstep.

Difficulty should feel like *"today's shape is trickier to forge,"* never *"the
detective got stricter."* The detective never changes; the canvas does.

> **Why not the old 3-knob model.** v0 ramped *features looked at* + `T` +
> `decoyJitter` per level. That made level progression read as "the detective gets
> pickier" and required three things to stay mutually fair. A single complexity
> knob is simpler, harder to mis-tune, and matches the imitation game: there's just
> *more to get right*, not a stricter judge.

## The constant detector config

All tiers share one config. The features are always on; shape is one-sided, motor
features are two-sided (see [03-detector §3](./03-detector.md)).

```ts
import type { FeatureKey, DetectorConfig } from "../detector/index.ts";

// The ONE detector config, used every day. Numbers are initial guesses; the
// calibration harness (03 §6.5) tunes weights, T, SUSPICION_SCALE, FEATURE_FLOORS,
// and the signature amplitudes (05) against human fixtures before release.
export const DETECTOR_CONFIG: DetectorConfig = {
  activeFeatures: ["shape", "jitter", "speedCV", "speedPauses", "curvature"],
  weights: {
    shape: 0.40,        // "did you draw the motif" is the backbone
    jitter: 0.25,       // micro-tremor signature
    speedCV: 0.15,
    speedPauses: 0.10,
    curvature: 0.10,
  },
  threshold: 0.33,      // T — single tuned constant (not per-tier; calibrated, 03 §6.5)
};
// pressure + overshoot stay out of the weighted set in v1 (flavor only, §13.3).
```

## The always-on motion signature

The machine's "handwriting" — a deliberate, consistent **tremor amplitude + pace**
carried by every motif instance — is what the old `decoyJitter` becomes: no longer
a per-level knob but a **permanent property** of the procedural strokes, generated
deterministically from the day's seed (see [05-daily-seed](./05-daily-seed.md)).

It does two jobs:

1. Gives the detective believable false candidates among its own instances (a
   machine instance can out-score the human → player wins, §5.4).
2. Gives the player a concrete **imitation target** — the game is "forge this
   machine's handwriting," winnable on a mouse, never "be a flawless machine."

The signature has **intra-cluster variance**: instances are similar but not
identical, so each feature has a real mean+std (the target *zone* with width the
player aims for). Amplitudes are tuned constants, the same shape of distribution
every day; only the *motif* changes by tier.

## Tiers = motif complexity

```ts
import type { MotifKind } from "../scene/index.ts";

export type Level = 1 | 2 | 3; // complexity tier; "Fine" (FFT) is v3, out of scope

export type LevelConfig = {
  level: Level;
  label: string;            // "Easy" | "Medium" | "Hard"
  motifs: MotifKind[];      // pool the day's seed picks ONE from
  feel: string;             // design intent, for docs / dev overlay
};

export const LEVELS: Record<Level, LevelConfig> = {
  1: {
    level: 1, label: "Easy",
    motifs: ["line", "arc", "wave"],
    feel: "One simple curve. Forgiving to forge.",
  },
  2: {
    level: 2, label: "Medium",
    motifs: ["w", "zigzag", "ess", "loop"],
    feel: "A real shape with corners; match its rhythm.",
  },
  3: {
    level: 3, label: "Hard",
    motifs: ["spiral", "figure8", "squiggle"],
    feel: "Many direction changes — nail the form AND the tremor.",
  },
};
```

> The motif pool per tier lives here as the difficulty surface; the geometry of
> each `MotifKind` lives in the scene generator ([05](./05-daily-seed.md)). Adding
> a motif = extend the pool + add its parametric form; nothing else changes.

## Functions

```ts
/**
 * The tier for a given day — RESOLVED (§13.2): deterministic rotation by weekday
 * (NYT-crossword-style ramp), NOT scaling with the player's streak (which would
 * break fair comparison). Same day → same tier for everyone. Practice mode (11)
 * may pick any tier freely.
 */
export function levelForDay(dayIndex: number): Level;

/** The constant detector config (tier-independent). Kept as a function for a stable API. */
export function toDetectorConfig(level?: Level): DetectorConfig; // returns DETECTOR_CONFIG
```

### Weekly rotation (RESOLVED §13.2)

`dayIndex 0` = 1970-01-01 = **Thursday**, so weekday `= (dayIndex + 4) % 7`
(0 = Sunday). The ramp puts the hardest motifs on the weekend, when social traffic
peaks and the "Undetectable 🫥" / "Caught you" moment is most shareable — fair
because every tier is *winnable by imitation*, just with a trickier shape.

| Weekday | Tier |
|---|---|
| Mon, Tue | 1 Easy |
| Wed, Thu | 2 Medium |
| Fri, Sat, Sun | 3 Hard |

```ts
const WEEKDAY_TO_LEVEL: Record<number, Level> = {
  0: 3, // Sun
  1: 1, // Mon
  2: 1, // Tue
  3: 2, // Wed
  4: 2, // Thu
  5: 3, // Fri
  6: 3, // Sat
};
export function levelForDay(dayIndex: number): Level {
  return WEEKDAY_TO_LEVEL[(((dayIndex + 4) % 7) + 7) % 7];
}
```

> Rotation is the single most tunable knob: if calibration (03 §6.5) shows weekend
> Hard motifs are too punishing for casual players, soften the mapping or move a
> motif to an easier tier — the tables are the only thing that changes; fairness is
> preserved (the detector is constant either way).

## Acceptance criteria

- [ ] `DETECTOR_CONFIG` is the single source of detector truth; the detector reads
      it and never receives per-tier feature/threshold variants.
- [ ] `toDetectorConfig` returns that constant regardless of tier.
- [ ] Active weights are renormalized to sum 1 over available features (in the
      detector, 03 §3).
- [ ] `LEVELS` motif pools are non-empty and disjoint enough that tiers feel
      distinct; complexity is monotone across tiers (asserted by a test).
- [ ] `levelForDay` is deterministic and pure.
- [ ] Fairness invariant (from 03 §6.4): for any tier's motif, with the day's
      always-on signature, a high-fidelity forgery is not caught at `T` while a
      naive human is — verified against fixtures.

## Out of scope

- The "Fine" FFT level (CLAUDE.md §7 / §5.3.6) is v3.
- Streak-scaling difficulty is explicitly rejected for v1 fairness.
- Motif geometry & the signature generator → [05-daily-seed](./05-daily-seed.md).
