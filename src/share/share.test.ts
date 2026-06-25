// Share pure-helper tests (spec 07 + F5). DOM-free.

import { describe, it, expect } from "vitest";
import { shareText, lineupStrip, whatsappShareUrl, GAME_URL, type ShareData } from "./share.ts";

// 6 strokes: 5 procedural + the human at index 5. A clean win (no accusation on
// the human; here the detective accused decoy index 3 → 🎭, framed-the-machine).
const data: ShareData = {
  day: 142,
  level: 3,
  caught: false,
  confidence: 0.3,
  score: 87,
  streak: 6,
  verdictText: "Undetectable 🫥",
  detectiveName: "THE WARDEN",
  toneText: "It accused one of its own.",
  guessIndex: 3,
  humanIndex: 5,
  strokeCount: 6,
  accusedKind: "framed",
  labels: { score: "Score", streak: "Streak" },
  scene: { procedural: [], humanStroke: { points: [] } },
};

describe("shareText", () => {
  it("includes day, level, the strip, the detective line, streak and URL", () => {
    const text = shareText(data);
    expect(text).toContain("#142");
    expect(text).toContain("Hard");
    expect(text).toContain(lineupStrip(data));
    expect(text).toContain("THE WARDEN");
    expect(text).toContain("Streak 6");
    expect(text).toContain(GAME_URL);
  });
  it("signals kept vs broken streak (🟩 / 🟥)", () => {
    expect(shareText(data)).toContain("🟩");
    expect(shareText({ ...data, caught: true })).toContain("🟥");
  });
  it("does not leak scene specifics (no coordinates / stroke data)", () => {
    expect(shareText(data)).not.toMatch(/\bpoints\b|\bx:|\by:/);
  });
});

describe("lineupStrip (F5)", () => {
  it("win where the detective pointed at you but was unsure → 🫥, no 👤/🎭", () => {
    // guess === human (caughtHuman) but caught=false (confidence < T) → you won.
    const s = lineupStrip({ ...data, caught: false, guessIndex: 5, humanIndex: 5, strokeCount: 6 });
    expect(s).toBe("🤖🤖🤖🤖🤖🫥");
  });
  it("caught → one 👤, no 🫥/🎭", () => {
    const s = lineupStrip({ ...data, caught: true, guessIndex: 5, humanIndex: 5, strokeCount: 6 });
    expect(s).toBe("🤖🤖🤖🤖🤖👤");
  });
  it("framed a decoy → one 🎭 and one 🫥, no 👤", () => {
    const s = lineupStrip(data); // guess 3 (decoy), human 5 hidden
    expect(s).toBe("🤖🤖🤖🎭🤖🫥");
    expect(s.includes("👤")).toBe(false);
  });
  it("strip length (in glyphs) equals the stroke count", () => {
    const s = lineupStrip({ ...data, strokeCount: 4, guessIndex: 0, humanIndex: 3 });
    expect([...s]).toHaveLength(4); // count code points, not UTF-16 units
  });
  it("is spoiler-safe: identical for same counts/outcome regardless of geometry", () => {
    const a = lineupStrip({ ...data, scene: { procedural: [], humanStroke: { points: [{ x: 1, y: 2, t: 0 }] } } });
    const b = lineupStrip({ ...data, scene: { procedural: [], humanStroke: { points: [{ x: 9, y: 9, t: 9 }] } } });
    expect(a).toBe(b);
  });
});

describe("whatsappShareUrl", () => {
  it("is a valid wa.me link with URL-encoded text", () => {
    const url = whatsappShareUrl(data);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe(shareText(data));
  });
});
