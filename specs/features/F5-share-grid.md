# F5 — Wordle-style emoji grid + roast-first share

> Expands CLAUDE.md §10 (virality) and §13.1 (share templates). Owns:
> `src/share/share.ts` (`shareText` grid + card accusation box), light copy in
> `ShareSheet.tsx` / `messages.ts`. **No backend, no upload** (unchanged).

---

## 0. Problem

The share text is a flat status report:

```
Indetectable #42
Undetectable 🫥
Score 87 · Streak 6
<url>
```

No visual signature, nothing that reads as "a result from a game," and it treats a
loss as a sad confession rather than a forwardable meme. Wordle's rocket fuel was
the **spoiler-free grid** + the impulse to share *both* wins and losses.

## 1. Goal

1. A spoiler-free **emoji "lineup" strip** that encodes the round's story (how many
   machine strokes, who got accused, did you survive) without revealing the day's
   actual scene shape.
2. **Roast-first framing:** when caught, the share leads with the Warden's burn
   (F2 tone) — you forward what the AI said, not "I lost."
3. Reuse F4's accusation box on the **drawing card** so the image shows the
   verdict, including the framed-a-decoy flex.

## 2. The lineup strip (pure, `shareText`)

One glyph per stroke in the scene, in scene order (`[...procedural, human]`), so
the count of machine strokes is real but the *shapes* never leak.

Glyph rules:

- 🤖 — a procedural stroke the detective did **not** accuse.
- 🫥 — the human stroke, **not** accused (you stayed hidden) → win.
- 👤 — the human stroke, **accused** (busted) → loss.
- 🎭 — a procedural stroke the detective **wrongly accused** (you framed a decoy) →
  the special win.

Exactly one of {🫥, 👤} appears (the human), plus at most one 🎭 (the accused
decoy). Build from `verdict.guessIndex` + `caughtHuman` + the human index (last).

> **Spoiler-safe:** the strip reveals only stroke *count* and *who got pointed at*,
> never geometry. Two people with the same outcome get the same strip → shared
> in-joke, and it can't be used to cheat the day's draw.

### Text layout

```
Indetectable #42 · Hard
🤖🤖🤖🎭🤖🫥
🔍 THE WARDEN: <tone line, short>
🟩 Streak 6
<url>
```

- Line 1: day + level label (level is already in `ShareData`).
- Line 2: the lineup strip.
- Line 3: `🔍 {detective.name}: {tone}` — the F2 tone line (short variant).
- Line 4: streak with a 🟩 (kept streak) / 🟥 (broken) signal. Streak is the hero
  metric (CLAUDE.md §9), score demoted or dropped from text.
- Line 5: URL.

Keep it **language-neutral in structure** (emoji + numbers carry meaning); the tone
line is localized but, per §16, its *selection* is seed/outcome-deterministic so
the strip is byte-identical worldwide for a given outcome.

## 3. ShareData additions

Extend `ShareData` with:

- `tone: VerdictTone` (from F2) — for the burn line.
- `guessIndex: number`, `humanIndex: number`, `strokeCount: number` — to build the
  strip and the card box. (Derivable from `scene`, but pass explicitly to keep
  `shareText` pure and DOM-free.)

`shareText` consumes these; `whatsappShareUrl` is unchanged (wraps `shareText`).

## 4. Card: draw the accusation (Template A "drawing")

In `renderCard`, after drawing the strokes, draw F4's `renderAccusation` box around
`guessIndex` (scaled into the thumbnail transform). Color = red if `caughtHuman`
else emerald (framed a decoy). Add a small "case file" touch: the tone line under
the verdict headline. This makes the *image* show the accusation, not just a
recolored stroke — far more screenshot-worthy.

Template B ("score") stays clean (streak + tone), no thumbnail.

## 5. Roast-first copy (`ShareSheet.tsx` / `messages.ts`)

- When `caught`, the share CTA flips to roast framing: `share.ctaCaught` =
  "Share what it said about me →" (es/pt localized). When won, keep `share.cta`.
- The card/headline on caught leads with the Warden line (F2), not a neutral
  "found you".

## 6. Tests (`src/share/share.test.ts`)

1. **Strip composition:** win (hidden) → exactly one 🫥, no 👤/🎭; caught → one 👤;
   decoy-framed → one 🎭 + one 🫥, no 👤.
2. **Length:** strip length == total stroke count.
3. **Spoiler-safety:** strip is identical for two scenes with same counts/outcome
   but different geometry (no coordinates leak).
4. **Determinism / locale:** same outcome → same strip across locales (tone words
   differ, strip + structure identical).
5. `shareText` stays a pure string function (no DOM).

## 7. Out of scope

- URL-encoded friend-challenge / head-to-head compare (great idea, separate
  feature; needs a result token + a compare view — not in this batch).
- Animated/GIF cards (static PNG only, §10).
