# 07 — Share Card

> Expands CLAUDE.md §10. Owns: card rendering + share flow. The viral engine is
> the **AI's accusation**, not a leaderboard. Zero image upload anywhere → free
> and private by design (CLAUDE.md §2/§10).

## Goal

Generate a shareable result client-side: a rendered PNG card and a Wordle-style
text summary. Share via the Web Share API on mobile, with copy-to-clipboard /
download PNG fallbacks. No network, no upload.

## Inputs

```ts
import type { Stroke } from "../detector/index.ts";

export type ShareData = {
  day: number;            // UTC dayIndex
  level: 1 | 2 | 3;
  caught: boolean;
  confidence: number;     // detective's confidence, [0,1]
  score: number;          // player score, [0,100]
  streak: number;
  verdictText: string;    // "Undetectable 🫥" | "Caught you in 0.3s" (flavor)
  // For the drawing thumbnail (template A): the committed strokes to redraw.
  procedural: Stroke[];
  humanStroke: Stroke;
};
```

## Card templates (RESOLVED §13.1)

Ship **both**; **default = Template A**, with Template B as a toggle, and the
Wordle-style **text always available** as the universal, frictionless path:

- **Template A — drawing + verdict** *(default)* (personal, spy vibe): thumbnail
  of the scene (procedural + human redrawn with the same render primitives from
  [02-rendering](./02-rendering.md), human highlighted), verdict, streak, day.
  Chosen as default because the drawing is the unique, personal artifact — the
  differentiator vs generic Wordle squares.
- **Template B — score / streak** (cleaner, more mysterious): no drawing, large
  verdict + streak + score, minimal. Kept as a toggle; run a real A/B later.

> Rationale (CLAUDE.md §10): image cards drive engagement but Web Share-with-files
> is solid on mobile and spotty on desktop (see flow below), so the spoiler-free
> **Wordle text is always offered** as the reliable cross-platform fallback.

```ts
export type CardTemplate = "drawing" | "score";

/** Render a card to an offscreen canvas. Reuses 02-rendering stroke primitives. */
export function renderCard(
  data: ShareData,
  template: CardTemplate,
  size?: { w: number; h: number }, // default 1200×630 (OG ratio)
): HTMLCanvasElement;

/** Offscreen canvas → PNG blob. */
export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob>;
```

## Wordle-style text (CLAUDE.md §10)

No spoilers of the day's scene. Emojis + score + streak + day, plus a link.

```ts
/** e.g. "Indetectable #142  🫥 Undetectable\nScore 87 · 🔥 6\nindetectable.felipeflorez.dev" */
export function shareText(data: ShareData): string;
```

## Share flow (progressive enhancement)

```ts
export type ShareResult = "shared" | "copied" | "downloaded" | "failed";

/**
 * 1. If navigator.canShare({ files }) → Web Share API with the PNG (mobile;
 *    the user picks WhatsApp/Telegram/Status from the native sheet).
 * 2. Else copy shareText() to clipboard (navigator.clipboard).
 * 3. Else trigger a PNG download (anchor + objectURL).
 */
export function share(data: ShareData, template: CardTemplate): Promise<ShareResult>;
```

- Feature-detect every step; never assume `navigator.share`/`clipboard` exists.
- Revoke object URLs after use; no blob leaks.

### WhatsApp deep link (text + URL)

A dedicated "WhatsApp" button complements the native sheet. It opens a `wa.me`
link that works **everywhere** — WhatsApp app on mobile, WhatsApp Web/Desktop on
desktop — prefilled with the Wordle text + game URL.

```ts
/** Build a wa.me deep link with the (URL-encoded) Wordle text + game URL. */
export function whatsappShareUrl(data: ShareData): string; // https://wa.me/?text=<encoded shareText>

/** Open the WhatsApp deep link (window.open in a new tab/app). */
export function shareToWhatsApp(data: ShareData): void;
```

**Hard limit (factual, no backend can fix it on the free tier):**
- `wa.me` carries **text + a URL only** — it **cannot attach the PNG image**.
- The PNG reaches WhatsApp **only** via the native share sheet (step 1 above),
  where the user manually picks a chat or **Status/Estado**. There is no web API
  to post to WhatsApp Status programmatically.
- The URL in the text unfurls into WhatsApp's preview using the site's **static
  OG meta tags** → a generic game preview, **not** the player's personal drawing
  (per-result OG images would require a backend → out of scope, CLAUDE.md §2).

## Acceptance criteria

- [ ] Card renders fully offscreen — no dependence on the live game canvas.
- [ ] Template A redraws the scene using the **same** render primitives (02), with
      the human stroke visually distinguished.
- [ ] `shareText` contains the day number, verdict emoji, score, streak, and the
      domain — and **no** information that spoils the day's scene.
- [ ] `share` degrades: Web Share → clipboard → download, each feature-detected;
      returns the accurate `ShareResult`.
- [ ] No image is ever uploaded; all generation is local. Object URLs are revoked.
- [ ] `whatsappShareUrl` produces a valid, URL-encoded `wa.me/?text=` link
      containing the Wordle text + game URL (unit-tested, no DOM).
- [ ] Pure helpers (`shareText`, `whatsappShareUrl`, layout math) are unit-tested
      without the DOM; canvas rendering is exercised in a jsdom/`happy-dom` opt-in test.
- [ ] All player-facing card/text strings come from i18n (es/en/pt) per
      [09-i18n](./09-i18n.md); the game URL and day number are locale-independent.

## Out of scope

- No global/all-time leaderboard (CLAUDE.md §10 — demotivating, needs a backend).
- Daily percentile ranking is out of v1 (requires a backend).
