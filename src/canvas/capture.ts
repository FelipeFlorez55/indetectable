// Raw stroke capture (spec 01). Pointer Events + getCoalescedEvents for fine
// timing. What we capture here is the RAW signal the detector reads — cosmetic
// smoothing happens only in render.ts and never touches these points (§6.3).

import type { Point, Stroke } from "../detector/index.ts";

export type CaptureCallbacks = {
  onStart?: (p: Point) => void;
  onMove?: (p: Point) => void;
  onEnd?: (stroke: Stroke) => void;
};

export type CaptureOptions = {
  /** Minimum movement (canvas px) to record a point. Default 0 (keep all). */
  minDistance?: number;
  /** Hard cap on points to bound memory. Default 4000. */
  maxPoints?: number;
};

/** Map a PointerEvent to canvas-space coordinates via the bounding rect. */
export function toCanvasPoint(
  e: { clientX: number; clientY: number },
  rect: { left: number; top: number },
): { x: number; y: number } {
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Attach pointer capture to a canvas. Returns a detach function. Only the first
 * active pointer is tracked per stroke (no multi-touch draw).
 */
export function attachStrokeCapture(
  canvas: HTMLCanvasElement,
  callbacks: CaptureCallbacks,
  options: CaptureOptions = {},
): () => void {
  const minDistance = options.minDistance ?? 0;
  const maxPoints = options.maxPoints ?? 4000;

  let activeId: number | null = null;
  let points: Point[] = [];
  let pressures: number[] = [];
  let hasPressure = false;
  let truncated = false;

  const record = (e: PointerEvent): boolean => {
    if (points.length >= maxPoints) {
      truncated = true;
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const { x, y } = toCanvasPoint(e, rect);
    if (minDistance > 0 && points.length > 0) {
      const last = points[points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) < minDistance) return false;
    }
    points.push({ x, y, t: e.timeStamp });
    if (hasPressure) pressures.push(e.pressure);
    return true;
  };

  const onDown = (e: PointerEvent) => {
    if (activeId !== null) return; // ignore extra pointers (no multi-touch)
    activeId = e.pointerId;
    points = [];
    pressures = [];
    hasPressure = e.pointerType !== "mouse";
    truncated = false;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (record(e)) callbacks.onStart?.(points[points.length - 1]);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    const coalesced =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [e];
    for (const ce of events) {
      if (record(ce)) callbacks.onMove?.(points[points.length - 1]);
    }
  };

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    record(e);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const stroke: Stroke = { points };
    // Only attach pressure for non-mouse input that actually reported values.
    if (hasPressure && pressures.length === points.length && pressures.some((p) => p > 0)) {
      stroke.pressure = pressures;
    }
    if (truncated && import.meta.env?.DEV) {
      console.warn(`[capture] stroke truncated at ${maxPoints} points`);
    }
    activeId = null;
    callbacks.onEnd?.(stroke);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", finish);
    canvas.removeEventListener("pointercancel", finish);
  };
}
