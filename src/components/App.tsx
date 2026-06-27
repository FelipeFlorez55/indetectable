import { useCallback, useEffect, useMemo, useState } from "react";
import { LangProvider, useT } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/messages.ts";
import {
  AlgorithmicDetector,
  verdictTone,
  humanInsight,
  accusedKind,
  type Scene,
  type Stroke,
  type Verdict,
} from "../detector/index.ts";
import { buildSceneSpec, buildPracticeSceneSpec, generateProceduralStrokes, dailyRng, utcDayIndex, msUntilNextUtcDay } from "../scene/index.ts";
import { toDetectorConfig, type Level } from "../difficulty/index.ts";
import { useGameStore } from "../store/gameStore.ts";
import type { ShareData } from "../share/share.ts";
import { Header } from "./Header.tsx";
import { GameCanvas } from "./GameCanvas.tsx";
import { IntroScreen } from "./IntroScreen.tsx";
import { VerdictPanel } from "./VerdictPanel.tsx";
import { StatsDialog } from "./StatsDialog.tsx";

const detector = new AlgorithmicDetector();
type Screen = "loading" | "intro" | "locked" | "play" | "evaluating" | "verdict";
type Mode = "daily" | "practice";

function strokeLen(s: Stroke): number {
  let d = 0;
  for (let i = 1; i < s.points.length; i++) {
    d += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y);
  }
  return d;
}

function useCountdown(): string {
  const [ms, setMs] = useState(() => msUntilNextUtcDay());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextUtcDay()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Game() {
  const { t } = useT();
  const store = useGameStore();
  const today = useMemo(() => utcDayIndex(), []);

  const [mode, setMode] = useState<Mode>("daily");
  const [practiceSalt, setPracticeSalt] = useState(1);
  const [screen, setScreen] = useState<Screen>("loading");
  const [human, setHuman] = useState<Stroke | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false); // F4 — scan animation finished
  const [statsOpen, setStatsOpen] = useState(false);

  const onRevealDone = useCallback(() => setRevealed(true), []);

  useEffect(() => store.loadFromStorage(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the scene deterministically for the current mode.
  const { procedural, level } = useMemo((): { procedural: Stroke[]; level: Level } => {
    if (mode === "daily") {
      const spec = buildSceneSpec(today);
      return { procedural: generateProceduralStrokes(spec, dailyRng(today)), level: spec.level };
    }
    const lvl = ((practiceSalt % 3) + 1) as Level;
    const spec = buildPracticeSceneSpec(lvl, practiceSalt);
    return { procedural: generateProceduralStrokes(spec, dailyRng(practiceSalt)), level: lvl };
  }, [mode, today, practiceSalt]);

  const config = useMemo(() => toDetectorConfig(level), [level]);

  // Decide the initial screen once hydrated / when mode changes.
  useEffect(() => {
    if (!store.hydrated) return;
    setHuman(null);
    setVerdict(null);
    setRevealed(false);
    if (mode === "daily" && store.hasPlayedToday(today)) setScreen("locked");
    else setScreen("intro");
  }, [store.hydrated, mode, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const onStrokeComplete = useCallback(
    (raw: Stroke) => {
      if (raw.points.length < 5 || strokeLen(raw) < 20) return; // reject taps
      setHuman(raw);
      setRevealed(false);
      setScreen("evaluating");
      const scene: Scene = { procedural, humanStroke: raw };
      window.setTimeout(() => {
        const v = detector.evaluate(scene, config);
        setVerdict(v);
        if (mode === "daily") store.record(today, { score: v.playerScore, caught: !v.playerWon });
        setScreen("verdict");
      }, 400);
    },
    [procedural, config, mode, today, store],
  );

  // Practice replay. fresh=true → bump the salt for a new scene; fresh=false →
  // keep the salt to retry the SAME scene/motif and improve at it.
  const replayScene = useCallback((fresh: boolean) => {
    setHuman(null);
    setVerdict(null);
    setRevealed(false);
    if (fresh) setPracticeSalt((s) => s + 1);
    setScreen("play");
  }, []);

  const verdictText = (won: boolean): string =>
    won ? t("verdict.undetectable") : t("verdict.lost");

  const shareData = (v: Verdict, h: Stroke): ShareData => {
    const tone = verdictTone(v, config.threshold);
    return {
      day: today,
      level: level as 1 | 2 | 3,
      caught: !v.playerWon,
      confidence: v.confidence,
      score: v.playerScore,
      streak: store.effectiveStreak(today),
      verdictText: verdictText(v.playerWon),
      detectiveName: t("detective.name"),
      toneText: t(`verdict.tone.${tone}` as MessageKey),
      guessIndex: v.guessIndex,
      humanIndex: procedural.length,
      strokeCount: procedural.length + 1,
      accusedKind: accusedKind(v),
      labels: { score: t("verdict.score"), streak: t("verdict.streak") },
      scene: { procedural, humanStroke: h },
    };
  };

  const countdown = useCountdown();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-10">
      <Header
        mode={mode}
        streak={store.effectiveStreak(today)}
        onSetMode={setMode}
        onOpenStats={() => setStatsOpen(true)}
      />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        {screen === "loading" && <p className="font-mono text-neutral-500">…</p>}

        {screen === "intro" && (
          <IntroScreen procedural={procedural} level={level} onStart={() => setScreen("play")} />
        )}

        {(screen === "play" || screen === "evaluating") && (
          <>
            <p className="flex items-center gap-2 font-mono text-sm text-neutral-300">
              {screen === "evaluating" ? (
                <>
                  <span className="inline-block animate-scanpulse text-base">🔍</span>
                  {t("evaluating")}
                </>
              ) : (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  {t("intro.prompt")}
                </>
              )}
            </p>
            <GameCanvas
              procedural={procedural}
              drawingEnabled={screen === "play"}
              onStrokeComplete={onStrokeComplete}
              animate
            />
            {screen === "play" && (
              <p className="font-mono text-xs text-neutral-600">{t("draw.tapHint")}</p>
            )}
          </>
        )}

        {screen === "verdict" && verdict && human && (
          <>
            {mode === "practice" && revealed && (
              <div className="flex items-center gap-3">
                {/* Repetir: same salt → same scene/motif, another attempt to improve. */}
                <button
                  onClick={() => replayScene(false)}
                  className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-bold text-neutral-200 transition hover:border-neutral-500 hover:text-neutral-50 active:scale-[0.98]"
                >
                  ↻ {t("practice.retry")}
                </button>
                {/* Nueva: bump salt → a fresh scene. */}
                <button
                  onClick={() => replayScene(true)}
                  className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.98]"
                >
                  {t("practice.again")} →
                </button>
              </div>
            )}
            <GameCanvas
              procedural={procedural}
              drawingEnabled={false}
              committedHuman={human}
              accusedIndex={verdict.guessIndex}
              accusedKind={accusedKind(verdict)}
              onRevealDone={onRevealDone}
              compact
            />
            <div
              className={`flex w-full flex-col items-center transition-opacity duration-500 ${
                revealed ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <VerdictPanel
                verdict={verdict}
                tone={verdictTone(verdict, config.threshold)}
                threshold={config.threshold}
                insight={humanInsight(verdict, config)}
                shareData={shareData(verdict, human)}
                compact
              >
                {mode === "daily" && (
                  <p className="font-mono text-xs text-neutral-500">
                    {t("locked.nextIn", { time: countdown })}
                  </p>
                )}
              </VerdictPanel>
            </div>
          </>
        )}

        {screen === "locked" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-xl font-bold text-neutral-100">{t("locked.title")}</p>
            <GameCanvas procedural={procedural} drawingEnabled={false} />
            <p className="font-mono text-sm text-neutral-400">
              {t("verdict.streak")}: 🔥 {store.effectiveStreak(today)}
            </p>
            <p className="font-mono text-xs text-neutral-500">
              {t("locked.nextIn", { time: countdown })}
            </p>
          </div>
        )}
      </main>

      <footer className="mt-auto pt-4 text-center">
        <a
          href="https://felipeflorez.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-neutral-600 transition-colors hover:text-emerald-400"
        >
          hecho por Felipe Flórez ↗
        </a>
      </footer>

      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />
    </div>
  );
}

export function App() {
  return (
    <LangProvider>
      <Game />
    </LangProvider>
  );
}
