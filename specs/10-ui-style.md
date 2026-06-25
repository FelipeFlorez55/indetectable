# 10 — UI Style Guide

> New section. Owns the visual language of the app chrome (Tailwind only — never
> the canvas, CLAUDE.md §6.1). Consumed by `src/components/` (08) and the share
> card (07). Keep dependencies minimal (CLAUDE.md §2/§3).

## Concept

Theme: **forensic / detective / "machine vs human" / surveillance.** The canvas
is the hero; the chrome recedes. The emotional beat is the **detective's
accusation** — the UI should feel like a clean lab readout that delivers a
verdict, not a noisy game HUD.

## Palette

Dark, high-contrast, minimal. One **signal color** that flips with the verdict.

```
--bg          near-black      (e.g. neutral-950 / #0a0a0a)
--surface     elevated dark   (e.g. neutral-900)
--text        off-white       (e.g. neutral-100)
--muted       dim gray        (e.g. neutral-400 / 500)
--border      subtle          (e.g. neutral-800)

--signal-win    acid green / cyan   → "Undetectable 🫥"  (player won)
--signal-caught red                 → "Caught you …"     (player caught)
--accent        single brand hue, used sparingly
```

The signal color drives the verdict panel, the confidence meter, and the share
card accent. Everything else stays monochrome so the verdict reads instantly.

## Typography (self-hosted — no CDN, static build)

- **UI / sans:** Inter or Geist.
- **Forensic readout / mono:** Geist Mono, JetBrains Mono, or IBM Plex Mono — used
  for the confidence meter, the day number (`#142`), scores, and the dev overlay
  z-scores. The mono is the "instrument" voice; it sells the detective vibe.

Fonts are bundled into the build (woff2), not loaded from a CDN — a strict
consequence of the no-external-request / static-hosting posture (CLAUDE.md §2).

## Motion

Subtle, purposeful, respects `prefers-reduced-motion`.

- **Auto-draw entrance** (§6.3.3): procedural strokes draw themselves on load.
- **Scan reveal:** when the detective evaluates (`evaluating` screen, 08), a
  sweep passes over the strokes before the verdict lands — the signature moment.
- Avoid bouncy/playful easing; favor precise, linear/ease-out "instrument" motion.

## Components — library policy (minimize deps)

UI surfaces are few: Header, IntroPrompt, VerdictPanel, ShareSheet, StatsScreen,
LockedScreen, language switcher, DevOverlay (08).

- **Default:** hand-built with Tailwind v4 utility classes.
- **Accessible primitives only where needed:** use **Radix UI primitives** (or
  Headless UI) for `Dialog` (stats / share sheet), `Popover` / `DropdownMenu`
  (language switcher). Unstyled, accessible, tree-shakeable.
- **Do NOT** add a full component kit (full shadcn/ui, MUI, Chakra…) — overkill
  for ~6 components and against the dependency budget.

## i18n & layout (see 09)

- All copy via `useT()` (09). Design for the **longest** of es/en/pt — Spanish/
  Portuguese strings run ~20–30% longer than English; buttons and the verdict
  line must not clip or reflow awkwardly. Test all three locales.
- `<html lang>` reflects the active locale.

## Accessibility

- Verdict is never conveyed by color alone — pair the signal color with text and
  an icon (🫥 / caught).
- Honor `prefers-reduced-motion` (skip scan/auto-draw, show final state).
- Focusable, keyboard-navigable controls; Radix primitives cover ARIA for dialogs.
- Touch targets ≥ 44px; the canvas owns gestures (`touch-action: none`, 01).

## Acceptance criteria

- [ ] Single signal color flips between win/caught states across verdict panel,
      confidence meter, and share card.
- [ ] Fonts are self-hosted (no external font requests in the network panel).
- [ ] Layout holds in all three locales without clipping (longest-string test).
- [ ] `prefers-reduced-motion` disables scan/auto-draw and shows the final frame.
- [ ] Verdict is distinguishable without color (text + icon).
- [ ] Only Radix/Headless primitives are added — no full component kit.

## Out of scope

- Light theme (v1 is dark-only). Theming tokens may be structured to allow it later.
