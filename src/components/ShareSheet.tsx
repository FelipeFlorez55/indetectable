import { useState } from "react";
import { useT } from "../i18n/index.ts";
import { share, shareToWhatsApp, type CardTemplate, type ShareData } from "../share/share.ts";

// Share controls (spec 07/08). Default template A (drawing); B (score) as toggle.
export function ShareSheet({ data }: { data: ShareData }) {
  const { t } = useT();
  const [template, setTemplate] = useState<CardTemplate>("drawing");
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const result = await share(data, template);
    if (result === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex overflow-hidden rounded-md border border-neutral-700 text-xs">
        {(["drawing", "score"] as CardTemplate[]).map((tpl) => (
          <button
            key={tpl}
            onClick={() => setTemplate(tpl)}
            aria-pressed={template === tpl}
            className={`px-3 py-1 font-mono ${
              template === tpl ? "bg-neutral-200 text-neutral-900" : "text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {tpl === "drawing" ? t("share.template.drawing") : t("share.template.score")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onShare}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
        >
          {copied ? t("share.copied") : data.caught ? t("share.ctaCaught") : t("share.cta")}
        </button>
        <button
          onClick={() => shareToWhatsApp(data)}
          className="rounded-md bg-[#25D366] px-4 py-2 text-sm font-semibold text-neutral-900 hover:brightness-110"
        >
          {t("share.whatsapp")}
        </button>
      </div>
    </div>
  );
}
