// F2 — Antagonist voice: map a verdict to a "tone" message key. Pure, DOM-free,
// deterministic. Selection is locale-independent (CLAUDE.md §16); the words live
// in i18n. See specs/features/F2-antagonist-voice.md.

import type { Verdict } from "./types.ts";

export type VerdictTone =
  | "caught.instant" // caught, confidence far above T
  | "caught.clear" // caught, comfortably above T
  | "caught.close" // caught, just above T
  | "won.hair" // won, humanness just under T (squeaked through)
  | "won.clean" // won, comfortably under T
  | "won.flawless" // won, machine-perfect (humanness ~0)
  | "won.decoy"; // won because a DECOY was accused (!caughtHuman) — the flex

// Band edges (calibration knobs, in [0,1] humanness/confidence units).
const CAUGHT_INSTANT = 0.25; // confidence − T above this → instant kill
const CAUGHT_CLEAR = 0.08; // confidence − T above this → clear catch
const WON_FLAWLESS = 0.05; // human humanness below this → flawless
const WON_HAIR = 0.06; // T − human humanness below this → by a hair

/** The human stroke is always the last in the scored list (detector.ts). */
function humanHumanness(v: Verdict): number {
  return v.scores[v.scores.length - 1]?.humanness ?? 0;
}

/**
 * Deterministic outcome → tone. `won.decoy` takes priority over the humanness
 * bands: framing the machine is its own headline regardless of how clean you were.
 */
export function verdictTone(v: Verdict, threshold: number): VerdictTone {
  if (!v.playerWon) {
    const margin = v.confidence - threshold; // how far over the line it was
    if (margin > CAUGHT_INSTANT) return "caught.instant";
    if (margin > CAUGHT_CLEAR) return "caught.clear";
    return "caught.close";
  }
  if (!v.caughtHuman) return "won.decoy";
  const h = humanHumanness(v);
  if (h < WON_FLAWLESS) return "won.flawless";
  if (threshold - h < WON_HAIR) return "won.hair";
  return "won.clean";
}
