import { useEffect, useRef } from "react";
import type { AccusedKind, Point, Stroke } from "../detector/index.ts";
import {
  attachStrokeCapture,
  renderStroke,
  renderAccusation,
  animateScene,
  strokeBBox,
  PROCEDURAL_STYLE,
  HUMAN_STYLE,
} from "../canvas/index.ts";
import { DEFAULT_SCENE } from "../scene/index.ts";

// Two stacked canvases (spec 02 §6.4): a static layer for the procedural scene
// and a live layer for the in-progress human stroke. Capture and rendering both
// work in LOGICAL scene space (DEFAULT_SCENE), so the raw stroke handed to the
// detector and the share card are resolution-independent.

const { width: LW, height: LH } = DEFAULT_SCENE;
// F4 — box colour by outcome (see accusedKind). Red ONLY when you actually lost.
const ACCUSE_COLOR: Record<AccusedKind, string> = {
  caught: "#ef4444", // red — it nailed you
  framed: "#34d399", // emerald — it accused a decoy (you win)
  suspected: "#f59e0b", // amber — its top suspect was you, but it wasn't sure
};

type Props = {
  procedural: Stroke[];
  /** When false, the canvas ignores input (intro/locked/verdict screens). */
  drawingEnabled: boolean;
  onStrokeComplete?: (raw: Stroke) => void;
  /** A committed human stroke to display (e.g. on the verdict screen). */
  committedHuman?: Stroke | null;
  /** F4 — the accused stroke index (procedural 0..n-1, or n = the human). */
  accusedIndex?: number;
  /** F4 — what the accusation means (drives the box colour). */
  accusedKind?: AccusedKind;
  /** F4 — called when the scan-and-accuse reveal finishes. */
  onRevealDone?: () => void;
  /** Render as a smaller result thumbnail (verdict screen). */
  compact?: boolean;
  /** Play the entrance auto-draw: strokes reveal one by one at their own speed (§6.3.3). */
  animate?: boolean;
};

function setupCanvas(canvas: HTMLCanvasElement, displayW: number): CanvasRenderingContext2D | null {
  const displayH = (displayW * LH) / LW;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  canvas.width = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform((dpr * displayW) / LW, 0, 0, (dpr * displayH) / LH, 0, 0);
  return ctx;
}

export function GameCanvas({
  procedural,
  drawingEnabled,
  onStrokeComplete,
  committedHuman,
  accusedIndex,
  accusedKind,
  onRevealDone,
  compact,
  animate,
}: Props) {
  const maxW = compact ? 380 : 720;
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const livePoints = useRef<Point[]>([]);

  // Paint the static procedural layer (and any committed human stroke).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = staticRef.current;
    if (!wrap || !canvas) return;
    const displayW = Math.min(wrap.clientWidth, maxW);
    const ctx = setupCanvas(canvas, displayW);
    if (!ctx) return;
    ctx.clearRect(0, 0, LW, LH);

    const paintAll = () => {
      for (const s of procedural) renderStroke(ctx, s, PROCEDURAL_STYLE);
      if (committedHuman) renderStroke(ctx, committedHuman, { ...HUMAN_STYLE, color: "#34d399" });
    };

    // Entrance: let the strokes draw themselves at their own captured speed
    // (§6.3.3). Only on the intro preview (no committed human), and never with
    // reduced motion.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (animate && !committedHuman && !reduced && procedural.some((s) => s.points.length >= 2)) {
      return animateScene(ctx, procedural, PROCEDURAL_STYLE);
    }

    paintAll();
  }, [procedural, committedHuman, maxW, animate]);

  // Live capture layer.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = liveRef.current;
    if (!wrap || !canvas) return;
    const displayW = Math.min(wrap.clientWidth, maxW);
    const ctx = setupCanvas(canvas, displayW);
    if (!ctx || !drawingEnabled) return;

    const toLogical = (p: Point): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: (p.x * LW) / rect.width, y: (p.y * LH) / rect.height, t: p.t };
    };

    const detach = attachStrokeCapture(
      canvas,
      {
        onStart: (p) => {
          livePoints.current = [toLogical(p)];
        },
        onMove: (p) => {
          livePoints.current.push(toLogical(p));
          ctx.clearRect(0, 0, LW, LH);
          renderStroke(ctx, { points: livePoints.current }, HUMAN_STYLE);
        },
        onEnd: (stroke) => {
          // Re-map the authoritative raw stroke to logical space for the detector.
          const raw: Stroke = {
            points: stroke.points.map(toLogical),
            ...(stroke.pressure ? { pressure: stroke.pressure } : {}),
          };
          ctx.clearRect(0, 0, LW, LH);
          livePoints.current = [];
          onStrokeComplete?.(raw);
        },
      },
      { minDistance: 0 },
    );
    return detach;
  }, [drawingEnabled, onStrokeComplete, maxW]);

  // F4 — scan-and-accuse reveal on the live (top) layer. Defined AFTER the capture
  // effect so its pixels survive (setupCanvas clears the bitmap). Driven by
  // primitives so a parent re-render doesn't restart the animation.
  useEffect(() => {
    if (accusedIndex === undefined) return;
    const wrap = wrapRef.current;
    const canvas = liveRef.current;
    if (!wrap || !canvas) return;
    const displayW = Math.min(wrap.clientWidth, maxW);
    const ctx = setupCanvas(canvas, displayW);
    if (!ctx) return;

    const all = [...procedural, ...(committedHuman ? [committedHuman] : [])];
    const target = all[accusedIndex];
    if (!target) return;
    const box = strokeBBox(target);
    const color = ACCUSE_COLOR[accusedKind ?? "caught"];

    const drawBox = (alpha: number) => {
      ctx.clearRect(0, 0, LW, LH);
      renderAccusation(ctx, box, { color, alpha });
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      drawBox(1);
      onRevealDone?.();
      return;
    }

    const SCAN = 750;
    const BOX = 450;
    const TOTAL = SCAN + BOX;
    let raf = 0;
    let start: number | null = null;
    let done = false;

    const tick = (ts: number) => {
      if (start === null) start = ts;
      const e = ts - start;
      ctx.clearRect(0, 0, LW, LH);
      if (e < SCAN) {
        // A vertical scan bar sweeps the scene left → right.
        const x = (e / SCAN) * LW;
        const grad = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
        grad.addColorStop(0, "rgba(52,211,153,0)");
        grad.addColorStop(0.5, "rgba(52,211,153,0.30)");
        grad.addColorStop(1, "rgba(52,211,153,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - 40, 0, 80, LH);
        ctx.strokeStyle = "rgba(52,211,153,0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, LH);
        ctx.stroke();
      } else {
        drawBox(Math.min(1, (e - SCAN) / BOX));
      }
      if (e < TOTAL) {
        raf = requestAnimationFrame(tick);
      } else if (!done) {
        done = true;
        drawBox(1);
        onRevealDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [accusedIndex, accusedKind, procedural, committedHuman, maxW, onRevealDone]);

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto w-full ${compact ? "max-w-[380px]" : "max-w-[720px]"}`}
    >
      <canvas ref={staticRef} className="block w-full rounded-xl border border-neutral-800 bg-neutral-900" />
      <canvas
        ref={liveRef}
        className="absolute inset-0 w-full touch-none"
        style={{ cursor: drawingEnabled ? "crosshair" : "default" }}
      />
    </div>
  );
}
