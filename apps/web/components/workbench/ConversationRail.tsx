"use client";

import type { Conversation } from "@pinocchio/shared";
import { HistoryIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { cx, compactDate } from "./utils";
import { useWorkbenchI18n, type WorkbenchTranslator } from "./workbenchI18n";

export function ConversationRail({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete
}: {
  conversations: Conversation[];
  activeId: string | undefined;
  onNew?: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useWorkbenchI18n();
  return (
    <aside className="flex min-h-0 flex-col border-r border-border/75 bg-sidebar/80">
      <div className="p-4">
        <BrandMark />
        {onNew ? (
          <button
            type="button"
            onClick={onNew}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-[0.9rem] bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--shadow-control)] transition active:translate-y-px"
          >
            <PlusIcon className="size-4" />
            {t("conversation.new")}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-4 pb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        <HistoryIcon className="size-3.5" />
        {t("conversation.history")}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <div className="mx-2 rounded-[0.9rem] border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
            {t("conversation.empty")}
          </div>
        ) : null}
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cx(
              "group mb-1 flex items-center gap-2 rounded-[0.9rem] border border-transparent px-3 py-2.5 transition hover:bg-background/75",
              activeId === conversation.id && "border-border bg-background shadow-sm"
            )}
          >
            <button type="button" onClick={() => onSelect(conversation.id)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-medium text-foreground">{conversation.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{compactDate(conversation.updatedAt)}</div>
            </button>
            <button
              type="button"
              aria-label={t("conversation.delete")}
              onClick={() => {
                if (confirmConversationDelete(conversation, window.confirm, t)) onDelete(conversation.id);
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function confirmConversationDelete(
  conversation: Pick<Conversation, "title">,
  confirm: (message: string) => boolean,
  t: WorkbenchTranslator
): boolean {
  return confirm(t("conversation.confirmDelete", { title: conversation.title }));
}
