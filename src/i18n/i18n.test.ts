// i18n tests (spec 09 §acceptance). DOM-free.

import { describe, it, expect } from "vitest";
import { detectLang, resolveLang, loadLangOverride, saveLangOverride, SUPPORTED } from "./detect.ts";
import { MESSAGES, makeT, type MessageKey } from "./messages.ts";

function fakeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe("detectLang", () => {
  it("maps the primary subtag and falls back to en", () => {
    expect(detectLang(["pt-BR", "en"])).toBe("pt");
    expect(detectLang(["es-419"])).toBe("es");
    expect(detectLang(["en-US"])).toBe("en");
    expect(detectLang(["fr", "de"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});

describe("override + resolution", () => {
  it("persists and reads an override; override beats detection", () => {
    const s = fakeStorage();
    saveLangOverride("pt", s);
    expect(loadLangOverride(s)).toBe("pt");
    expect(resolveLang(s, ["es"])).toBe("pt"); // override wins over detection
  });
  it("with no override, resolution uses detection", () => {
    const s = fakeStorage();
    expect(resolveLang(s, ["es-AR"])).toBe("es");
  });
});

describe("dictionary completeness", () => {
  const keys = Object.keys(MESSAGES.en) as MessageKey[];
  for (const lang of SUPPORTED) {
    it(`${lang} has every message key`, () => {
      for (const k of keys) {
        expect(MESSAGES[lang][k], `${lang} missing ${k}`).toBeTruthy();
      }
    });
  }
  it("all three locales define the same key set", () => {
    const en = new Set(Object.keys(MESSAGES.en));
    for (const lang of SUPPORTED) {
      expect(new Set(Object.keys(MESSAGES[lang]))).toEqual(en);
    }
  });
});

describe("makeT", () => {
  it("interpolates {tokens}", () => {
    expect(makeT("en")("verdict.caught", { ms: "0.3s" })).toBe("Caught you in 0.3s");
    expect(makeT("es")("locked.nextIn", { time: "4h" })).toBe("Próximo reto en 4h");
  });
  it("falls back to English for a missing key without throwing", () => {
    const t = makeT("pt");
    // Unknown key returns the key itself (typed cast for the test).
    expect(t("does.not.exist" as MessageKey)).toBe("does.not.exist");
  });
});

describe("i18n never leaks into game logic (spec 09 hinge)", () => {
  it("no message string contains the locale-independent seed prefix", () => {
    for (const lang of SUPPORTED) {
      for (const v of Object.values(MESSAGES[lang])) {
        expect(v.includes("indetectable-")).toBe(false);
      }
    }
  });
});
