import { cardLayoutStorageKey, createDefaultCardLayout, createDefaultCardLayouts, createViewportCardLayouts, fitCardLayoutsToViewport, mergeCardLayouts, type CardDefinition, type CardLayoutMap, type WorkbenchCardId, type WorkbenchCardKind } from "./CardStage";

export function loadCardLayouts(conversationId: string | undefined): CardLayoutMap {
  if (!conversationId) return typeof window === "undefined" ? createDefaultCardLayouts() : createViewportCardLayouts();
  try {
    const value = window.localStorage.getItem(cardLayoutStorageKey(conversationId));
    return value ? mergeCardLayouts(JSON.parse(value)) : createViewportCardLayouts();
  } catch {
    return createViewportCardLayouts();
  }
}

export function ensureRenderableLayouts(layouts: CardLayoutMap, cards: Pick<CardDefinition, "id" | "kind">[]) {
  const next = { ...layouts };
  for (const card of cards) {
    next[card.id] ??= createDefaultCardLayout(card.id, card.kind);
  }
  return fitCardLayoutsToViewport(next);
}

export function firstVisibleCard(layouts: CardLayoutMap, ids: WorkbenchCardId[]): WorkbenchCardId {
  return ids.find((id) => layouts[id]?.visible) ?? "chat";
}

export function hasVisibleKind(layouts: CardLayoutMap, kind: WorkbenchCardKind) {
  return Object.entries(layouts).some(([id, layout]) => layout.visible && kindFromCardId(id) === kind);
}

export function canvasCardId(id: string) {
  return `canvas:${id}`;
}

export function planCardId(id: string) {
  return `plan:${id}`;
}

export function kindFromCardId(id: string): WorkbenchCardKind {
  if (id.startsWith("canvas:")) return "canvas";
  if (id.startsWith("plan:")) return "plan";
  return "chat";
}

export function buildChatAnchors(messages: { id: string; role: string; content?: string | null }[]) {
  const seen = new Set<string>();
  return messages.flatMap((message, index) => {
    if (message.role !== "user" || !message.content?.trim()) return [];
    const label = message.content.replace(/\s+/g, " ").trim().slice(0, 42);
    const signature = label.toLowerCase();
    if (seen.has(signature)) return [];
    seen.add(signature);
    return [{ id: message.id, label, index }];
  });
}
