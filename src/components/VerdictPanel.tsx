import { useT } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/messages.ts";
import type { FeatureKey, Insight, Verdict, VerdictTone } from "../detector/index.ts";
import { ShareSheet } from "./ShareSheet.tsx";
import type { ShareData } from "../share/share.ts";

type Props = {
  verdict: Verdict;
  tone: VerdictTone; // F2 — outcome-tiered copy
  threshold: number; // F3 — for the meter tick
  insight: Insight | null; // F3 — what gave the human away
  shareData: ShareData;
  compact?: boolean; // tighter layout for the verdict screen
  children?: React.ReactNode; // trailing action (e.g. "new scene" or countdown)
};

const FEATURE_LABEL: Record<FeatureKey, MessageKey> = {
  shape: "feature.shape",
  jitter: "feature.jitter",
  speedCV: "feature.speedCV",
  speedPauses: "feature.speedPauses",
  curvature: "feature.curvature",
  overshoot: "feature.overshoot",
  pressure: "feature.pressure",
};

export function VerdictPanel({ verdict, tone, insight, shareData, compact, children }: Props) {
  const { t } = useT();
  const won = verdict.playerWon;
  // Caught, but only just over the line → amber "casi", not the harsh red.
  const nearMiss = !won && tone === "caught.close";
  const signal = won ? "text-emerald-400" : nearMiss ? "text-amber-400" : "text-red-400";
  const meterColor = won ? "bg-emerald-500" : nearMiss ? "bg-amber-500" : "bg-red-500";
  const invisible = verdict.invisibility; // 0..100, 50 = the catch line

  const toneKey = `verdict.tone.${tone}` as MessageKey;

  // Player-facing feedback. Win → optional "almost"; near miss → "casi invisible";
  // clean loss → what gave you away (plain — no scary "X× the machine" multiplier).
  const feedbackLine = (() => {
    if (won) return insight ? t("feature.almost", { label: t(FEATURE_LABEL[insight.feature]) }) : null;
    if (nearMiss) return t("verdict.almostInvisible");
    if (!insight) return t("feature.clean");
    return t("feature.tellPlain", { label: t(FEATURE_LABEL[insight.feature]) });
  })();

  return (
    <div className={`flex flex-col items-center text-center animate-inkfade ${compact ? "gap-3" : "gap-5"}`}>
      <div>
        <p className={`font-bold ${compact ? "text-xl" : "text-2xl"} ${signal}`}>
          {won ? t("verdict.undetectable") : `🔍 ${t("detective.name")}`}
        </p>
        {/* F2 — the tiered, in-character line is the viral payload. */}
        <p className="mt-1 max-w-xs text-sm text-neutral-400">{t(toneKey)}</p>
      </div>

      <div className="flex items-end gap-6 font-mono">
        <Stat label={t("verdict.score")} value={`${verdict.playerScore}`} compact={compact} />
        <Stat label={t("verdict.streak")} value={`🔥 ${shareData.streak}`} compact={compact} />
      </div>

      {/* Invisibility meter: how invisible YOU were. 50% = the catch line — above
          it your stroke clears the bar, below it you're spotted. */}
      <div className="w-full max-w-xs">
        <div className="mb-1 flex justify-between font-mono text-xs text-neutral-500">
          <span>{t("verdict.invisibility")}</span>
          <span>{invisible}%</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-800">
          <div className={`h-full ${meterColor}`} style={{ width: `${invisible}%` }} />
          {/* The catch line at 50% — makes "so close" visible. */}
          <div
            aria-hidden
            title={t("verdict.catchLine")}
            className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-neutral-300"
            style={{ left: "50%" }}
          />
        </div>
      </div>

      {feedbackLine && <p className="font-mono text-xs text-neutral-500">{feedbackLine}</p>}

      <ShareSheet data={shareData} />
      {children}
    </div>
  );
}

function Stat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`font-bold text-neutral-100 ${compact ? "text-2xl" : "text-3xl"}`}>{value}</span>
      <span className="text-xs uppercase tracking-widest text-neutral-500">{label}</span>
    </div>
  );
}
