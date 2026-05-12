"use client";

import type { Card } from "@pinocchio/shared";
import { CardView } from "./CardView";
import { useWorkbenchI18n } from "../workbench/workbenchI18n";

export function CardList({
  cards,
  onArchiveToggle
}: {
  cards: Card[];
  onArchiveToggle: (id: string, archived: boolean) => void;
}) {
  const { t } = useWorkbenchI18n();
  if (!cards.length) {
    return <div className="p-4 text-sm text-muted-foreground">{t("cards.empty")}</div>;
  }
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2">
      {cards.map((card) => (
        <CardView key={card.id} card={card} onArchiveToggle={onArchiveToggle} />
      ))}
    </div>
  );
}
