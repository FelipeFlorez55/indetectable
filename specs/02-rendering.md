# 02 — Rendering

> Expands CLAUDE.md §6. Owns: `src/canvas/` (render half).
> **Golden rule:** the display path is cosmetic. It is computed from a **copy**
> and never feeds the detector (CLAUDE.md §6.3).

## Goal

Paint the scene with a real-ink feel: variable-width "ink" strokes, a consistent
procedural style, and an optional auto-draw entrance. Decoupled layers so the
live human stroke re-renders per frame without repainting the static scene.

## Decision: Canvas 2D, not SVG

Per CLAUDE.md §6.2. Canvas gives frame-by-frame control and pairs with the
high-frequency raw capture. The only SVG advantage (easy auto-draw animation) is
replicated by progressively rendering the path over frames (§6.3.3).

## Decision: `perfect-freehand` for the display path (RESOLVED)

The smoothed display path is generated with **`perfect-freehand`** (`getStroke`)
instead of hand-rolled quadratic Bézier. Rationale:

- **Zero runtime dependencies, MIT, ~5 KB min+gzip** — respects "minimize
  dependencies" (CLAUDE.md §2/§3). By Steve Ruiz (author of tldraw).
- **It does not capture events** — we feed it points and it returns an outline
  polygon. So the raw/display separation (§6.3) is structural: raw timestamped
  points stay with the detector; only a **copy** (`[x, y]`, pressure dropped)
  goes to `getStroke`. The library *cannot* touch the detector signal.
- **Real-ink width-by-speed for free** — `getStroke` simulates pressure from the
  distance between points (`simulatePressure: true`), giving variable width even
  for mouse input. This subsumes the manual "width-by-speed" lever (§6.3.1).

> **Constraint:** `perfect-freehand` is used **only here, for rendering**. It is
> never imported by `src/detector/`, `src/scene/`, or capture (01). Pressure data
> is NOT forwarded to it in v1 (decision §13.3) — simulated pressure is used so
> the look is input-independent.

## Layering (CLAUDE.md §6.4)

Two stacked `<canvas>` elements sharing identical size/transform:

- **Static layer** — procedural strokes + the committed human stroke. Painted
  once (or animated on entrance), then untouched.
- **Live layer** — the in-progress human stroke, cleared and repainted each frame
  during drawing. On `pointerup` the stroke is committed to the static layer and
  the live layer is cleared.

Both canvases are sized to `cssSize * devicePixelRatio`; the 2D context is scaled
by DPR so all drawing uses CSS-pixel coordinates (matching capture space).

## Public API

```ts
import { getStroke } from "perfect-freehand";

export type RenderStyle = {
  color: string;
  size: number;        // getStroke `size` — base stroke width (px)
  thinning: number;    // getStroke `thinning` — how much speed/pressure varies width
  smoothing: number;   // getStroke `smoothing`
  streamline: number;  // getStroke `streamline` — input jitter damping (visual only)
};

export const PROCEDURAL_STYLE: RenderStyle; // consistent machine look (§6.3.2)
export const HUMAN_STYLE: RenderStyle;       // visually identical target

/**
 * Build the display outline for a stroke. Pure; reads a COPY of the raw points
 * ([x, y] only — pressure dropped, §13.3), never mutates the input. Returns a
 * Path2D built from perfect-freehand's outline polygon.
 */
export function toDisplayPath(points: Point[], style: RenderStyle): Path2D;

/** Render a stroke as a filled perfect-freehand outline (variable width). */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  style: RenderStyle,
): void;

/** Progressive entrance: reveal `stroke` over `durationMs`. Returns a cancel fn. */
export function animateAutoDraw(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  style: RenderStyle,
  durationMs: number,
): () => void;

/** Resize both canvases to the container, accounting for devicePixelRatio. */
export function fitCanvasToContainer(canvas: HTMLCanvasElement, cssW: number, cssH: number): void;
```

## Display path via `perfect-freehand`

```ts
const outline = getStroke(points.map(p => [p.x, p.y]), {
  size: style.size,
  thinning: style.thinning,
  smoothing: style.smoothing,
  streamline: style.streamline,
  simulatePressure: true,   // width from point spacing → real-ink feel on mouse
});
// outline is a polygon; build a Path2D and ctx.fill() it.
```

- Input is a **copy** of the raw points with **only `[x, y]`** — timestamps and
  pressure are intentionally dropped (the look is input-independent, §13.3).
- `simulatePressure: true` makes faster segments thinner / slower thicker,
  subsuming the manual width-by-speed lever (CLAUDE.md §6.3.1).
- `streamline` damps input jitter **visually only** — this is exactly why the
  detector must read the raw points (§6.3): the on-screen ink is deliberately
  smoothed, the data is not.

## Acceptance criteria

- [ ] `toDisplayPath` and `renderStroke` never mutate the input `Stroke`/`points`
      (asserted by a test comparing the array before/after — proves §6.3 separation).
- [ ] Only `[x, y]` is passed to `getStroke`; `t` and `pressure` never reach it.
- [ ] `perfect-freehand` is imported **only** under `src/canvas/` (render) — never
      by `src/detector/`, `src/scene/`, or capture (guarded by a grep test).
- [ ] At DPR > 1 the line is crisp (canvas backing store scaled, context scaled).
- [ ] Fast segments render visibly thinner than slow ones (via `simulatePressure`).
- [ ] Procedural strokes all use `PROCEDURAL_STYLE` → visually uniform target.
- [ ] Committing the live stroke moves it to the static layer; live layer clears.
- [ ] `animateAutoDraw` reveals progressively and its cancel fn stops it cleanly.
- [ ] Resizing the window re-fits both canvases without distorting committed strokes.

## Notes / out of scope

- Point capture → [01-canvas-capture](./01-canvas-capture.md).
- Share-card rendering uses the same primitives but a separate offscreen canvas →
  [07-share-card](./07-share-card.md).
