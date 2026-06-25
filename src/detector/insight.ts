// F3 — "what gave you away". Pure selector over data the verdict already carries
// (per-feature z + cluster means). DOM-free, deterministic. The detector math is
// untouched. See specs/features/F3-verdict-feedback.md.

import type { DetectorConfig, FeatureKey, Verdict } from "./types.ts";
import { normalizeZ, suspicionMagnitude } from "./scoring.ts";

export type Insight = {
  /** The active feature that most drove suspicion of the human stroke. */
  feature: FeatureKey;
  /** weight · normalizeZ(z) in [0,1] — its share of the humanness. */
  contribution: number;
  /** human value / cluster mean (e.g. 2.3 → "2.3× the machine"); NaN if undefined. */
  ratio: number;
};

/**
 * Top contributing feature for the HUMAN stroke (always last in the scored list).
 * Uses the same two-sided/one-sided magnitude as scoring: for motor features a
 * tell can be "too clean" (negative z) as much as "too noisy". Returns null when
 * the human matched the cluster on every active feature (nothing to flag).
 */
export function humanInsight(verdict: Verdict, config: DetectorConfig): Insight | null {
  const score = verdict.scores[verdict.scores.length - 1];
  if (!score) return null;

  let best: Insight | null = null;
  for (const key of config.activeFeatures) {
    const weight = config.weights[key] ?? 0;
    if (weight <= 0) continue;
    const z = score.z[key];
    if (z === undefined || Number.isNaN(z)) continue;
    const contribution = weight * normalizeZ(suspicionMagnitude(key, z));
    if (contribution <= 0) continue; // matched the machine on this feature → not a tell

    const mean = verdict.clusterMean?.[key];
    const value = score.features[key];
    const ratio = mean !== undefined && Math.abs(mean) > 1e-9 ? value / mean : NaN;

    if (!best || contribution > best.contribution) best = { feature: key, contribution, ratio };
  }
  return best;
}

/**
 * F4 — what the accusation box MEANS, by outcome (the box always sits on
 * `guessIndex`, the detective's top suspect; this picks its colour/semantics):
 *   caught    — you lost; it committed to your stroke (red).
 *   framed    — you won; it accused a decoy instead (emerald, the flex).
 *   suspected — you won, but its top suspect WAS you; it just wasn't sure enough
 *               to accuse (amber). Never red — a red box on a win reads as "caught".
 */
export type AccusedKind = "caught" | "framed" | "suspected";

export function accusedKind(verdict: Verdict): AccusedKind {
  if (!verdict.playerWon) return "caught";
  return verdict.caughtHuman ? "suspected" : "framed";
}

/**
 * F4 — stroke indices ordered most → least suspicious. Drives the scan/hesitation
 * reveal (the detective lingers on the real top suspects). Stable & deterministic.
 */
export function suspectOrder(verdict: Verdict): number[] {
  return verdict.scores
    .map((s, i) => ({ i, h: s.humanness }))
    .sort((a, b) => b.h - a.h || a.i - b.i)
    .map((x) => x.i);
}
