"use client";

import type { Card } from "@pinocchio/shared";
import { ArchiveIcon, ArchiveRestoreIcon, CalendarDaysIcon, FolderKanbanIcon, MessageSquareTextIcon, SquareKanbanIcon } from "lucide-react";
import { cx } from "../workbench/utils";
import { useWorkbenchI18n } from "../workbench/workbenchI18n";

const iconMap = {
  chat: MessageSquareTextIcon,
  plan: FolderKanbanIcon,
  canvas: SquareKanbanIcon
} as const;

export function CardView({
  card,
  onArchiveToggle
}: {
  card: Card;
  onArchiveToggle: (id: string, archived: boolean) => void;
}) {
  const Icon = iconMap[card.type];
  const { t } = useWorkbenchI18n();
  return (
    <article className="rounded-[1rem] border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-normal text-muted-foreground">
            <Icon className="size-3.5" />
            {card.type}
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold">{card.title}</h3>
        </div>
        <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", card.archived ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700")}>
          {card.archived ? t("cards.archived") : t("cards.active")}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{card.summary || t("cards.noSummary")}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDaysIcon className="size-3.5" />
          {new Date(card.updatedAt).toLocaleDateString()}
        </span>
        <button
          type="button"
          onClick={() => onArchiveToggle(card.id, !card.archived)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-semibold text-foreground transition hover:bg-muted"
        >
          {card.archived ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}
          {card.archived ? t("cards.restore") : t("cards.archiveAction")}
        </button>
      </div>
    </article>
  );
}
