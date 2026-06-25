# 01 — Canvas Capture

> Expands CLAUDE.md §5.1 and §6.2. Owns: `src/canvas/` (capture half).
> **Golden rule:** what we capture here is the **raw** signal the detector reads.
> Cosmetic smoothing happens elsewhere (see [02-rendering](./02-rendering.md)) and
> MUST NOT touch these points (CLAUDE.md §6.3).

## Goal

Capture a single human stroke as a high-frequency, timestamped polyline using
Pointer Events, including coalesced sub-events, so the detector can measure
speed, jitter, and curvature. Works on mouse, trackpad, and touch.

## Data model

```ts
// re-exported from src/detector/types.ts — single source of truth
export type Point = { x: number; y: number; t: number }; // t = ms, high-res
export type Stroke = { points: Point[]; pressure?: number[] };
```

- `x`, `y` are in **canvas coordinate space** (CSS pixels mapped through the
  canvas bounding rect; NOT multiplied by devicePixelRatio — DPR is a render
  concern only).
- `t` is milliseconds from a monotonic origin. Use `event.timeStamp` (same
  origin across the gesture) and store it verbatim; do not call `performance.now()`
  separately (clock skew). The first point's `t` is kept as-is; the detector
  works on deltas, so the absolute origin is irrelevant.
- `pressure` is captured only when `PointerEvent.pressure` is meaningful
  (`pointerType !== 'mouse'` and value `> 0`). For mouse it is `undefined` for
  the whole stroke (never a `0.5`-filled array). See CLAUDE.md §5.3 feature 4.

## Public API

```ts
export type CaptureCallbacks = {
  onStart?: (p: Point) => void;
  onMove?: (p: Point) => void;       // fired once per coalesced point
  onEnd?: (stroke: Stroke) => void;  // the finished raw stroke
};

export type CaptureOptions = {
  /** Minimum movement (canvas px) to record a point; dedupes jitter-at-rest. Default 0 (keep all). */
  minDistance?: number;
  /** Hard cap on points to bound memory on pathological devices. Default 4000. */
  maxPoints?: number;
};

/**
 * Attaches pointer capture to a canvas element. Returns a detach function.
 * Only the FIRST active pointer is tracked per stroke (no multi-touch draw).
 */
export function attachStrokeCapture(
  canvas: HTMLCanvasElement,
  callbacks: CaptureCallbacks,
  options?: CaptureOptions,
): () => void;

/** Map a PointerEvent to canvas-space coordinates via getBoundingClientRect. */
export function toCanvasPoint(e: PointerEvent, rect: DOMRect): { x: number; y: number };
```

## Behavior

1. **pointerdown** → record start point, call `canvas.setPointerCapture(pointerId)`,
   begin a fresh `Point[]`. Ignore further `pointerdown`s until the active pointer ends.
2. **pointermove** → call `event.getCoalescedEvents()`; map each to a `Point`
   (its own `x/y/t`), push, fire `onMove`. This is the core of fine timing —
   browsers batch many physical samples into one `pointermove`. Falling back to
   the single event when `getCoalescedEvents` is unavailable is acceptable.
3. **pointerup / pointercancel** → push final point, `releasePointerCapture`,
   assemble `Stroke`, fire `onEnd`. Build `pressure[]` only if any sample had
   meaningful pressure.
4. The canvas element must have CSS `touch-action: none` (already set globally
   in `src/index.css`) so touch-drag doesn't scroll/zoom.

## Edge cases

- A "stroke" with `< 2` points (a tap) → still emitted; the detector/UI decides
  if it's a valid attempt (UI rejects taps, see [08-ui-flow](./08-ui-flow.md)).
- `getCoalescedEvents()` returning `[]` → use the event itself.
- `maxPoints` reached → stop recording further points but keep the gesture alive
  (still emit `onEnd`); `log`/note truncation (rare; bound is generous).
- Pointer leaving the canvas while down → still tracked (we hold pointer capture).

## Acceptance criteria

- [ ] A drawn stroke yields a `Point[]` with **strictly non-decreasing** `t`.
- [ ] On a device emitting coalesced events, captured point count ≥ the number of
      `pointermove` events fired (proves coalesced expansion works).
- [ ] `x/y` reproduce the pointer position within ±1px of the canvas rect mapping.
- [ ] Mouse strokes produce `pressure === undefined`; touch/stylus with real
      pressure produce a `pressure[]` of equal length to `points`.
- [ ] No multi-touch: a second simultaneous finger does not append to the stroke.
- [ ] `toCanvasPoint` is a pure function and is unit-tested with a synthetic
      `DOMRect` (no DOM needed).
- [ ] The captured `Stroke` is handed to the detector **unmodified** — verified by
      a test asserting the detector input equals the capture output byte-for-byte.

## Notes / out of scope

- Rendering, smoothing, width-by-speed → [02-rendering](./02-rendering.md).
- Resampling/normalization for features (e.g. arc-length resampling) is a
  **detector** concern and happens on a copy inside `src/detector/`, never here.
