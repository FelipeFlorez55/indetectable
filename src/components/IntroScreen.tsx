import { useT } from "../i18n/index.ts";
import type { Stroke } from "../detector/index.ts";
import type { Level } from "../difficulty/index.ts";
import { GameCanvas } from "./GameCanvas.tsx";

type Props = {
  procedural: Stroke[];
  level: Level;
  onStart: () => void;
};

const LEVEL_DOT: Record<Level, string> = { 1: "🟢", 2: "🟡", 3: "🔴" };

export function IntroScreen({ procedural, level, onStart }: Props) {
  const { t } = useT();

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center animate-inkfade">
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400/80">
          {LEVEL_DOT[level]} {t("intro.how")}
        </p>
        <h2 className="max-w-md text-balance text-lg font-semibold text-neutral-200">
          {t("app.tagline")}
        </h2>
      </div>

      {/* A live preview of today's scene, so the player sees what they imitate. */}
      <div className="relative w-full max-w-[640px]">
        <GameCanvas procedural={procedural} drawingEnabled={false} animate />
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
      </div>

      <ol className="flex w-full max-w-md flex-col gap-2 text-left">
        {[t("intro.step1"), t("intro.step2"), t("intro.step3")].map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-lg border border-neutral-800/80 bg-neutral-900/40 px-3 py-2"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-xs font-bold text-emerald-400">
              {i + 1}
            </span>
            <span className="text-sm text-neutral-300">{step}</span>
          </li>
        ))}
      </ol>

      <button
        onClick={onStart}
        className="group relative mt-1 rounded-lg bg-emerald-500 px-7 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 hover:shadow-emerald-400/30 active:scale-[0.98]"
      >
        {t("intro.start")} →
      </button>
    </div>
  );
}
