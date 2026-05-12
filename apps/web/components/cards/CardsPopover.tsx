"use client";

import type { Card } from "@pinocchio/shared";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listCards, setCardArchived } from "../../lib/apiClient";
import { CenterPanel } from "../panels/CenterPanel";
import { CardList } from "./CardList";
import { useWorkbenchI18n } from "../workbench/workbenchI18n";

type FilterMode = "active" | "archived" | "all";

export function CardsPopover({
  open,
  onClose,
  conversationId
}: {
  open: boolean;
  onClose: () => void;
  conversationId?: string | undefined;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("active");
  const [search, setSearch] = useState("");
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, filterMode, conversationId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (filterMode === "active" && card.archived) return false;
      if (filterMode === "archived" && !card.archived) return false;
      if (!term) return true;
      return `${card.title} ${card.summary} ${card.type}`.toLowerCase().includes(term);
    });
  }, [cards, filterMode, search]);

  return (
    <CenterPanel open={open} title={t("cards.title")} subtitle={t("cards.subtitle")} onClose={onClose}>
      <div className="border-b border-border p-4">
        <div data-testid="cards-tabs" className="flex gap-2">
          <TabButton active={filterMode === "active"} onClick={() => setFilterMode("active")}>{t("cards.working")}</TabButton>
          <TabButton active={filterMode === "archived"} onClick={() => setFilterMode("archived")}>{t("cards.archive")}</TabButton>
          <TabButton active={filterMode === "all"} onClick={() => setFilterMode("all")}>{t("cards.all")}</TabButton>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-[0.9rem] border border-border bg-background px-3 py-2 text-sm">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={t("cards.search")}
          />
        </label>
      </div>
      <CardList cards={filtered} onArchiveToggle={handleArchiveToggle} />
    </CenterPanel>
  );

  async function refresh() {
    if (!conversationId) {
      setCards([]);
      return;
    }
    setCards(await listCards(filterMode === "all" ? { conversationId } : { archived: filterMode === "archived", conversationId }));
  }

  async function handleArchiveToggle(id: string, archived: boolean) {
    const next = await setCardArchived(id, archived, conversationId);
    setCards((current) => current.map((card) => (card.id === id ? next : card)));
  }
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: import("react").ReactNode;
  }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-[0.75rem] px-3 py-2 text-xs font-semibold text-muted-foreground transition data-[active=true]:bg-muted data-[active=true]:text-foreground"
    >
      {children}
    </button>
  );
}
