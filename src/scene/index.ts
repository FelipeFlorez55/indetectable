// Scene — deterministic procedural generation from the daily UTC seed (spec 05).
// Same UTC day → same scene for everyone, no server (CLAUDE.md §8).

export { xmur3, mulberry32, rngFromKey, uniform, randInt, pick } from "./prng.ts";
export { utcDayIndex, seedKey, dailyRng, msUntilNextUtcDay } from "./seed.ts";
export {
  motifCurve,
  dailySignature,
  buildMotifInstance,
  generateProceduralStrokes,
  buildSceneSpec,
  buildPracticeSceneSpec,
  DEFAULT_SCENE,
} from "./generate.ts";
export type { SceneSpec, MotifKind, Signature, Transform, MotifInstanceOptions } from "./generate.ts";
