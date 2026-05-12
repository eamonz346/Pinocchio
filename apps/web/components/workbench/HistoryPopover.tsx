"use client";

import type { Conversation } from "@pinocchio/shared";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { ConversationRail } from "./ConversationRail";
import { useWorkbenchI18n } from "./workbenchI18n";

export function HistoryPopover({
  open,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onClose
}: {
  open: boolean;
  conversations: Conversation[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-dock-root]")) return;
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
      className="fixed bottom-24 left-1/2 z-50 hidden h-[min(72vh,680px)] w-[min(92vw,320px)] -translate-x-1/2 overflow-hidden rounded-[1.2rem] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-dock)] xl:block"
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="text-sm font-semibold">{t("conversation.history")}</div>
        <button type="button" onClick={onClose} className="icon-chip" aria-label={t("center.close", { title: t("conversation.history") })}>
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="h-[calc(100%-3rem)]">
        <ConversationRail
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            onSelect(id);
            onClose();
          }}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
