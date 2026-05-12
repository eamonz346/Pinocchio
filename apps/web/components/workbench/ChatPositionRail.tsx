"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export interface ChatPositionAnchor {
  id: string;
  label: string;
  index: number;
}

export function ChatPositionRail({
  visible,
  anchors,
  scrollRootRef,
  onJumpToStart,
  onJumpToEnd,
  onJumpToMessage
}: {
  visible: boolean;
  anchors: ChatPositionAnchor[];
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onJumpToMessage: (id: string) => void;
}) {
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [railState, setRailState] = useState({ canScroll: false, atTop: true, atBottom: true, activeId: "" });
  const sampled = useMemo(() => sampleAnchors(anchors), [anchors]);
  const { t } = useWorkbenchI18n();

  const update = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const scrollable = root.scrollHeight - root.clientHeight;
    const canScroll = scrollable > 16;
    const distanceFromBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
    const progress = canScroll ? Math.min(100, Math.max(0, (root.scrollTop / scrollable) * 100)) : 100;
    const cursor = anchors.length <= 1 ? 0 : Math.round((progress / 100) * (anchors.length - 1));
    const targetIndex = anchors[cursor]?.index ?? 0;
    const active = closestAnchor(sampled, targetIndex);
    if (progressRef.current) progressRef.current.style.height = `${progress}%`;
    setRailState((current) => {
      const next = {
        canScroll,
        atTop: root.scrollTop <= 8,
        atBottom: distanceFromBottom <= 80,
        activeId: active?.id ?? ""
      };
      return sameState(current, next) ? current : next;
    });
  }, [anchors, sampled, scrollRootRef]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || !visible) return;
    const requestUpdate = () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(update);
    };
    requestUpdate();
    root.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      root.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [scrollRootRef, update, visible]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function updateOpen(next: boolean) {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    setOpen(next);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => updateOpen(false), 180);
  }

  if (!visible || !anchors.length) return null;
  return (
    <div data-testid="chat-position-rail-root" className="pointer-events-none absolute right-0 top-1/2 z-30 hidden -translate-y-1/2 items-stretch lg:flex">
      <nav
        data-testid="chat-position-rail"
        aria-label={t("chatRail.aria")}
        className={cx(
          "mr-2 flex translate-x-[calc(100%+1rem)] flex-col items-center gap-2 rounded-full border border-border bg-card/90 p-1.5 text-muted-foreground opacity-0 shadow-[var(--shadow-control)] backdrop-blur-xl transition-[transform,opacity] duration-200 ease-out",
          open ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none"
        )}
        onMouseEnter={() => updateOpen(true)}
        onMouseLeave={scheduleClose}
        onFocus={() => updateOpen(true)}
      >
        <RailButton title={t("chatRail.top")} disabled={!railState.canScroll || railState.atTop} onClick={onJumpToStart}>
          <ArrowUpIcon />
        </RailButton>
        <div className="relative flex min-h-32 w-7 flex-col items-center justify-between rounded-full bg-muted/70 py-2">
          <span className="absolute left-1/2 top-2 w-px -translate-x-1/2 rounded-full bg-primary/45" ref={progressRef} />
          {sampled.map((anchor) => (
            <button
              key={anchor.id}
              type="button"
              title={anchor.label}
              aria-label={t("chatRail.jump", { label: anchor.label })}
              data-active={railState.activeId === anchor.id}
              onClick={() => onJumpToMessage(anchor.id)}
              className={cx(
                "relative z-10 size-2.5 rounded-full bg-muted-foreground/45 transition hover:scale-125 hover:bg-primary data-[active=true]:bg-primary",
                railState.activeId === anchor.id && "scale-125"
              )}
            />
          ))}
        </div>
        <RailButton title={t("chatRail.latest")} disabled={!railState.canScroll || railState.atBottom} onClick={onJumpToEnd}>
          <ArrowDownIcon />
        </RailButton>
      </nav>
      <button
        type="button"
        data-testid="chat-position-rail-trigger"
        aria-label={t("chatRail.aria")}
        className="pointer-events-auto relative w-8 cursor-default border-0 bg-transparent p-0"
        onClick={() => updateOpen(!open)}
        onMouseEnter={() => updateOpen(true)}
        onMouseLeave={scheduleClose}
        onFocus={() => updateOpen(true)}
      >
        <span className={cx("absolute inset-y-2 right-2 w-px rounded-full bg-foreground/40 transition-opacity duration-200", open && "opacity-0")} />
      </button>
    </div>
  );
}

function RailButton({ title, disabled, onClick, children }: { title: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function sampleAnchors(anchors: ChatPositionAnchor[]) {
  if (anchors.length <= 9) return anchors;
  const result: ChatPositionAnchor[] = [];
  for (let slot = 0; slot < 9; slot += 1) {
    const anchor = anchors[Math.round((slot / 8) * (anchors.length - 1))];
    if (anchor && !result.some((item) => item.id === anchor.id)) result.push(anchor);
  }
  return result;
}

function closestAnchor(anchors: ChatPositionAnchor[], index: number) {
  return anchors.reduce<ChatPositionAnchor | undefined>((closest, anchor) => {
    if (!closest) return anchor;
    return Math.abs(anchor.index - index) < Math.abs(closest.index - index) ? anchor : closest;
  }, undefined);
}

function sameState(left: { canScroll: boolean; atTop: boolean; atBottom: boolean; activeId: string }, right: { canScroll: boolean; atTop: boolean; atBottom: boolean; activeId: string }) {
  return left.canScroll === right.canScroll && left.atTop === right.atTop && left.atBottom === right.atBottom && left.activeId === right.activeId;
}
