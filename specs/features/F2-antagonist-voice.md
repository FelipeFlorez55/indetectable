# F2 — Antagonist voice + tiered accusation copy

> Expands CLAUDE.md §10 (the viral hook IS the accusation) and §16 (i18n: display
> strings only). Owns: `src/i18n/messages.ts` (new keys), a new pure
> `src/detector/flavor.ts` (outcome → copy key, deterministic), and the wiring in
> `VerdictPanel.tsx` / `App.tsx`. **No game-logic change** — selection is a pure
> function of data the verdict already carries.

---

## 0. Problem

The accusation is the product's viral payload (CLAUDE.md §10), but the verdict
ships **two flat strings** (`verdict.won` / `verdict.lost`). A 99-margin win and a
1-margin escape read identically. No character, nothing quotable.

## 1. Goal

1. Give the detective a **named identity and a cold, first-person system voice**.
2. Replace the two flat strings with **tiered lines keyed off how the round went**
   (margin + which stroke was accused), so the copy reacts to the player.

All static copy, localized es/en/pt. **No LLM** (CLAUDE.md §14 keeps that out of
the core repo).

## 2. The antagonist

- **Name:** `THE WARDEN` · es `EL CENTINELA` · pt `O VIGIA` (watcher; avoids the
  prison reading of *guardião/carcereiro*).
- **Voice:** emotionless classifier / surveillance log. Second person to the
  player, clipped system language about itself. Reframes the player as a *specimen
  trying to pass as machine*.
- This is the only place the name lives as a constant: `messages.ts`
  `detective.name`. Header/intro may reference it (F4 / future), but F2 just needs
  it for the verdict line.

## 3. Outcome tiers (pure)

`src/detector/flavor.ts` — DOM-free, deterministic, unit-tested. Input is the
`Verdict` + the level threshold `T`; output is a **message key** (string), never a
translated string (i18n stays in `messages.ts`, §16).

```ts
export type VerdictTone =
  | "caught.instant"   // caught, confidence very high above T
  | "caught.clear"     // caught, comfortably above T
  | "caught.close"     // caught, just above T
  | "won.hair"         // won, humanness just under T (squeaked through)
  | "won.clean"        // won, comfortably under T
  | "won.flawless"     // won, humanness ~0 (machine-perfect)
  | "won.decoy";       // won because a DECOY was accused (!caughtHuman) — special

export function verdictTone(v: Verdict, threshold: number): VerdictTone;
```

Banding (using `humanness` of the human stroke = `v.scores[last].humanness`,
and `v.confidence`, `v.caughtHuman`):

- `!playerWon` (caught):
  - `confidence - T > 0.25` → `caught.instant`
  - `confidence - T > 0.08` → `caught.clear`
  - else → `caught.close`
- `playerWon` and `!caughtHuman` → `won.decoy` (the framed-the-machine flex).
- `playerWon` and `caughtHuman`:
  - `humanHumanness < 0.05` → `won.flawless`
  - `T - humanHumanness < 0.06` → `won.hair`
  - else → `won.clean`

Bands are constants at the top of the file (calibration knobs). Deterministic:
same verdict → same tone, worldwide.

> **Optional flavor (nice-to-have, keep behind the same file):** within a tone,
> pick one of ~3 variants by a **seed-derived index** (`dayIndex % n`) so everyone
> who got the same outcome that day gets the *same* burn (a shared in-joke,
> CLAUDE.md §16 byte-stable). Translate the words; keep the index seed-driven.
> Ship single-line-per-tone first; variants are additive.

## 4. Copy (EN — localize es/pt with the same keys)

New `MessageKey`s, e.g. `verdict.tone.caught.instant`, … `verdict.tone.won.decoy`.
Interpolate numbers (`{ms}`, `{pct}`) so translated strings stay byte-stable.

| Tone | EN line (sample) |
|---|---|
| `caught.instant` | Detected on contact. You weren't even close. |
| `caught.clear` | Anomaly isolated. The human always trembles. |
| `caught.close` | Caught — but barely. Your hand nearly held still. |
| `won.hair` | Cleared by a whisker. The Warden hesitated. |
| `won.clean` | No anomaly found. Clean hands. |
| `won.flawless` | Indistinguishable from the machine. Are you sure you're human? |
| `won.decoy` | It accused one of its own. You didn't hide — you framed the machine. |

Keep the existing `verdict.undetectable` ("Undetectable 🫥") as the short headline;
the tone line is the **subhead** that gives it texture. Caught headline becomes the
Warden speaking, e.g. `🔍 {detective.name}` over the tone line.

## 5. Wiring

- `App.tsx`: compute `tone = verdictTone(verdict, T)` (T from the level config —
  already available via `toDetectorConfig(level).threshold`). Pass `tone` into the
  share data (F5 reuses it) and to `VerdictPanel`.
- `VerdictPanel.tsx`: render `t(\`verdict.tone.${tone}\`)` as the subhead; show the
  Warden name on caught. Keep `compact` layout intact.

## 6. i18n invariants (§16)

- Only **display strings** are added. The **tone selection** (`flavor.ts`) is
  English-keyed and locale-independent.
- Numbers interpolated, not embedded, so es/en/pt are byte-stable in logic.

## 7. Tests (`src/detector/flavor.test.ts`)

1. Each band maps to the expected tone (construct synthetic `Verdict`s at the
   boundary values).
2. `won.decoy` wins over the humanness bands when `!caughtHuman` (priority).
3. Determinism: same verdict → same tone.
4. (If variants shipped) variant index is a pure function of `dayIndex`.

## 8. Out of scope

- LLM-generated text (§14, v2+).
- The scan animation (F4) and the share grid (F5) — they *consume* the tone but
  are separate features.
