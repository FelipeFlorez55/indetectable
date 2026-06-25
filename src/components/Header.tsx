import { SUPPORTED, useT, type Lang } from "../i18n/index.ts";

type Mode = "daily" | "practice";

type Props = {
  mode: Mode;
  streak: number;
  onSetMode: (mode: Mode) => void;
  onOpenStats: () => void;
};

const LANG_LABEL: Record<Lang, string> = { es: "ES", en: "EN", pt: "PT" };

export function Header({ mode, streak, onSetMode, onOpenStats }: Props) {
  const { t, lang, setLang } = useT();
  return (
    <header className="flex w-full items-center justify-between gap-3 border-b border-neutral-800/60 px-1 py-3">
      <div className="flex items-baseline gap-2">
        <h1 className="bg-gradient-to-r from-emerald-300 via-neutral-100 to-neutral-400 bg-clip-text font-mono text-lg font-bold tracking-tight text-transparent">
          {t("app.title")}
        </h1>
        <span
          className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-sm text-amber-400"
          title={t("verdict.streak")}
        >
          🔥 {streak}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex overflow-hidden rounded-md border border-neutral-700"
          role="group"
          aria-label={t("mode.label")}
        >
          {(["daily", "practice"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => onSetMode(m)}
              aria-pressed={mode === m}
              className={`px-2.5 py-1 font-mono text-xs transition-colors ${
                mode === m
                  ? "bg-emerald-400 text-neutral-900"
                  : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {m === "daily" ? t("mode.daily") : t("mode.practice")}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-md border border-neutral-700" role="group" aria-label={t("lang.label")}>
          {SUPPORTED.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2 py-1 font-mono text-xs ${
                lang === l ? "bg-neutral-200 text-neutral-900" : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>

        <button
          onClick={onOpenStats}
          aria-label={t("stats.title")}
          className="rounded-md border border-neutral-700 px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          📊
        </button>
      </div>
    </header>
  );
}
