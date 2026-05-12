"use client";

import { XIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../workbench/utils";
import { useWorkbenchI18n } from "../workbench/workbenchI18n";

export function CenterPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
  className
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-dock-control], [data-dock-trigger], [data-dock-nav]")) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      data-testid="center-panel"
      className={cx(
        "fixed bottom-32 left-1/2 flex flex-col h-[min(70vh,720px)] w-[min(92vw,760px)] -translate-x-1/2 overflow-hidden rounded-[1.2rem] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-dock)]",
        "pointer-events-auto z-[120]",
        className
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <button type="button" onClick={onClose} className="icon-chip" aria-label={t("center.close", { title })}>
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
