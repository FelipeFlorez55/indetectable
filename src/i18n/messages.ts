// Dictionaries (spec 09). Stable, English-named keys → translated strings.
// Interpolation tokens are {name}. Missing keys fall back to the English value.

import { DEFAULT_LANG, type Lang } from "./detect.ts";

export type MessageKey =
  | "app.title"
  | "app.tagline"
  | "intro.prompt"
  | "intro.start"
  | "intro.how"
  | "intro.step1"
  | "intro.step2"
  | "intro.step3"
  | "draw.tapHint"
  | "evaluating"
  | "verdict.undetectable"
  | "verdict.caught"
  | "verdict.won"
  | "verdict.lost"
  | "verdict.confidence"
  | "verdict.score"
  | "verdict.streak"
  | "share.cta"
  | "share.whatsapp"
  | "share.copy"
  | "share.copied"
  | "share.download"
  | "share.template.drawing"
  | "share.template.score"
  | "stats.title"
  | "stats.streak"
  | "stats.maxStreak"
  | "stats.bestScore"
  | "stats.played"
  | "locked.title"
  | "locked.nextIn"
  | "mode.label"
  | "mode.daily"
  | "mode.practice"
  | "practice.again"
  | "practice.retry"
  | "lang.label"
  // F2 — antagonist voice + tiered copy
  | "detective.name"
  | "verdict.tone.caught.instant"
  | "verdict.tone.caught.clear"
  | "verdict.tone.caught.close"
  | "verdict.tone.won.hair"
  | "verdict.tone.won.clean"
  | "verdict.tone.won.flawless"
  | "verdict.tone.won.decoy"
  // F3 — verdict feedback
  | "feature.shape"
  | "feature.jitter"
  | "feature.speedCV"
  | "feature.speedPauses"
  | "feature.curvature"
  | "feature.overshoot"
  | "feature.pressure"
  | "feature.tell"
  | "feature.tellPlain"
  | "feature.almost"
  | "feature.clean"
  | "verdict.threshold"
  | "verdict.invisibility"
  | "verdict.catchLine"
  | "verdict.almostInvisible"
  // F5 — roast-first share
  | "share.ctaCaught";

export type Dictionary = Record<MessageKey, string>;

const en: Dictionary = {
  "app.title": "Indetectable",
  "app.tagline": "Hide your stroke among the machine's. Can the detective catch you?",
  "intro.prompt": "Add one stroke. Don't get caught.",
  "intro.start": "Start drawing",
  "intro.how": "How to play",
  "intro.step1": "The machine painted these strokes. Study its style.",
  "intro.step2": "Add a single stroke — blend in, hide among them.",
  "intro.step3": "A detective hunts the human line. Stay undetectable.",
  "draw.tapHint": "Draw a line — a single tap won't count.",
  evaluating: "Analyzing strokes…",
  "verdict.undetectable": "Undetectable 🫥",
  "verdict.caught": "Caught you in {ms}",
  "verdict.won": "You stayed invisible.",
  "verdict.lost": "The detective found you.",
  "verdict.confidence": "Confidence",
  "verdict.invisibility": "Invisibility",
  "verdict.catchLine": "caught",
  "verdict.almostInvisible": "So close — almost invisible.",
  "verdict.score": "Score",
  "verdict.streak": "Streak",
  "share.cta": "Share",
  "share.whatsapp": "WhatsApp",
  "share.copy": "Copy result",
  "share.copied": "Copied!",
  "share.download": "Download image",
  "share.template.drawing": "Drawing",
  "share.template.score": "Score",
  "stats.title": "Your stats",
  "stats.streak": "Current streak",
  "stats.maxStreak": "Best streak",
  "stats.bestScore": "Best score",
  "stats.played": "Days played",
  "locked.title": "You've played today",
  "locked.nextIn": "Next challenge in {time}",
  "mode.label": "Mode",
  "mode.daily": "Daily",
  "mode.practice": "Practice",
  "practice.again": "New scene",
  "practice.retry": "Retry scene",
  "lang.label": "Language",
  "detective.name": "THE WARDEN",
  "verdict.tone.caught.instant": "Detected on contact. You weren't even close.",
  "verdict.tone.caught.clear": "Anomaly isolated. The human always trembles.",
  "verdict.tone.caught.close": "Caught — but barely. Your hand nearly held still.",
  "verdict.tone.won.hair": "Cleared by a whisker. It hesitated.",
  "verdict.tone.won.clean": "No anomaly found. Clean hands.",
  "verdict.tone.won.flawless": "Indistinguishable from the machine. Are you sure you're human?",
  "verdict.tone.won.decoy": "It accused one of its own. You didn't hide — you framed the machine.",
  "feature.shape": "wrong shape",
  "feature.jitter": "tremor",
  "feature.speedCV": "uneven pace",
  "feature.speedPauses": "pauses & reversals",
  "feature.curvature": "shaky curves",
  "feature.overshoot": "overshot endpoints",
  "feature.pressure": "pressure",
  "feature.tell": "Gave you away: {label} ({ratio}× the machine).",
  "feature.tellPlain": "Gave you away: {label}.",
  "feature.almost": "Nearly caught you: {label}.",
  "feature.clean": "Nothing gave you away. Machine-clean.",
  "verdict.threshold": "limit",
  "share.ctaCaught": "Share the evidence",
};

const es: Dictionary = {
  "app.title": "Indetectable",
  "app.tagline": "Esconde tu trazo entre los de la máquina. ¿Te atrapará el detective?",
  "intro.prompt": "Añade un trazo. Que no te atrapen.",
  "intro.start": "Empezar a dibujar",
  "intro.how": "Cómo jugar",
  "intro.step1": "La máquina pintó estos trazos. Estudia su estilo.",
  "intro.step2": "Añade un solo trazo — mézclate, escóndete entre ellos.",
  "intro.step3": "Un detective busca la línea humana. Sé indetectable.",
  "draw.tapHint": "Dibuja una línea — un toque suelto no cuenta.",
  evaluating: "Analizando trazos…",
  "verdict.undetectable": "Indetectable 🫥",
  "verdict.caught": "Te atrapé en {ms}",
  "verdict.won": "Te mantuviste invisible.",
  "verdict.lost": "El detective te encontró.",
  "verdict.confidence": "Confianza",
  "verdict.invisibility": "Invisibilidad",
  "verdict.catchLine": "atrapado",
  "verdict.almostInvisible": "Por poco — casi invisible.",
  "verdict.score": "Puntos",
  "verdict.streak": "Racha",
  "share.cta": "Compartir",
  "share.whatsapp": "WhatsApp",
  "share.copy": "Copiar resultado",
  "share.copied": "¡Copiado!",
  "share.download": "Descargar imagen",
  "share.template.drawing": "Dibujo",
  "share.template.score": "Puntos",
  "stats.title": "Tus estadísticas",
  "stats.streak": "Racha actual",
  "stats.maxStreak": "Mejor racha",
  "stats.bestScore": "Mejor puntaje",
  "stats.played": "Días jugados",
  "locked.title": "Ya jugaste hoy",
  "locked.nextIn": "Próximo reto en {time}",
  "mode.label": "Modo",
  "mode.daily": "Diario",
  "mode.practice": "Práctica",
  "practice.again": "Nueva escena",
  "practice.retry": "Repetir escena",
  "lang.label": "Idioma",
  "detective.name": "EL CENTINELA",
  "verdict.tone.caught.instant": "Detectado al instante. No estuviste ni cerca.",
  "verdict.tone.caught.clear": "Anomalía aislada. El humano siempre tiembla.",
  "verdict.tone.caught.close": "Atrapado — por poco. Tu pulso casi se mantuvo firme.",
  "verdict.tone.won.hair": "Pasaste por un pelo. Dudó.",
  "verdict.tone.won.clean": "Sin anomalías. Manos limpias.",
  "verdict.tone.won.flawless": "Indistinguible de la máquina. ¿Seguro que eres humano?",
  "verdict.tone.won.decoy": "Acusó a uno de los suyos. No te escondiste — incriminaste a la máquina.",
  "feature.shape": "forma distinta",
  "feature.jitter": "temblor",
  "feature.speedCV": "ritmo irregular",
  "feature.speedPauses": "pausas y reversas",
  "feature.curvature": "curvas temblorosas",
  "feature.overshoot": "extremos pasados",
  "feature.pressure": "presión",
  "feature.tell": "Te delató: {label} ({ratio}× la máquina).",
  "feature.tellPlain": "Te delató: {label}.",
  "feature.almost": "Casi te atrapa: {label}.",
  "feature.clean": "Nada te delató. Limpio como máquina.",
  "verdict.threshold": "límite",
  "share.ctaCaught": "Compartir la evidencia",
};

const pt: Dictionary = {
  "app.title": "Indetectable",
  "app.tagline": "Esconda seu traço entre os da máquina. O detetive vai te pegar?",
  "intro.prompt": "Adicione um traço. Não seja pego.",
  "intro.start": "Começar a desenhar",
  "intro.how": "Como jogar",
  "intro.step1": "A máquina pintou estes traços. Estude o estilo dela.",
  "intro.step2": "Adicione um único traço — misture-se, esconda-se entre eles.",
  "intro.step3": "Um detetive caça a linha humana. Fique indetectável.",
  "draw.tapHint": "Desenhe uma linha — um toque solto não conta.",
  evaluating: "Analisando traços…",
  "verdict.undetectable": "Indetectável 🫥",
  "verdict.caught": "Peguei você em {ms}",
  "verdict.won": "Você ficou invisível.",
  "verdict.lost": "O detetive te encontrou.",
  "verdict.confidence": "Confiança",
  "verdict.invisibility": "Invisibilidade",
  "verdict.catchLine": "pego",
  "verdict.almostInvisible": "Por pouco — quase invisível.",
  "verdict.score": "Pontos",
  "verdict.streak": "Sequência",
  "share.cta": "Compartilhar",
  "share.whatsapp": "WhatsApp",
  "share.copy": "Copiar resultado",
  "share.copied": "Copiado!",
  "share.download": "Baixar imagem",
  "share.template.drawing": "Desenho",
  "share.template.score": "Pontos",
  "stats.title": "Suas estatísticas",
  "stats.streak": "Sequência atual",
  "stats.maxStreak": "Melhor sequência",
  "stats.bestScore": "Melhor pontuação",
  "stats.played": "Dias jogados",
  "locked.title": "Você já jogou hoje",
  "locked.nextIn": "Próximo desafio em {time}",
  "mode.label": "Modo",
  "mode.daily": "Diário",
  "mode.practice": "Prática",
  "practice.again": "Nova cena",
  "practice.retry": "Repetir cena",
  "lang.label": "Idioma",
  "detective.name": "O VIGIA",
  "verdict.tone.caught.instant": "Detectado na hora. Você nem chegou perto.",
  "verdict.tone.caught.clear": "Anomalia isolada. O humano sempre treme.",
  "verdict.tone.caught.close": "Pego — por pouco. Sua mão quase ficou firme.",
  "verdict.tone.won.hair": "Passou por um triz. Ele hesitou.",
  "verdict.tone.won.clean": "Nenhuma anomalia. Mãos limpas.",
  "verdict.tone.won.flawless": "Indistinguível da máquina. Tem certeza de que é humano?",
  "verdict.tone.won.decoy": "Acusou um dos seus. Você não se escondeu — incriminou a máquina.",
  "feature.shape": "forma diferente",
  "feature.jitter": "tremor",
  "feature.speedCV": "ritmo irregular",
  "feature.speedPauses": "pausas e inversões",
  "feature.curvature": "curvas trêmulas",
  "feature.overshoot": "pontas ultrapassadas",
  "feature.pressure": "pressão",
  "feature.tell": "Te entregou: {label} ({ratio}× a máquina).",
  "feature.tellPlain": "Te entregou: {label}.",
  "feature.almost": "Quase te pegou: {label}.",
  "feature.clean": "Nada te entregou. Limpo como máquina.",
  "verdict.threshold": "limite",
  "share.ctaCaught": "Compartilhar a evidência",
};

export const MESSAGES: Record<Lang, Dictionary> = { en, es, pt };

/** Translate with optional {name} interpolation. Falls back to English. */
export function makeT(lang: Lang) {
  const dict = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANG];
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let str = dict[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };
}
