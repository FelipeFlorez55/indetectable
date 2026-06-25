import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { resolveLang, saveLangOverride, type Lang } from "./detect.ts";
import { makeT, type MessageKey } from "./messages.ts";

// Minimal i18n context — no external library (spec 09).

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

type LangContextValue = {
  lang: Lang;
  t: TFn;
  setLang: (l: Lang) => void;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => resolveLang());

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    saveLangOverride(l);
    setLangState(l);
  }, []);

  const value = useMemo<LangContextValue>(() => ({ lang, t: makeT(lang), setLang }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used within <LangProvider>");
  return ctx;
}
