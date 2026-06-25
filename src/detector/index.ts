// Detector — pure TS, no DOM, no dependencies. The project core (spec 03).
// Scores every stroke for "humanness" via self-calibrated z-scores against the
// day's procedural cluster (CLAUDE.md §5).

export type {
  Point,
  Stroke,
  Scene,
  Anchor,
  FeatureKey,
  FeatureVector,
  ZVector,
  StrokeScore,
  Verdict,
  DetectorConfig,
  Detector,
} from "./types.ts";
export { FEATURE_KEYS, TWO_SIDED } from "./types.ts";

export {
  shapeDescriptor,
  clusterMeanForm,
  shapeDistance,
  jitter,
  speedCV,
  speedPauses,
  curvature,
  pressureVar,
  overshoot,
  featureVector,
  featureValue,
} from "./features.ts";

export {
  clusterStats,
  zScore,
  normalizeZ,
  suspicionMagnitude,
  scoreStroke,
  FEATURE_FLOORS,
} from "./scoring.ts";

export { AlgorithmicDetector, CAMO_BONUS } from "./detector.ts";

export { verdictTone, type VerdictTone } from "./flavor.ts";

export { humanInsight, suspectOrder, accusedKind, type Insight, type AccusedKind } from "./insight.ts";
