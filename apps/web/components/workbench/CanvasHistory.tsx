"use client";

import type { Canvas } from "@pinocchio/shared";
import { ChevronDownIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function CanvasHistory({ canvases, activeId, onSelect }: { canvases: Canvas[]; activeId?: string | undefined; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useWorkbenchI18n();
  if (!canvases.length) return null;
  const active = canvases.find((canvas) => canvas.id === activeId) ?? canvases[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 max-w-[160px] items-center gap-1.5 rounded-[0.8rem] px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-expanded={open}
        aria-label={t("canvas.list")}
        title={active?.title}
      >
        <FileTextIcon className="size-4" />
        <span className="truncate">{canvases.length}</span>
        <ChevronDownIcon className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-[1rem] border border-border bg-popover p-2 shadow-[var(--shadow-control)]">
          <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">{t("canvas.history")}</div>
          <div className="max-h-[340px] overflow-auto">
            {canvases.map((canvas) => (
              <button
                key={canvas.id}
                type="button"
                onClick={() => {
                  onSelect(canvas.id);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-[0.8rem] px-2.5 py-2 text-left text-xs transition",
                  activeId === canvas.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                title={canvas.title}
              >
                <FileTextIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{canvas.title}</span>
                <span className="shrink-0 opacity-70">v{canvas.version}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
