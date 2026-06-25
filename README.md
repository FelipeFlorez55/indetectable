# Indetectable

A daily browser game: the AI paints a scene of machine-like strokes, you add
**one** stroke trying to camouflage it, and an algorithmic **detective** tries
to point out the human intruder. **You win if it doesn't catch you.**

100% client-side. No backend, no API keys, no accounts. Static build, free
hosting. The full design lives in [CLAUDE.md](./CLAUDE.md) — the source of truth.

## Stack

- **React + Vite + TypeScript** — pure static build
- **Canvas 2D + Pointer Events** — raw point capture with timestamps
- **Detector** — pure TS, no dependencies, DOM-free testable
- **Zustand** — lightweight state
- **Tailwind v4** — app chrome only (never the canvas)
- **Vitest** — unit tests for the detector with synthetic strokes

## Scripts

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # typecheck + static production build → dist/
npm run preview  # preview the production build
npm test         # run unit tests once
npm run test:watch
```

## Project structure

```
CLAUDE.md          # global context / source of truth (spec §1–§15)
specs/             # per-feature specs (added in Phase 2)
src/
  detector/        # pure TS, DOM-free, unit-tested — the project core (§5)
  scene/           # procedural generation + daily UTC seed (§8)
  difficulty/      # the 3 knobs, weekly level rotation (§7)
  canvas/          # raw stroke capture + perfect-freehand rendering (§6)
  store/           # Zustand state + localStorage persistence (§9)
  share/           # share card + Wordle text + WhatsApp (§10)
  i18n/            # es/en/pt locale detection + dictionaries — UI strings only (§16)
  components/      # React UI chrome + screen flow (§6.1, §8)
vite.config.ts     # base: '/' for the custom subdomain
```

## Hard constraints (non-negotiable — see CLAUDE.md §2)

- No backend, no recurring cost, no secrets (public repo).
- Local persistence only (`localStorage`).
- The detector reads the **raw** captured points, never the smoothed display path.
- Minimize dependencies.

## Status

**v1 implemented.** All core systems are built and tested: the self-calibrating
detector (jitter via Savitzky-Golay, speed, curvature), deterministic daily
scenes, the 3-knob difficulty with weekly level rotation, localStorage streak +
1-attempt lock, es/en/pt i18n, raw capture + perfect-freehand rendering, the
share card (PNG + Wordle text + WhatsApp), and the full UI flow.

71 unit tests (detector separability + determinism, scoring, scene/PRNG,
difficulty, persistence, i18n, canvas, share) — run `npm test`. Calibration of
the detector weights/thresholds against real human strokes is the remaining
pre-release tuning step (see specs/03-detector.md §6.5).
