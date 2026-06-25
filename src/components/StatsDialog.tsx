import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "../i18n/index.ts";
import { useGameStore } from "../store/gameStore.ts";

export function StatsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT();
  const store = useGameStore();
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const onImport = () => {
    const res = store.importFrom(importText.trim());
    setImportMsg(res.ok ? "✓" : (res.error ?? "error"));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-bold">{t("stats.title")}</Dialog.Title>

          <dl className="grid grid-cols-2 gap-3 font-mono text-sm">
            <Row label={t("stats.streak")} value={`🔥 ${store.currentStreak}`} />
            <Row label={t("stats.maxStreak")} value={`${store.maxStreak}`} />
            <Row label={t("stats.bestScore")} value={`${store.bestScore}`} />
            <Row label={t("stats.played")} value={`${store.totalPlayed}`} />
          </dl>

          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(store.exportTo())}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              {t("share.copy")} ⬇︎
            </button>
            <div className="flex gap-2">
              <input
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="paste backup…"
                className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs"
              />
              <button onClick={onImport} className="rounded-md border border-neutral-700 px-3 text-sm hover:bg-neutral-800">
                ↑
              </button>
            </div>
            {importMsg && <p className="font-mono text-xs text-neutral-400">{importMsg}</p>}
          </div>

          <Dialog.Close className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-200" aria-label="Close">
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-100">{value}</dd>
    </>
  );
}
