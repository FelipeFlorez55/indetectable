export type { Lang } from "./detect.ts";
export {
  SUPPORTED,
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  detectLang,
  loadLangOverride,
  saveLangOverride,
  resolveLang,
} from "./detect.ts";
export type { MessageKey, Dictionary } from "./messages.ts";
export { MESSAGES, makeT } from "./messages.ts";
export { LangProvider, useT } from "./LangProvider.tsx";
