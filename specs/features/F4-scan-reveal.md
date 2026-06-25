# F4 — Scan-and-accuse reveal + highlight the accused stroke

> Expands CLAUDE.md §6 (canvas rendering, layering) and §10 (the accusation is the
> moment). Owns: `src/canvas/render.ts` (new highlight + bbox helpers),
> `GameCanvas.tsx` (the reveal animation + accused highlight), light wiring in
> `App.tsx`. Includes the **explicit ask: when the detective accuses a procedural
> decoy, visibly mark which stroke it pointed at.**

---

## 0. Problem

The payoff of the whole day — the accusation — is currently an instant static
panel. The canvas never shows *which* stroke the detective pointed at. When the
detective is fooled into accusing a **decoy** (the best outcome, F1 makes it
possible), the player can't even see it happen.

## 1. Goal

1. **Reveal sequence:** after the player commits, the detective visibly *scans*
   the strokes, hesitates over a couple of suspects, then **boxes its guess**, and
   only then does the verdict text land.
2. **Highlight the accused stroke** on the canvas — in the verdict view AND (F5)
   on the share card. If it accused a decoy, the player sees the machine indict its
   own line; if it caught the human, the human stroke gets the red box.

## 2. Data available

`Verdict` already carries everything:

- `scores[]` — `humanness` per stroke, parallel to `[...procedural, human]`.
- `guessIndex` — the accused stroke.
- `caughtHuman` — whether the guess is the human.

The scan order and the box target are pure functions of these — no new detector
work.

## 3. Rendering helpers (`src/canvas/render.ts`)

```ts
/** Axis-aligned bounding box of a stroke in logical scene space. */
export function strokeBBox(stroke: Stroke): { x: number; y: number; w: number; h: number };

/** Draw an accusation marker (rounded rect + optional label dot) around a bbox. */
export function renderAccusation(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; w: number; h: number },
  opts: { color: string; alpha?: number; dash?: number[] },
): void;
```

- Box is padded ~8 logical px around the bbox.
- **Colour follows the OUTCOME, not just who was pointed at** (`insight.accusedKind`).
  The box always sits on `guessIndex` (the detective's top suspect), but:
  - `caught` (you lost) → **red** `#ef4444` on your stroke.
  - `framed` (you won, it accused a decoy) → **emerald** `#34d399` on the decoy.
  - `suspected` (you won, but its #1 suspect was you and it wasn't sure enough) →
    **amber** `#f59e0b`. **Never red on a win** — a red box while "Undetectable"
    reads as "caught" and confuses the player. This rule is shared with the share
    card (F5).

## 4. The reveal sequence (`GameCanvas.tsx`)

Add an optional `reveal?: { verdict: Verdict; onDone: () => void }` prop (or a new
`mode`/phase). When present, run a short RAF state machine on the **live (top)
canvas**, leaving the static procedural layer untouched:

1. **scanning** (~1.0s): a horizontal scan line sweeps the canvas; as it passes
   each stroke, briefly tint/pulse that stroke. Cheap: a moving gradient bar +
   per-stroke highlight when the line x-overlaps the stroke bbox.
2. **hesitating** (~0.6s): pulse the **top-2 most-suspicious** strokes (sort
   `scores` desc, take indices 0–1), alternating, to fake deliberation. Drives
   tension and is honest (those really are the top suspects).
3. **accusing** (~0.4s): snap `renderAccusation` onto `guessIndex`; the confidence
   meter fills from 0 → `confidence` over this beat (F3 tick already in place).
4. `onDone()` → App swaps to the verdict screen with the box persisted.

Respect `prefers-reduced-motion`: if set, skip 1–2 and jump straight to the
accusing frame (no sweep), so the box + verdict still appear, instantly.

Total ≈ 2s. All on `requestAnimationFrame`; reuse the existing `setupCanvas`
transform so it's resolution-independent. Provide a cancel/cleanup (return from
`useEffect`) so unmount/skip doesn't leak a RAF.

## 5. Persisted highlight in the verdict view

On the verdict screen (`GameCanvas … compact committedHuman`), after the reveal,
keep the accusation box drawn on the static layer (or a third overlay) so the
result is legible without re-animating. The accused stroke index + color come from
the verdict. This is the part that satisfies the explicit decoy ask: a won-by-decoy
result shows the emerald box around the *procedural* stroke the Warden wrongly
indicted, with the F2 `won.decoy` line beneath it.

## 6. Wiring (`App.tsx`)

- New screen phase `"reveal"` between `"evaluating"` and `"verdict"` (or fold the
  reveal into a still-mounted canvas during `"evaluating"`). Simplest: keep
  `evaluating` (compute verdict), then enter `reveal` which renders `GameCanvas`
  with the `reveal` prop; `onDone` → `verdict`.
- The existing 650ms `setTimeout` "thinking" delay is replaced by the real reveal
  animation (the delay becomes the scan duration).
- Pass `guessIndex`/`caughtHuman` down to the compact verdict `GameCanvas` so the
  box persists.

## 7. Auto-draw entrance (bundled, optional)

`animateAutoDraw` already exists and is unused for the intro. Use it on the intro /
first paint so the machine "draws itself" stroke-by-stroke (CLAUDE.md §6.3.3) —
the curtain-raise that frames the one-shot. Gate behind the same
`prefers-reduced-motion`. Low cost; ship if time allows, else defer (not required
for the accused-highlight ask).

## 8. Tests

- `strokeBBox` is correct for a known stroke (pure, unit-tested in a render test or
  a small geometry test — keep DOM-free where possible by testing `strokeBBox`
  alone).
- `renderAccusation` / animation are DOM/visual — cover with a smoke test (jsdom)
  or manual verification; do not block on pixel tests.
- Scan order = `scores` sorted desc (pure helper `suspectOrder(verdict)` —
  unit-test that).

## 9. Out of scope

- Sound (future). Web Audio scan pulse would pair well but is a separate feature.
- The share-card box rendering lives in F5 (reuses `renderAccusation`).
