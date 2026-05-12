"use client";

import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { useWorkbenchI18n } from "./workbenchI18n";

export function MobileSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useWorkbenchI18n();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm xl:hidden" role="dialog" aria-modal="true">
      <section className="absolute inset-y-0 right-0 flex w-[min(92vw,460px)] flex-col border-l border-border bg-card shadow-[var(--shadow-dock)]">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="icon-chip" aria-label={t("mobile.close")}>
            <XIcon className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </section>
    </div>
  );
}
