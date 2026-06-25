// Locale detection & selection (spec 09). Pure where possible; the browser/
// storage edges are injectable for tests. i18n is presentation only — it never
// touches game logic (seed key, storage, FeatureKeys stay locale-independent).

export type Lang = "es" | "en" | "pt";
export const SUPPORTED: readonly Lang[] = ["es", "en", "pt"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_STORAGE_KEY = "indetectable:lang";

function isLang(x: string): x is Lang {
  return (SUPPORTED as readonly string[]).includes(x);
}

/** Pick the best supported language from a list of BCP-47 tags (primary subtag). */
export function detectLang(preferred?: readonly string[]): Lang {
  const tags =
    preferred ??
    (typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []);
  for (const tag of tags) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLang(primary)) return primary;
  }
  return DEFAULT_LANG;
}

export function loadLangOverride(storage?: Storage): Lang | null {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    const v = s?.getItem(LANG_STORAGE_KEY);
    return v && isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLangOverride(lang: Lang, storage?: Storage): void {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    s?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** Resolution order: manual override → browser detection → DEFAULT_LANG. */
export function resolveLang(storage?: Storage, preferred?: readonly string[]): Lang {
  return loadLangOverride(storage) ?? detectLang(preferred);
}
