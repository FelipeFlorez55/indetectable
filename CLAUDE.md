# Indetectable — Project Spec

> **Working title:** "Indetectable" (provisional; change freely — alternatives: *Camuflaje*, *Ghostline*).
> **Domain:** `indetectable.felipeflorez.dev`
> **Status:** v1 (playable prototype). This document is the source of truth for agentic development (Claude Code / CLAUDE.md).

---

## 1. Vision in one sentence

A daily browser game where the AI draws **several instances of one motif** (e.g. four "W"s) in a consistent machine "handwriting" — same shape, same pace, same tremor — and you must **forge one more instance that blends in**. A **detective** (an algorithm, not an LLM in v1) points at the stroke that least belongs. **You win if it doesn't pick yours.**

The skill is **imitation, not cleanliness**: you have to decipher the motif's shape *and* reproduce the machine's exact rhythm and micro-tremor. Drawing too perfectly betrays you just as much as drawing too shakily. You can place your stroke anywhere on the board, any size — only its form and motion are judged.

The viral hook is not the leaderboard: it's the **AI's accusation** ("Undetectable 🫥" / "Caught you in 0.3s"), shareable Wordle-style.

---

## 2. Hard constraints (non-negotiable)

These constraints define the whole architecture. Every decision must respect them.

1. **No backend, no recurring cost.** No Supabase, no server, no database. Everything runs client-side.
2. **Public GitHub repo.** The code will be visible; no secrets, no API keys, no logic that relies on being hidden.
3. **Local persistence.** Streak, history, and stats live in `localStorage`. No accounts, no email, no sync in v1. Accepted tradeoff: clearing cache = losing progress.
4. **Free static hosting.** GitHub Pages or Cloudflare Pages. Pure static build.
5. **The v1 detective is algorithmic (no LLM).** Runs 100% in the browser, instant inference, $0.

---

## 3. Tech stack (with rationale)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React + Vite + TypeScript** | Static build, free deploy to GH Pages / Cloudflare Pages. Already-standardized stack. |
| Drawing (capture) | **Canvas 2D + Pointer Events API** | We must capture points **with timestamps** (`pointermove` + `getCoalescedEvents()`) to measure speed/jitter. SVG doesn't give fine timing. Captured by hand — no library — so raw points stay ours (§5.1). |
| Drawing (render) | **`perfect-freehand`** (0 deps, MIT, ~5KB) | Real-ink variable-width display path. Takes points we provide, returns an outline — never captures events, so the raw/display split (§6.3) is structural. Render-only; never imported by the detector. See specs/02. |
| Detector | **Pure TypeScript, no dependencies** | Functions over the captured polyline. Zero weight, zero network. |
| State | **Zustand** (or `useState`/Context to minimize deps) | Lightweight, readable in a public repo. |
| Styling | **Tailwind** + **Radix primitives** (Dialog/Popover only) | Tailwind for chrome (not the canvas, §6). Radix only where accessibility needs it; no full component kit. See specs/10. |
| i18n | **Custom ~50-line layer** (no dependency) | es/en/pt, browser-detected. UI strings only — never the game logic (§16). See specs/09. |
| Persistence | Wrapper over **`localStorage`** | No IndexedDB in v1; data volume is trivial. |
| PRNG / seed | Inline hash + PRNG (`xmur3` + `mulberry32`), **no dependency** | Deterministic daily challenge without a server. |
| Hosting | **AWS S3 + CloudFront** at `indetectable.felipeflorez.dev` (Route53 + ACM). Deploy: `./scripts/deploy.sh`. | Static, served from root so `base` stays `/`. (GH Pages / Cloudflare Pages remain valid free alternatives.) |

**Why Vite and not Next.js.** The game is 100% client-side, no backend, statically hosted. Next.js exists to solve server-side rendering, server routes, and API routes — none of which this project has. Adding it means carrying weight and complexity for features we explicitly don't use, and it complicates static deploy. Vite gives a pure static build and a `dist/` you upload as-is. This is exactly the right case for Vite.

**Base path detail.** For GitHub Pages the app serves from `user.github.io/repo/`, so `base` in `vite.config.ts` must point to `/repo/`. If you point `indetectable.felipeflorez.dev` at it instead, the subdomain serves from root and `base` stays `/` — cleaner, and one more reason to prefer the custom subdomain over raw GH Pages.

**No heavy dependencies on purpose.** The detector and the PRNG are ~200 lines of readable TS; they add educational value to the public repo and keep the bundle minimal.

---

## 4. Game loop (v1)

```
1. Load today's challenge → seed = hash(UTC date)
2. The AI paints N instances of the day's MOTIF (deterministic from the seed):
   one shape, drawn N times with a shared style + motor signature + small variance
3. The player draws 1 stroke (capturing points + timestamps), forging the motif
4. The detector scores ALL strokes → "odd-one-out" suspicion per stroke
5. The detective accuses the stroke that least fits the cluster (with confidence)
6. Resolution:
     - Caught     → streak breaks
     - Not caught → you win, score = how invisible you were
7. Shareable card (drawing + verdict + streak)
8. Lock until the next day (1 attempt per day, Wordle rule)
```

**One evaluation per round.** The player draws, gets evaluated, shares. No retries on the daily challenge (a "practice mode" with random, unlimited scenes may exist; see §11).

---

## 5. The detective — algorithm design (project core)

### 5.1 Input

Each stroke is an array of points:

```ts
type Point = { x: number; y: number; t: number };   // t = timestamp in ms
type Stroke = { points: Point[]; pressure?: number[] };
```

The scene = `P[]`, the N procedural **instances of the day's motif**, + the player's stroke `humanStroke` (one more forged instance).

> **Critical:** the detector consumes the **raw captured points**, never the smoothed/display path (see §6.3). Smoothing is cosmetic; feeding smoothed points to the detector destroys the jitter signal the whole game depends on.

### 5.2 Key principle: self-calibration against the scene itself

The detector **does not use an external training dataset**. It measures how far each stroke is from the **cluster of procedural instances present that day** — the N copies of the motif define a distribution on every feature (they vary a little on purpose, §7). Each feature of the player's stroke is converted into a *z-score* against that distribution. This makes the system self-calibrating, deterministic, and free of weights to maintain.

> **Two axes, both self-calibrated.** The cluster has a *shape* (the motif) and a *motion signature* (its pace + tremor). The player must land inside the cluster on **both** — see §5.3.

### 5.3 Features (from most robust to weakest)

0. **Shape conformance** *(the new backbone — "did you draw the motif?")*
   Normalize each stroke to be invariant to **position, scale, and rotation** ($1-recognizer / Procrustes style: resample to a fixed point count, center the centroid, scale to unit size, rotate to an indicative angle). The feature = distance from the stroke's normalized form to the cluster's mean form. *Wrong shape, or sloppy shape, → large distance → caught.* This is what lets the player draw **anywhere on the board, any size** (§13.5) while still being judged on form.

1. **Jitter / micro-tremor** *(motor backbone; two-sided, §5.4)*
   Smooth the stroke (Savitzky-Golay / moving-average baseline), measure the **residual deviation** of the raw points relative to the smoothed curve. RMS of the perpendicular distance, normalized by stroke length. The machine's instances carry a **deliberate, consistent tremor** (§7), so the target is *that* amount — too smooth betrays you as much as too shaky.

2. **Speed signature** *(two-sided)*
   `v = dist/dt` per segment. Feature = coefficient of variation of speed + number of reversals/pauses (`dt` spikes). The machine moves with a characteristic rhythm (not necessarily constant — see §7); the player must match *that* rhythm. Humans default to higher variability + micro-pauses, but over-controlling to a dead-constant speed is also an outlier.

3. **Curvature signature** *(two-sided)*
   Discrete curvature along the stroke. Feature = variance of the curvature derivative. The player matches the machine's curvature character — too noisy *or* too clean both read as the odd one out.

4. **Thickness/pressure uniformity** *(seasoning; nearly binary — see note)*
   If `pressure` exists (stylus/touch), variance of pressure. With a mouse it usually doesn't exist → optional, low-weight feature.
   > **Design note:** thickness is more binary than tremor (you either match it or you don't). Don't use it as the main difficulty axis; use it as a flavor element.

5. **Endpoint overshoot** *(optional)*
   Humans over/undershoot the connection point. Measure the gap to the expected anchor.

6. **Tremor frequency via FFT** *(reserved for "fine" levels / v3)*
   Human physiological tremor lives at ~8–12 Hz. FFT of the residual signal. Overkill for v1, but it's the ceiling of "how finely it can detect."

### 5.4 Scoring

```
For each feature f:
    z_f = (value_f(stroke) − mean_f(P)) / std_f(P)        // P = the day's motif instances

    suspicion_f = SHAPE feature  → normalize(z_f)         // one-sided: only FAR is suspicious
                  MOTOR features → normalize(|z_f|)       // two-sided: too clean OR too noisy

humanness(stroke) = Σ ( w_f · suspicion_f )               // w_f = fixed weights (§7)
```

**Why motor features are two-sided now (the core of the design).** The machine has a real motion signature — a nonzero amount of tremor, a characteristic speed rhythm. So a stroke that is *more regular than the cluster* (`z < 0`, e.g. a dead-straight constant-speed line when the machine wobbles) is just as much an outlier as one that's noisier. Suspicion uses `|z|`. (Shape stays one-sided: being *closer* to the mean form than average is never suspicious.) The machine's own instances therefore sit at a small natural `|z|`, not at 0 — the player wins by being **as in-distribution as a machine instance**, not by being perfect. *(This reverses the v0 one-sided rule, which only punished excess tremor.)*

The detective:

```
guess       = argmax_stroke humanness(stroke)        // the stroke that least fits the cluster
confidence  = humanness(guess)  (or top-1 vs top-2 separation)
```

**Player win condition:**

```
YOU WIN if:
   confidence < T            // the detective isn't sure enough to accuse → "I don't know"
   OR guess ≠ humanStroke    // a machine instance was a bigger outlier than you
```

`T` = the day's confidence threshold (a tuned constant, §7). The motif's intra-cluster variance is what gives the machine instances a believable spread (so a decoy can out-score you) and gives the player a *target zone with width* to aim for.

### 5.5 Player score (for streak / leaderboard feel)

```
invisibility = round(clamp(1 − humanness(humanStroke) / (2·T), 0, 1) · 100)
               // 50 = the catch line (humanness == T); >50 you'd clear the bar
score        = invisibility  (+ camouflage bonus if a machine instance out-scored you)
streak       = breaks on a real catch (Wordle rule)
```

**Score is always shown, even on a loss.** A near miss is no longer a flat 0 — the
*streak* breaks when you're caught, but the *score* (invisibility) reflects how
close you got, so progress is always visible. Higher = more invisible. This is the
player-facing meter; the 50% mark is the catch line.

---

## 6. Rendering & visual architecture

### 6.1 The split: Tailwind vs Canvas

Two separate worlds that don't overlap.

- **Tailwind** styles the **app chrome**: buttons, modals, the result card, the header, the streak/stats screen. This is where the "eye-catching" look comes from, and Tailwind is more than enough for it.
- **The drawing surface is a `<canvas>`, not HTML/CSS.** Tailwind has nothing to do with what happens inside the canvas. The player's strokes and the AI's procedural strokes are painted with the Canvas 2D API.

### 6.2 Decision: Canvas 2D, not SVG

Use **Canvas 2D**. Rationale: the detector needs raw, high-frequency point capture *with timestamps*, and Canvas + Pointer Events gives full control over the raw capture. SVG is more convenient for animation and styling but forces you to manage DOM nodes per stroke and doesn't fit the high-frequency capture the algorithm needs. SVG's one real advantage here — animating an "auto-draw" effect — is replicable in canvas by re-rendering the path frame by frame.

### 6.3 Visual polish levers (inside the canvas)

1. **Stroke rendering.** Don't draw straight segments between points. Smooth with **quadratic Bézier** curves and **modulate width by speed** (faster = thinner) for a real-ink feel instead of an MS-Paint look.
   > **Keep raw and display paths separate.** Render the smoothed/display path for looks, but store and feed the **raw** captured points to the detector. Never let cosmetic smoothing touch the data the detector reads (see §5.1).
2. **Procedural AI strokes.** Give them a deliberate, consistent style — same color, same width, clean curves — so the camouflage target is visually clear and the player knows what to imitate.
3. **Auto-draw animation (optional, later).** AI strokes "draw themselves" on load by progressively rendering the path over frames. This is the entrance "wow" moment.

### 6.4 Layering

Consider **two stacked canvases**: one for the static AI/procedural layer, one for the live human stroke. This lets you re-render the human layer every frame without repainting the whole scene. Alternative: a single canvas with an offscreen buffer holding the static scene.

---

## 7. Difficulty system

Difficulty moves on **one knob: motif complexity** (RESOLVED §13.2). The detective always looks at the **same** features (shape + jitter + speed + curvature) with the **same** weights and the **same** threshold `T`. What changes day to day is *which motif* you must forge — and a harder motif raises **both** axes at once, for free:

- **Shape** — more corners, cusps, and direction changes are harder to reproduce accurately, so the shape z-score climbs naturally.
- **Motion** — a complex path is harder to draw while *also* matching the machine's pace and tremor, so the motor features get harder in lockstep.

This is why a single knob suffices: complexity is not "the detective gets pickier," it's "there's more to get right." (`T` and the signature amplitudes are tuned **constants**, not per-level knobs — see specs/04.)

| Tier | Motif examples | Feel |
|---|---|---|
| **1 Easy** | gentle arc, soft wave, short line | One simple curve. Forgiving to forge. |
| **2 Medium** | "W" / zigzag, "S", single loop | A real shape with corners; match its rhythm. |
| **3 Hard** | spiral, figure-8, multi-cusp squiggle | Many direction changes — nail the form *and* the tremor. |
| **Fine (v3)** | + tremor FFT on top | The detective also checks tremor *frequency*. |

**The always-on motion signature (fairness backbone).** Every motif instance carries a **deliberate, consistent tremor + pace**, deterministic from the seed (this is what the old `decoyJitter` becomes — no longer a per-level knob but a permanent property of the machine's "handwriting"). It (a) gives the detective believable false candidates among its own instances, and (b) gives the player a concrete *imitation target*. The game is never "be a perfect machine" (impossible with a mouse) — it's **"forge this machine's exact handwriting,"** a real, winnable skill on any input device.

> Difficulty should feel like **"today's shape is trickier to forge,"** not "the detective got stricter." The detective is constant; the canvas is what changed.

**Calibration:** include a hidden dev mode that logs feature vectors of real strokes (mouse + touch) to tune the (constant) weights, `T`, and signature amplitudes before release. Not competitively secure (it's client-side and the seed is public), but fine for a casual honor-system game.

---

## 8. Deterministic daily challenge (no server)

The challenge is identical for everyone without a backend because the scene is derived from the date:

```ts
const dayIndex = Math.floor(Date.now() / 86_400_000); // UTC day
const seed = xmur3(`indetectable-${dayIndex}`)();
const rng = mulberry32(seed);
// rng() → picks the day's MOTIF + its motion signature, then N instances
//         (each with its own position/scale/rotation + small shape & signature variance)
```

- **Use the UTC date** so the "day" aligns globally and comparisons are fair.
- The entire scene (the motif, its signature, N, per-instance transforms) comes from `rng`. Same day → same scene for everyone.
- No network: the client computes the challenge on its own.

---

## 9. Persistence and streak (`localStorage`)

```ts
type GameState = {
  lastPlayedDay: number;     // UTC dayIndex of the last play
  currentStreak: number;
  maxStreak: number;
  bestScore: number;
  history: Array<{ day: number; score: number; caught: boolean }>;
  totalPlayed: number;
};
```

**Streak logic:**
- If already played today (`lastPlayedDay === todayIndex`) → show result, do **not** allow a new attempt.
- If `lastPlayedDay === todayIndex − 1` → the streak continues.
- If there's a gap (`< todayIndex − 1`) → the streak resets.
- `caught` breaks the streak even if they played.

**Streak > cumulative points** as the main visible metric: "You've been undetectable 6 days in a row" engages more than a big number.

**Optional backup (nice-to-have):** an "export progress" button that serializes the state into a copyable string, and "import" that restores it. The poor man's substitute for sync, with no backend.

---

## 10. Virality — shareable card (no backend)

The viral engine is the **AI's accusation**, not the global leaderboard.

- Generate the card **client-side**: render to a `<canvas>` → `toBlob()` → **Web Share API** (mobile) with a fallback to copy-to-clipboard / download PNG.
- Also a **Wordle-style text** (emojis + score + streak) you can paste anywhere without spoiling the day's challenge.
- Card content: thumbnail of the drawing + detective's verdict + streak + day.
- **Zero image upload anywhere** → free and private by design.

**Open decision (§13):** does the card show *drawing + verdict* (more personal, spy vibe) or just *score/streak* (cleaner, more mysterious)? Recommendation: ship both as two templates and A/B test which gets shared more.

> **No global "all-time" leaderboard.** It's demotivating (no one beats #1). If you want a ranking, make it **daily** and by **percentile** ("better than 84%"), which feels reachable — but that requires a backend, so it's out of scope for v1.

---

## 11. Modes

- **Daily challenge:** 1 attempt, scene from the day's seed, feeds streak/stats. (Core.)
- **Practice:** unlimited random scenes, doesn't affect the streak. Useful for learning to camouflage and so people don't run out of plays after the daily challenge.

---

## 12. Repo structure and split into specs

For agentic development, split into per-feature specs. Suggestion:

```
/
├─ CLAUDE.md                  # this document (global context)
├─ specs/
│   ├─ 01-canvas-capture.md   # Pointer Events, getCoalescedEvents, Stroke model (§5.1)
│   ├─ 02-rendering.md        # Canvas vs SVG, Bézier smoothing, width-by-speed, layering (§6)
│   ├─ 03-detector.md         # features, z-scores, scoring (§5) — the most critical
│   ├─ 04-difficulty.md       # motif complexity, the always-on signature (§7)
│   ├─ 05-daily-seed.md       # PRNG, deterministic scene (§8)
│   ├─ 06-persistence.md      # localStorage, streak, export/import (§9)
│   ├─ 07-share-card.md       # canvas→blob, Web Share, Wordle text, WhatsApp (§10)
│   ├─ 08-ui-flow.md          # screens, states, daily lock
│   ├─ 09-i18n.md             # es/en/pt, browser detection — UI strings only (§16)
│   └─ 10-ui-style.md         # visual language: palette, type, motion, components (§6.1)
├─ src/
│   ├─ detector/              # pure TS, testable without the DOM
│   ├─ scene/                 # procedural generation + seed
│   ├─ canvas/                # stroke capture + rendering
│   ├─ store/                 # state (Zustand)
│   ├─ i18n/                  # locale detection + dictionaries (no dependency)
│   └─ components/
└─ vite.config.ts             # base path for hosting
```

**The detector (`src/detector/`) must be pure TS and testable without the DOM** — so you can write tests with synthetic strokes (perfect procedural vs recorded human strokes) and validate separability before building any UI.

---

## 13. Open decisions (RESOLVED for v1)

1. **Shareable card template:** ship **both**; **default = Template A** (drawing +
   verdict), Template B (score/streak) as a toggle, Wordle **text always offered**.
   Plus a **WhatsApp deep link** (`wa.me/?text=`) for text+URL; the PNG reaches
   WhatsApp only via the native share sheet. → [specs/07-share-card.md](./specs/07-share-card.md).
2. **Difficulty model:** **one knob — motif complexity** (NOT a 3-knob feature
   ramp). The detective is constant (same features, weights, `T`); the day's
   **motif** sets the difficulty, on a **deterministic weekly rotation** by weekday
   (NYT-crossword ramp: Mon–Tue Easy, Wed–Thu Medium, Fri–Sun Hard), fixed per
   seed — NOT scaling with streak (breaks fair comparison). → [specs/04-difficulty.md](./specs/04-difficulty.md).
3. **Touch vs mouse:** **ignore pressure entirely in v1; do not normalize by input
   type.** A mouse reports `pressure 0.5/0` (no signal); pressure stays a future
   stylus-only flavor feature. → [specs/03-detector.md](./specs/03-detector.md).
4. **Initial calibration:** **~50–100 human strokes** across **≥5 people** and
   **both mouse + touch**; minimum ~30 per input type. Self-calibration keeps the
   need modest. → [specs/03-detector.md §6.5](./specs/03-detector.md).
5. **Placement is free; form is judged.** The player draws the motif **anywhere on
   the board, at any size/rotation** — the shape feature normalizes position,
   scale, and rotation away (§5.3.0). The detective never scores *where* you drew,
   only the form and the motion. Visual overlap of the machine's instances is
   cosmetic. → [specs/03-detector.md](./specs/03-detector.md).

---

## 14. Roadmap — v2 (NOT in v1)

v2 introduces a **qualitatively different detective**, not "the same one but finer."

- The v1 vector detector measures the **hand** (motor: tremor, speed — data that only exists during the stroke) **and the form**, but only against a **closed, known motif** — a template-matching problem ($1/Procrustes, §5.3.0) that needs no model.
- A **VLM** judges **open-ended visual coherence**: does your stroke fit an *arbitrary* scene's style/composition, with no known template to compare against? That's the judgment v1's geometric shape feature *can't* make and the VLM can. It's fooling a detector of *intent*, not of *pulse* — a distinct job from v1, not a finer version of it.

Options for v2 (keep behind a `Detector` interface so it plugs in without a rewrite):

- **Free, client-side:** SmolVLM or Moondream via **Transformers.js + WebGPU** (with WASM fallback). $0 inference; the cost is the initial model download. Fits the no-backend rule.
- **Dirt-cheap LLM for the accusation text only:** Gemini 2.5 Flash-Lite (~$0.0002 per round, with a free tier). Use it **only for the accusation's flavor text**, not for detection — that way you never pass it the game state and there's no billing risk. *This would break the "public repo, no secrets" rule unless done via your own edge function; keep it as an opt-in outside the core repo.*

**v2 golden rule:** the client **always knows the truth** (which stroke is the human's, from the canvas state). The model only simulates the adversary. It's never given the state, only the render — the detective can be wrong and the game stays honest.

---

## 15. Definition of "done" for v1

- [ ] Stroke capture with timestamps working on mouse and touch.
- [ ] Stroke rendering with Bézier smoothing + width-by-speed; raw points kept separate from display path.
- [ ] Detector with the 4 main features (shape conformance + jitter, speed, curvature) + self-calibrated z-scores; shape one-sided, motor two-sided.
- [ ] Difficulty via the single knob (motif complexity); constant detector config + always-on motion signature.
- [ ] Motif library (≥ Easy/Medium/Hard tiers); N instances per day with shared signature + per-instance variance.
- [ ] Deterministic daily challenge from a UTC seed.
- [ ] Streak + stats in `localStorage`, with a 1-attempt/day lock.
- [ ] Practice mode.
- [ ] Shareable card (canvas→PNG + Wordle text).
- [ ] Unit tests for the detector with synthetic strokes.
- [ ] Static deploy on GH Pages / Cloudflare Pages.
- [ ] UI in es/en/pt with browser auto-detection (logic stays English/locale-independent).

---

## 16. Internationalization (added)

The UI ships in **Spanish, English, and Portuguese**, **auto-detected from the
browser** (`navigator.languages`), with a manual override. **i18n touches display
strings ONLY** — it must never affect game logic: the seed key
(`indetectable-<dayIndex>`), `localStorage`/export format, `FeatureKey`s, and all
detector/scene internals stay English/locale-independent so the daily challenge
is byte-identical worldwide. No i18n dependency (a ~50-line custom layer).
→ [specs/09-i18n.md](./specs/09-i18n.md).