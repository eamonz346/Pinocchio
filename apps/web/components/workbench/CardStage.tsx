"use client";

import { Maximize2Icon, Minimize2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CardLayout, ResizeDirection, ViewportBounds, WorkbenchCardId, WorkbenchCardKind } from "./cardStageBounds";
import { fitCardLayoutToViewport as fitLayoutToViewportBounds, resizeLayout } from "./cardStageBounds";
import { cx } from "./utils";

export type { CardLayout, WorkbenchCardId, WorkbenchCardKind } from "./cardStageBounds";

export type CardLayoutMap = Record<WorkbenchCardId, CardLayout>;

export interface CardWindowControls {
  compact: boolean;
  fullscreen: boolean;
  moveProps: { onPointerDown: (event: PointerEvent<HTMLElement>) => void };
  onClose: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
}

export interface CardDefinition {
  id: WorkbenchCardId;
  kind: WorkbenchCardKind;
  title: string;
  icon: ReactNode;
  minWidth: number;
  minHeight: number;
  customChrome?: boolean;
  children: ReactNode | ((controls: CardWindowControls) => ReactNode);
}

const cardLayoutStorageVersion = "v5";
export function createDefaultCardLayout(id: WorkbenchCardId, kind: WorkbenchCardKind = kindFromId(id), viewport = defaultViewportSize()): CardLayout {
  const preset = layoutPreset(kind, viewport);
  return {
    x: centerAxis(viewport.width, preset.width, kind === "chat" ? 24 : 32),
    y: centerAxis(viewport.height, preset.height, kind === "chat" ? 20 : 32),
    width: preset.width,
    height: preset.height,
    zIndex: kind === "chat" ? 10 : kind === "plan" ? 20 : 30,
    visible: kind === "chat",
    customized: false,
    fullscreen: false
  };
}

export function createDefaultCardLayouts(viewport = defaultViewportSize()): CardLayoutMap {
  return { chat: createDefaultCardLayout("chat", "chat", viewport) };
}

export function createViewportCardLayouts(): CardLayoutMap {
  return createDefaultCardLayouts(viewportSize());
}

export function ensureCardLayouts(layouts: CardLayoutMap, cards: Pick<CardDefinition, "id" | "kind">[], viewport = viewportSize()): CardLayoutMap {
  const next = { ...layouts };
  for (const card of cards) {
    next[card.id] ??= createDefaultCardLayout(card.id, card.kind, viewport);
  }
  return fitCardLayoutsToViewport(next, viewport);
}

export function mergeCardLayouts(value: unknown): CardLayoutMap {
  const defaults = createViewportCardLayouts();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Record<string, Partial<CardLayout>>;
  const merged = Object.entries(source).reduce<CardLayoutMap>((result, [id, current]) => {
    const defaultsForId = createDefaultCardLayout(id, kindFromId(id), viewportSize());
    result[id] = {
      ...defaultsForId,
      ...numberField(current, "x"),
      ...numberField(current, "y"),
      ...numberField(current, "width"),
      ...numberField(current, "height"),
      ...numberField(current, "zIndex"),
      ...(typeof current.visible === "boolean" ? { visible: current.visible } : {}),
      ...(typeof current.customized === "boolean" ? { customized: current.customized } : {}),
      ...(typeof current.fullscreen === "boolean" ? { fullscreen: current.fullscreen } : {})
    };
    return result;
  }, { ...defaults });
  return fitCardLayoutsToViewport(merged);
}

export function cardLayoutStorageKey(conversationId: string) {
  const key = `pinocchio.card-layout.${cardLayoutStorageVersion}.${conversationId}`;
  migrateLegacyCardLayoutStorage(key, `deepseek-workbench.card-layout.${cardLayoutStorageVersion}.${conversationId}`);
  return key;
}

export function maxCardZIndex(layouts: CardLayoutMap) {
  return Math.max(0, ...Object.values(layouts).map((layout) => layout.zIndex));
}

export function fitCardLayoutsToViewport(layouts: CardLayoutMap, viewport = viewportSize()): CardLayoutMap {
  return Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, fitCardLayoutToViewport(layout, viewport)]));
}

export function cardLayoutsEqual(left: CardLayoutMap, right: CardLayoutMap) {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...ids].every((id) => {
    const a = left[id];
    const b = right[id];
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.zIndex === b.zIndex && a.visible === b.visible && a.customized === b.customized && a.fullscreen === b.fullscreen;
  });
}

export function CardStage({ layouts, focusedCard, cards, overlay = false, onLayout, onFocus, onClose, onReset }: {
  layouts: CardLayoutMap;
  focusedCard: WorkbenchCardId;
  cards: CardDefinition[];
  overlay?: boolean;
  onLayout: (id: WorkbenchCardId, layout: CardLayout) => void;
  onFocus: (id: WorkbenchCardId) => void;
  onClose: (id: WorkbenchCardId) => void;
  onReset: (id: WorkbenchCardId) => void;
}) {
  const compact = useCompactStage();
  const visibleCards = useMemo(() => cards.filter((card) => layouts[card.id]?.visible), [cards, layouts]);
  const compactId = visibleCards.some((card) => card.id === focusedCard) ? focusedCard : visibleCards[0]?.id;
  const viewport = viewportSize();

  return (
    <main className={cx("isolate overflow-hidden text-foreground", overlay ? "pointer-events-none fixed inset-0 z-[60]" : "relative z-0 h-dvh")} data-testid={overlay ? "card-overlay-stage" : "card-stage"}>
      {!overlay ? <div className="pointer-events-none absolute inset-0 bg-background/20" /> : null}
      {visibleCards.map((card) => {
        const layout = layouts[card.id];
        if (!layout || (compact && card.id !== compactId)) return null;
        return (
          <CardWindow
            key={card.id}
            card={card}
            layout={layout}
            viewport={viewport}
            compact={compact}
            focused={focusedCard === card.id}
            onLayout={(next) => onLayout(card.id, next)}
            onFocus={() => onFocus(card.id)}
            onClose={() => onClose(card.id)}
            onReset={() => onReset(card.id)}
          />
        );
      })}
    </main>
  );
}

function CardWindow({ card, layout, viewport, compact, focused, onLayout, onFocus, onClose, onReset }: {
  card: CardDefinition;
  layout: CardLayout;
  viewport: ViewportBounds;
  compact: boolean;
  focused: boolean;
  onLayout: (layout: CardLayout) => void;
  onFocus: () => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const windowRef = useRef<HTMLElement | null>(null);
  const fullscreen = Boolean(layout.fullscreen);
  const fittedLayout = compact || fullscreen ? layout : fitCardLayoutToViewport(layout, viewport);
  const style: CSSProperties = fullscreen
    ? { position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: layout.zIndex }
    : compact
      ? { left: 8, top: 8, width: "calc(100vw - 16px)", height: "calc(100dvh - 92px)", zIndex: layout.zIndex }
      : { left: fittedLayout.x, top: fittedLayout.y, width: fittedLayout.width, height: fittedLayout.height, zIndex: fittedLayout.zIndex };

  function startMove(event: PointerEvent<HTMLElement>) {
    if (compact || fullscreen || event.button !== 0 || (event.target as HTMLElement).closest("[data-card-control]")) return;
    event.preventDefault();
    onFocus();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layoutFromElement(layout, windowRef.current);
    const move = (nextEvent: globalThis.PointerEvent) => {
      onLayout({ ...fitCardLayoutToViewport({ ...startLayout, x: Math.round(startLayout.x + nextEvent.clientX - startX), y: Math.round(startLayout.y + nextEvent.clientY - startY) }, viewport), customized: true });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, direction: ResizeDirection) {
    if (compact || fullscreen || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layoutFromElement(layout, windowRef.current);
    const move = (nextEvent: globalThis.PointerEvent) => {
      onLayout({ ...fitCardLayoutToViewport(resizeLayout(startLayout, direction, nextEvent.clientX - startX, nextEvent.clientY - startY, card.minWidth, card.minHeight, viewport), viewport), customized: true });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function toggleFullscreen() {
    onFocus();
    onLayout(layout.fullscreen ? { ...layout, fullscreen: false, customized: true } : { ...layoutFromElement(layout, windowRef.current), fullscreen: true, customized: true });
  }

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLayout({ ...layout, fullscreen: false, customized: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, layout, onLayout]);

  const controls: CardWindowControls = { compact, fullscreen, moveProps: { onPointerDown: startMove }, onClose, onReset, onToggleFullscreen: toggleFullscreen };
  return (
    <section ref={windowRef} aria-label={`${card.title} card`} data-card-id={card.id} data-card-kind={card.kind} data-focused={focused} className={cx("pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden border bg-card/94 text-foreground shadow-[var(--shadow-panel)] backdrop-blur-xl transition-[box-shadow,border-color] duration-150", fullscreen ? "rounded-none" : "rounded-[1.05rem]", focused ? "border-primary/45 ring-1 ring-primary/20" : "border-border/90")} style={style} onPointerDown={onFocus}>
      {card.customChrome ? renderChildren(card.children, controls) : (
        <>
          <DefaultHeader card={card} controls={controls} />
          <div className="min-h-0 flex-1 overflow-hidden">{renderChildren(card.children, controls)}</div>
        </>
      )}
      {!compact && !fullscreen ? <ResizeHandles title={card.title} onResizeStart={startResize} /> : null}
    </section>
  );
}

function DefaultHeader({ card, controls }: { card: CardDefinition; controls: CardWindowControls }) {
  return (
    <header className="flex h-10 shrink-0 cursor-grab touch-none items-center justify-between gap-3 border-b border-border bg-background/85 px-3 active:cursor-grabbing" {...controls.moveProps}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[0.7rem] bg-muted text-muted-foreground [&>svg]:size-4">{card.icon}</span>
        <div className="min-w-0 truncate text-sm font-semibold">{card.title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <HeaderButton title="Toggle fullscreen" onClick={controls.onToggleFullscreen}>{controls.fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}</HeaderButton>
        <HeaderButton title="Reset layout" onClick={controls.onReset}><RotateCcwIcon /></HeaderButton>
        <HeaderButton title="Hide card" onClick={controls.onClose}><XIcon /></HeaderButton>
      </div>
    </header>
  );
}

export function HeaderButton({ children, title, onClick, disabled }: { children: ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return <button data-card-control type="button" disabled={disabled} className="icon-chip size-7 disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-3.5" title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

function renderChildren(children: CardDefinition["children"], controls: CardWindowControls) {
  return typeof children === "function" ? children(controls) : children;
}

function ResizeHandles({ title, onResizeStart }: { title: string; onResizeStart: (event: PointerEvent<HTMLButtonElement>, direction: ResizeDirection) => void }) {
  return (
    <>
      <ResizeHandle title={title} direction="n" className="left-6 right-6 top-0 h-3 cursor-ns-resize" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="s" className="bottom-0 left-6 right-6 h-3 cursor-ns-resize" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="e" className="bottom-6 right-0 top-6 w-3 cursor-ew-resize" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="w" className="bottom-6 left-0 top-6 w-3 cursor-ew-resize" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="nw" className="left-0 top-0 h-3 w-8 cursor-nwse-resize rounded-br-lg" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="ne" className="right-0 top-0 h-3 w-8 cursor-nesw-resize rounded-bl-lg" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="sw" className="bottom-0 left-0 size-7 cursor-nesw-resize rounded-tr-lg" onResizeStart={onResizeStart} />
      <ResizeHandle title={title} direction="se" className="bottom-0 right-0 size-7 cursor-nwse-resize rounded-tl-lg border-l border-t border-border bg-background/90" onResizeStart={onResizeStart} />
    </>
  );
}

function ResizeHandle({ title, direction, className, onResizeStart }: { title: string; direction: ResizeDirection; className: string; onResizeStart: (event: PointerEvent<HTMLButtonElement>, direction: ResizeDirection) => void }) {
  return <button data-card-control type="button" aria-label={`Resize ${title} ${direction}`} className={cx("absolute z-50 touch-none bg-transparent", className)} onPointerDown={(event) => onResizeStart(event, direction)} />;
}

function fitCardLayoutToViewport(layout: CardLayout, viewport = viewportSize()): CardLayout {
  return fitLayoutToViewportBounds(layout, viewport);
}

function layoutFromElement(layout: CardLayout, element: HTMLElement | null): CardLayout {
  if (!element) return layout;
  const box = element.getBoundingClientRect();
  return { ...layout, x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
}

function numberField(source: Partial<CardLayout> | undefined, key: "x" | "y" | "width" | "height" | "zIndex") {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } : {};
}

function viewportSize(bottomReserve = 0): ViewportBounds {
  if (typeof window === "undefined") return { width: 1440, height: 900, bottomReserve };
  return { width: document.documentElement.clientWidth || window.innerWidth, height: document.documentElement.clientHeight || window.innerHeight, bottomReserve };
}

function layoutPreset(kind: WorkbenchCardKind, viewport: { width: number; height: number }) {
  if (kind === "chat") return { width: Math.min(1040, Math.max(720, Math.round(viewport.width * 0.72))), height: Math.min(780, Math.max(540, viewport.height - 150)) };
  if (kind === "plan") return { width: Math.min(760, Math.max(500, Math.round(viewport.width * 0.48))), height: Math.min(760, Math.max(520, viewport.height - 150)) };
  return { width: Math.min(1080, Math.max(640, Math.round(viewport.width * 0.68))), height: Math.min(800, Math.max(540, viewport.height - 130)) };
}

function kindFromId(id: string): WorkbenchCardKind {
  if (id.startsWith("plan:")) return "plan";
  if (id.startsWith("canvas:")) return "canvas";
  return id === "plan" ? "plan" : id === "canvas" ? "canvas" : "chat";
}

function centerAxis(viewportLength: number, itemLength: number, minimum: number) {
  return Math.max(minimum, Math.round((viewportLength - itemLength) / 2));
}

function defaultViewportSize() {
  return { width: 1440, height: 900 };
}

function migrateLegacyCardLayoutStorage(key: string, legacyKey: string) {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(key) !== null) return;
    const legacyValue = window.localStorage.getItem(legacyKey);
    if (legacyValue !== null) window.localStorage.setItem(key, legacyValue);
  } catch {
    return;
  }
}

function useCompactStage() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const update = () => setCompact(window.innerWidth < 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return compact;
}
