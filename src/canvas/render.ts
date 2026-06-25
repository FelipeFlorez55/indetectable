// Rendering (spec 02). Display path via perfect-freehand. The display path is
// cosmetic and built from a COPY of [x, y] only — timestamps and pressure are
// dropped, so it can never feed the detector (§6.3, §13.3).

import { getStroke } from "perfect-freehand";
import type { Point, Stroke } from "../detector/index.ts";

export type RenderStyle = {
  color: string;
  size: number; // base stroke width (px)
  thinning: number; // how much speed/pressure varies width
  smoothing: number;
  streamline: number; // input jitter damping — VISUAL ONLY
};

// Procedural strokes get a deliberate, consistent machine look; the human style
// is visually identical so the camouflage target is clear (§6.3.2).
export const PROCEDURAL_STYLE: RenderStyle = {
  color: "#e5e5e5",
  size: 6,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
};
export const HUMAN_STYLE: RenderStyle = { ...PROCEDURAL_STYLE };

/** The COPY handed to perfect-freehand: [x, y] only (no t, no pressure). */
export function toStrokeInput(points: Point[]): number[][] {
  return points.map((p) => [p.x, p.y]);
}

/** perfect-freehand outline polygon for a set of raw points. */
export function getOutline(points: Point[], style: RenderStyle): number[][] {
  return getStroke(toStrokeInput(points), {
    size: style.size,
    thinning: style.thinning,
    smoothing: style.smoothing,
    streamline: style.streamline,
    simulatePressure: true, // width from point spacing → real-ink feel on mouse
  });
}

function outlineToPath2D(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

/** Build the display outline as a Path2D. Pure; never mutates the input. */
export function toDisplayPath(points: Point[], style: RenderStyle): Path2D {
  return outlineToPath2D(getOutline(points, style));
}

/** Render a stroke as a filled perfect-freehand outline (variable width). */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  style: RenderStyle,
): void {
  if (stroke.points.length === 0) return;
  ctx.fillStyle = style.color;
  ctx.fill(toDisplayPath(stroke.points, style));
}

/** Clear the whole canvas (in CSS-pixel space, transform already applied). */
export function clearCanvas(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void {
  ctx.clearRect(0, 0, cssW, cssH);
}

/** Resize a canvas to the container, accounting for devicePixelRatio. */
export function fitCanvasToContainer(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): void {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export type BBox = { x: number; y: number; w: number; h: number };

/** Axis-aligned bounding box of a stroke in logical scene space (F4). */
export function strokeBBox(stroke: Stroke): BBox {
  const pts = stroke.points;
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * F4 — draw the detective's accusation marker: a dashed rounded rect around the
 * accused stroke's (padded) bbox. Color is the caller's signal (red = caught the
 * human, emerald = wrongly accused a decoy → the player framed the machine).
 */
export function renderAccusation(
  ctx: CanvasRenderingContext2D,
  bbox: BBox,
  opts: { color: string; alpha?: number; pad?: number; dash?: number[] },
): void {
  const pad = opts.pad ?? 10;
  const x = bbox.x - pad;
  const y = bbox.y - pad;
  const w = bbox.w + pad * 2;
  const h = bbox.h + pad * 2;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash(opts.dash ?? [8, 6]);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 10);
  else ctx.rect(x, y, w, h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Progressive auto-draw entrance (§6.3.3). Reveals `stroke` over `durationMs` by
 * redrawing a growing prefix each frame. The caller owns clearing/compositing.
 * Returns a cancel function.
 */
export function animateAutoDraw(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  style: RenderStyle,
  durationMs: number,
  onFrame?: (progress: number) => void,
): () => void {
  let raf = 0;
  let start: number | null = null;
  const total = stroke.points.length;

  const tick = (ts: number) => {
    if (start === null) start = ts;
    const progress = durationMs <= 0 ? 1 : Math.min(1, (ts - start) / durationMs);
    const n = Math.max(2, Math.floor(progress * total));
    onFrame?.(progress);
    renderStroke(ctx, { points: stroke.points.slice(0, n) }, style);
    if (progress < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * Entrance auto-draw of a WHOLE scene (§6.3.3): the strokes draw themselves one
 * after another, each paced by ITS OWN captured timestamps — so a fast machine
 * stroke reveals fast and a slow one reveals slowly, exactly how the machine
 * "made" it. `rate` compresses real time so the sequence stays snappy while
 * preserving each stroke's relative speed; `gapMs` is the beat between strokes.
 *
 * Like `animateAutoDraw`, it never clears: completed strokes persist and each
 * growing prefix fills over the last, so the caller clears once up front. Reads
 * only [x, y] via renderStroke (no detector data touched). Returns a cancel fn.
 */
export function animateScene(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  style: RenderStyle,
  opts?: { rate?: number; gapMs?: number; onDone?: () => void },
): () => void {
  const rate = opts?.rate ?? 2;
  const gap = opts?.gapMs ?? 110;
  let raf = 0;
  let i = 0; // index of the stroke currently drawing
  let strokeStart: number | null = null;
  let gapUntil = 0;

  const tick = (ts: number) => {
    // Skip degenerate strokes (a lone point still gets painted).
    while (i < strokes.length && strokes[i].points.length < 2) {
      if (strokes[i].points.length === 1) renderStroke(ctx, strokes[i], style);
      i++;
    }
    if (i >= strokes.length) {
      opts?.onDone?.();
      return;
    }

    if (strokeStart === null) strokeStart = ts;
    const pts = strokes[i].points;
    const cursor = (ts - strokeStart) * rate; // ms into this stroke's own timeline
    let n = 1;
    while (n < pts.length && pts[n].t <= cursor) n++;
    renderStroke(ctx, { points: pts.slice(0, Math.max(2, n)) }, style);

    if (n >= pts.length) {
      // Stroke fully revealed — hold for the inter-stroke beat, then advance.
      if (gapUntil === 0) gapUntil = ts + gap;
      if (ts >= gapUntil) {
        i++;
        strokeStart = null;
        gapUntil = 0;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
