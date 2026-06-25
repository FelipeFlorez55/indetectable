// The verdict (spec 03 §4). v1 algorithmic detective. Implements the pluggable
// `Detector` interface so the v2 VLM detector drops in without a rewrite (§14).

import type {
  Anchor,
  Detector,
  DetectorConfig,
  FeatureKey,
  Scene,
  StrokeScore,
  Verdict,
} from "./types.ts";
import { clusterMeanForm } from "./features.ts";
import { clusterStats, scoreStroke } from "./scoring.ts";

/** Bonus when a machine instance out-scored the human (perfect camouflage, §5.5). */
export const CAMO_BONUS = 20;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export class AlgorithmicDetector implements Detector {
  evaluate(scene: Scene, config: DetectorConfig, anchor?: Anchor): Verdict {
    // Human stroke is always the last index. The caller knows the truth; the
    // detector only computes a guess and compares at the end (§14 honesty rule).
    const strokes = [...scene.procedural, scene.humanStroke];
    const humanIndex = strokes.length - 1;

    // Motif mean form computed ONCE for the relational `shape` feature (spec 03 §4).
    const meanForm = clusterMeanForm(scene.procedural);

    const scores: StrokeScore[] = strokes.map((s) =>
      scoreStroke(s, scene.procedural, config, anchor, meanForm),
    );

    let guessIndex = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i].humanness > scores[guessIndex].humanness) guessIndex = i;
    }

    const confidence = scores[guessIndex].humanness;
    const caughtHuman = guessIndex === humanIndex;

    // Win: the detective isn't sure enough, OR it accused a decoy (§5.4).
    const playerWon = confidence < config.threshold || !caughtHuman;

    // Invisibility (0..100), ALWAYS computed so progress shows even on a loss.
    // 50 = the catch line (your humanness == T). Below 50 you're caught, above 50
    // your own stroke would clear the bar. This is the player-facing meter.
    const humanness = scores[humanIndex].humanness;
    const invisibility = Math.round(clamp01(1 - humanness / (2 * config.threshold)) * 100);

    // Score = invisibility, plus a camouflage bonus for framing a decoy. The
    // STREAK still breaks on a real catch (caught), but the SCORE always reflects
    // how close you got — a near miss is no longer a flat 0.
    let playerScore = invisibility;
    if (playerWon && !caughtHuman) playerScore = Math.min(100, playerScore + CAMO_BONUS);

    // Cluster means for the active features → F3 "X× the machine" readout.
    const clusterMean: Partial<Record<FeatureKey, number>> = {};
    for (const key of config.activeFeatures) {
      clusterMean[key] = clusterStats(scene.procedural, key, anchor, meanForm).mean;
    }

    return { guessIndex, confidence, caughtHuman, scores, playerWon, playerScore, invisibility, clusterMean };
  }
}
