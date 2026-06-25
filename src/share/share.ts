// Share card & flow (spec 07). Client-side only — zero upload, free & private.
// Wordle-style text is language-neutral (emoji + numbers) so it never spoils the
// scene and works across locales.

import type { AccusedKind, Scene } from "../detector/index.ts";
import {
  HUMAN_STYLE,
  PROCEDURAL_STYLE,
  renderStroke,
  renderAccusation,
  strokeBBox,
} from "../canvas/index.ts";
import { DEFAULT_SCENE } from "../scene/index.ts";

export const GAME_URL = "https://indetectable.felipeflorez.dev";

export type CardTemplate = "drawing" | "score";
export type ShareResult = "shared" | "copied" | "downloaded" | "failed";

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const PLAYER_GREEN = "#34d399"; // the player's own stroke
// F4/F5 — accusation box colour by outcome (mirrors GameCanvas / insight.accusedKind).
const ACCUSE_COLOR: Record<AccusedKind, string> = {
  caught: "#ef4444",
  framed: "#34d399",
  suspected: "#f59e0b",
};

export type ShareData = {
  day: number;
  level: 1 | 2 | 3;
  caught: boolean;
  confidence: number;
  score: number;
  streak: number;
  verdictText: string; // localized headline, e.g. "Undetectable 🫥"
  detectiveName: string; // localized, e.g. "THE WARDEN" (F2)
  toneText: string; // localized tiered line (F2)
  // F5 — lineup strip / card box. The human stroke is always the last index.
  guessIndex: number;
  humanIndex: number;
  strokeCount: number;
  accusedKind: AccusedKind; // box colour/semantics (F4)
  labels?: { score: string; streak: string }; // localized; emoji-free fallback for the text card
  scene: Scene;
};

// ── Pure helpers (DOM-free, unit-tested) ─────────────────────────────────────

/**
 * F5 — spoiler-free "lineup" strip: one glyph per stroke in scene order. Reveals
 * only the stroke COUNT and WHO got accused — never the geometry — so two players
 * with the same outcome get the same strip (a shared in-joke) and it can't be used
 * to cheat the day's draw.
 *   🤖 machine stroke (not accused) · 🫥 you, hidden (win) ·
 *   👤 you, busted (loss) · 🎭 a decoy the detective wrongly accused (you framed it)
 */
export function lineupStrip(data: ShareData): string {
  const caughtHuman = data.guessIndex === data.humanIndex;
  let out = "";
  for (let i = 0; i < data.strokeCount; i++) {
    if (i === data.humanIndex) {
      out += data.caught ? "👤" : "🫥"; // busted vs stayed hidden — keyed on OUTCOME
    } else {
      // 🎭 only when the detective actually accused this decoy (a misdirection win).
      out += i === data.guessIndex && !caughtHuman ? "🎭" : "🤖";
    }
  }
  return out;
}

/**
 * Wordle-style text: day+level, the lineup strip, the detective's roast (F2), the
 * streak signal, and the URL. Streak is the hero metric (CLAUDE.md §9); score is
 * demoted. Structure is language-neutral; only the tone line is localized, and its
 * selection is outcome-deterministic so the strip is identical worldwide (§16).
 */
export function shareText(data: ShareData): string {
  const streakLabel = data.labels?.streak ?? "Streak";
  return [
    `Indetectable #${data.day} · ${LEVEL_LABEL[data.level]}`,
    lineupStrip(data),
    `🔍 ${data.detectiveName}: ${data.toneText}`,
    `${data.caught ? "🟥" : "🟩"} ${streakLabel} ${data.streak}`,
    GAME_URL,
  ].join("\n");
}

/** wa.me deep link with the (URL-encoded) Wordle text. Text + URL only. */
export function whatsappShareUrl(data: ShareData): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(data))}`;
}

// ── DOM flow ─────────────────────────────────────────────────────────────────

/** Open the WhatsApp deep link (text + URL; the PNG goes via the native sheet). */
export function shareToWhatsApp(data: ShareData): void {
  if (typeof window !== "undefined") window.open(whatsappShareUrl(data), "_blank", "noopener");
}

const CARD_DEFAULT = { w: 1200, h: 630 };

/** Word-wrap fillText within maxWidth; returns the y after the last line. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
}

/** Render a card to an offscreen canvas, reusing the 02 stroke primitives. */
export function renderCard(
  data: ShareData,
  template: CardTemplate,
  size: { w: number; h: number } = CARD_DEFAULT,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size.w, size.h);

  const signal = data.caught ? ACCUSE_COLOR.caught : PLAYER_GREEN;

  if (template === "drawing") {
    // Thumbnail of the scene on the left, scaled from logical scene space.
    const pad = 48;
    const thumbW = size.w * 0.5;
    const thumbH = size.h - pad * 2;
    const scale = Math.min(thumbW / DEFAULT_SCENE.width, thumbH / DEFAULT_SCENE.height);
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(scale, scale);
    for (const s of data.scene.procedural) renderStroke(ctx, s, PROCEDURAL_STYLE);
    // The player's stroke is always emerald; the box's colour carries the verdict.
    renderStroke(ctx, data.scene.humanStroke, { ...HUMAN_STYLE, color: PLAYER_GREEN });
    // F5/F4 — draw the detective's accusation around its top suspect.
    const all = [...data.scene.procedural, data.scene.humanStroke];
    const accused = all[data.guessIndex];
    if (accused)
      renderAccusation(ctx, strokeBBox(accused), { color: ACCUSE_COLOR[data.accusedKind], dash: [10, 7] });
    ctx.restore();
  }

  // Text column
  const tx = template === "drawing" ? size.w * 0.56 : size.w * 0.1;
  ctx.fillStyle = "#e5e5e5";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.fillText("Indetectable", tx, 120);
  ctx.fillStyle = "#737373";
  ctx.font = "28px ui-monospace, monospace";
  ctx.fillText(`#${data.day}`, tx, 165);

  ctx.fillStyle = signal;
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.fillText(data.caught ? `🔍 ${data.detectiveName}` : data.verdictText, tx, 290);

  // F2 — the in-character tiered line (wrapped to the text column width).
  ctx.fillStyle = "#a3a3a3";
  ctx.font = "26px system-ui, sans-serif";
  wrapText(ctx, data.toneText, tx, 340, size.w - tx - 48, 34);

  ctx.fillStyle = "#e5e5e5";
  ctx.font = "40px ui-monospace, monospace";
  ctx.fillText(`${data.caught ? "🟥" : "🟩"} 🔥 ${data.streak}`, tx, 470);

  ctx.fillStyle = "#737373";
  ctx.font = "26px ui-monospace, monospace";
  ctx.fillText(GAME_URL.replace("https://", ""), tx, size.h - 60);

  return canvas;
}

/** Offscreen canvas → PNG blob. */
export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Progressive share: Web Share with the PNG (mobile) → clipboard text → PNG
 * download. Every step is feature-detected. (spec 07)
 */
export async function share(data: ShareData, template: CardTemplate): Promise<ShareResult> {
  const text = shareText(data);
  const filename = `indetectable-${data.day}.png`;
  try {
    const blob = await cardToBlob(renderCard(data, template));
    const file = new File([blob], filename, { type: "image/png" });

    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text });
        return "shared";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return "failed";
      }
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    downloadBlob(blob, filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}
