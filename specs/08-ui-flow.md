# 08 — UI Flow

> New section (implied by CLAUDE.md §4 game loop, §11 modes). Owns:
> `src/components/`. Tailwind styles the chrome only — never the canvas
> (CLAUDE.md §6.1). Orchestrates capture (01), rendering (02), detector (03),
> difficulty (04), scene (05), persistence (06), share (07).

## Goal

Wire the screens and states of the game loop (§4): load the daily scene, accept
one stroke, run the detective, reveal the verdict, share, and lock until tomorrow.
Plus a practice mode (§11) that doesn't touch the streak.

## State machine

```ts
export type Screen =
  | "loading"     // computing today's scene from the seed
  | "locked"      // already played today → show stored result, no new attempt
  | "intro"       // scene painted (optional auto-draw), "your turn" prompt
  | "drawing"     // capturing the human stroke
  | "evaluating"  // detector running (brief; algorithmic = instant)
  | "verdict"     // accusation + win/lose + score + streak
  | "share"       // share card / text (overlay on verdict)
  | "stats";      // streak/history/stats screen

export type Mode = "daily" | "practice";

export type UiState = {
  screen: Screen;
  mode: Mode;
  level: 1 | 2 | 3;
  // ...scene, capturedStroke, verdict — held in the store
};
```

## Flow (CLAUDE.md §4)

```
loading
  └─ hasPlayedToday? ── yes ──▶ locked (show stored verdict + share + countdown)
                       └─ no ──▶ intro (scene painted; auto-draw optional)
intro ──[player starts drawing]──▶ drawing
drawing ──[pointerup, valid stroke]──▶ evaluating
evaluating ──▶ verdict  (detector.evaluate → record() to persistence in daily mode)
verdict ──[share]──▶ share ──▶ verdict
verdict ──[daily]──▶ locked (until next UTC day)
verdict ──[practice]──▶ intro (new random scene; streak untouched)
```

- **Daily:** exactly one attempt. On reaching `verdict`, call persistence
  `record(todayIndex, …)` (06) and then lock.
- **Practice (§11):** unlimited; `record` is **never** called; streak/stats
  untouched. A clear visual marker that practice doesn't count.
- **Locked:** show the stored verdict, share options, and a countdown to the next
  UTC midnight. No canvas interaction.

## Components

```
App                      # screen router + store hydration (06) + LangProvider (09)
├─ Header                # title, streak (effectiveStreak), stats button, mode toggle, language switcher (09)
├─ GameCanvas            # 2 stacked <canvas> (02 layering); wires capture (01)
│   └─ uses attachStrokeCapture + renderStroke; feeds RAW stroke to the store
├─ IntroPrompt           # "Add one stroke. Don't get caught." + start affordance
├─ VerdictPanel          # accusation text, confidence meter, win/lose, score, streak
├─ ShareSheet            # template toggle (A/B), share()/copy/download (07)
├─ StatsScreen           # streak, maxStreak, bestScore, history (06)
├─ LockedScreen          # stored result + countdown to next UTC day
└─ DevOverlay            # ?dev=1 — feature vectors / z-scores (03 §7, 07 calibration)
```

## Key wiring rules

- `GameCanvas` hands the **raw** captured `Stroke` to the store; the store builds
  the `Scene` ( `{ procedural, humanStroke }` ) for the detector. The display path
  (02 smoothing) is computed separately and never reaches the detector (§6.3).
- **All player-facing text goes through `useT()` (09-i18n).** Locale changes only
  what's rendered — the scene, verdict, scores, and persisted state are identical
  across es/en/pt.
- A "stroke" with `< 2` points (a tap) is rejected with a gentle hint; stays in
  `drawing`.
- The detective's verdict drives the copy: `caughtHuman && confidence ≥ T` →
  "Caught you"; else "Undetectable 🫥". Confidence shown as a meter.
- Daily lock: derive "already played" from persistence (`hasPlayedToday`), not
  from in-memory flags, so a refresh keeps you locked.

## Acceptance criteria

- [ ] Fresh visitor (no storage) lands in `intro` for today's scene.
- [ ] After playing daily, a refresh lands in `locked` (lock survives reload).
- [ ] Practice mode never calls persistence `record`; streak/stats unchanged
      across many practice rounds.
- [ ] Tap (single point) does not submit; player stays in `drawing`.
- [ ] Verdict copy matches the detector outcome (win vs caught) and shows
      confidence + score + streak.
- [ ] Locked screen shows a live countdown to the next UTC midnight.
- [ ] Header streak uses `effectiveStreak` (today's gap-adjusted value), not the
      raw stored field.
- [ ] `?dev=1` reveals the DevOverlay; absent by default.
- [ ] Tailwind styles only chrome; no Tailwind classes drive canvas pixels.

## Open decisions surfaced to UI (CLAUDE.md §13)

- Share template A vs B (07) — UI exposes both; default + A/B TBD.
- Touch vs mouse pressure handling (§13.3) — UI may show input-type hint; detector
  ignores absent pressure (03).
