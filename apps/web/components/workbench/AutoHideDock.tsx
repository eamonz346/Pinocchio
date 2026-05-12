"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRef, useState } from "react";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function AutoHideDock({ primary, tools, overlay, className, onOpenChange }: { primary: ReactNode; tools?: ReactNode; overlay?: ReactNode; className?: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const { t } = useWorkbenchI18n();

  function updateOpen(next: boolean) {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => updateOpen(false), 180);
  }

  return (
    <div
      data-dock-root
      className={cx("group fixed inset-x-0 bottom-0 z-[1000] h-28 pointer-events-none", className)}
    >
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-[80]">
          {overlay}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-[70] grid w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 justify-items-stretch">
        <nav
          data-dock-nav
          aria-label={t("dock.aria")}
          className={cx(
            "mb-2 flex w-max max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-[1.1rem] border border-border/80 bg-background p-1.5 text-foreground opacity-0 shadow-[var(--shadow-dock)] backdrop-blur-xl transition-[transform,opacity] duration-200 ease-out sm:gap-2 sm:rounded-[1.35rem] sm:p-2",
            open ? "pointer-events-auto opacity-100" : "pointer-events-none"
          )}
          style={{ transform: open ? "translateY(0)" : "translateY(calc(100% + 1.25rem))" }}
          onMouseEnter={() => updateOpen(true)}
          onMouseLeave={scheduleClose}
          onFocus={() => updateOpen(true)}
        >
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{primary}</div>
          {tools ? (
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{tools}</div>
          ) : null}
        </nav>
        <button
          type="button"
          data-dock-trigger
          aria-label={t("dock.show")}
          className="pointer-events-auto relative h-5 w-full min-w-32 cursor-default border-0 bg-transparent p-0"
          onClick={() => updateOpen(!open)}
          onMouseEnter={() => updateOpen(true)}
          onMouseLeave={scheduleClose}
          onFocus={() => updateOpen(true)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span
            className={cx(
              "absolute inset-x-0 bottom-2 h-px rounded-full bg-foreground/40 transition-opacity duration-200",
              open && "opacity-0"
            )}
          />
        </button>
      </div>
    </div>
  );
}

export function DockControl({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      data-dock-control
      data-active={active}
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-[0.72rem] text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground sm:size-10 sm:rounded-[0.95rem] [&>svg]:size-3.5 sm:[&>svg]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function DockGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label={label}>{children}</div>;
}

export function DockSeparator() {
  return <div className="h-6 w-px shrink-0 bg-border/80 sm:h-7" aria-hidden="true" />;
}
