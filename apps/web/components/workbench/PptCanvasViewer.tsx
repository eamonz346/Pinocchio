"use client";

import type { CanvasBlock, CanvasContent } from "@pinocchio/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function PptCanvasViewer({
  content,
  fallbackText,
  deckUrl,
  fullscreen = false
}: {
  content: CanvasContent;
  fallbackText: string;
  deckUrl?: string | undefined;
  fullscreen?: boolean;
}) {
  const slides = useMemo(() => splitSlides(content, fallbackText), [content, fallbackText]);
  const deck = content.deck;
  const totalSlides = deck?.slides.length || slides.length;
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(0);
  const wheelLockRef = useRef(0);
  const active = deck ? undefined : slides[Math.min(index, slides.length - 1)] ?? slides[0];
  const activeFallbackText = active ? blocksToMarkdown(active.blocks) : "";
  const deckSrc = deck && deckUrl ? `${deckUrl}#/${index + 1}` : undefined;
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    setIndex(0);
    indexRef.current = 0;
    wheelLockRef.current = 0;
  }, [content, fallbackText]);

  useEffect(() => {
    if (!fullscreen) return;
    const element = rootRef.current;
    if (!element) return;
    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      const result = consumeFullscreenWheelEvent(event, {
        current: indexRef.current,
        totalSlides,
        lastWheelAt: wheelLockRef.current,
        now: Date.now()
      });
      wheelLockRef.current = result.lockAt;
      if (result.index === indexRef.current) return;
      indexRef.current = result.index;
      setIndex(result.index);
    };
    element.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleNativeWheel);
  }, [fullscreen, totalSlides]);

  return (
    <div
      ref={rootRef}
      data-ppt-fullscreen={fullscreen ? "true" : undefined}
      data-ppt-wheel-navigation={fullscreen ? "true" : undefined}
      className={cx("flex h-full min-h-0 flex-col", fullscreen ? "relative w-full flex-1 overflow-hidden overscroll-none bg-background" : "mx-auto max-w-6xl gap-3")}
    >
      {!fullscreen ? (
        <div className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-border bg-background px-3 py-2 text-sm">
          <button
            type="button"
            aria-label={t("ppt.previous")}
            data-testid="ppt-previous"
            disabled={index <= 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="icon-chip disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <div data-testid="ppt-page-indicator" className="font-semibold text-muted-foreground">
            {index + 1} / {totalSlides}
          </div>
          <button
            type="button"
            aria-label={t("ppt.next")}
            data-testid="ppt-next"
            disabled={index >= totalSlides - 1}
            onClick={() => setIndex((value) => Math.min(totalSlides - 1, value + 1))}
            className="icon-chip disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      ) : null}
      <section data-testid="ppt-slide" className={cx(
        "min-h-0 bg-background",
        fullscreen ? "flex-1 overflow-hidden overscroll-none" : "aspect-video overflow-y-auto rounded-[1rem] border border-border shadow-[var(--shadow-panel)]"
      )}>
        {deck ? (
          <iframe
            key={deckSrc ?? index}
            title={deck.title}
            data-testid="ppt-deck-frame"
            className={cx("h-full w-full border-0 bg-white", fullscreen ? "min-h-0 pointer-events-none" : "min-h-[420px]")}
            scrolling={fullscreen ? "no" : undefined}
            sandbox="allow-scripts allow-popups"
            src={deckSrc}
            srcDoc={deckSrc ? undefined : deckHtmlForIndex(deck.html, index)}
          />
        ) : active ? (
          fullscreen ? (
            <div data-testid="ppt-legacy-stage" className="flex h-full w-full items-center justify-center overflow-hidden overscroll-none bg-background p-6">
              <div className="max-h-full w-full max-w-[min(96vw,1100px)] overflow-hidden">
                <CanvasRenderer content={{ format: "block_ast_v1", blocks: active.blocks }} fallbackText={activeFallbackText} />
              </div>
            </div>
          ) : (
            <CanvasRenderer content={{ format: "block_ast_v1", blocks: active.blocks }} fallbackText={activeFallbackText} />
          )
        ) : null}
      </section>
    </div>
  );
}

export function slideIndexForWheel(current: number, totalSlides: number, deltaY: number) {
  if (totalSlides <= 1 || Math.abs(deltaY) < 1) return current;
  const direction = deltaY > 0 ? 1 : -1;
  return Math.min(totalSlides - 1, Math.max(0, current + direction));
}

export function consumeFullscreenWheelEvent(event: Pick<globalThis.WheelEvent, "deltaY" | "preventDefault" | "stopPropagation">, input: { current: number; totalSlides: number; lastWheelAt: number; now: number }) {
  event.preventDefault();
  event.stopPropagation();
  if (Math.abs(event.deltaY) < 1) return { index: input.current, lockAt: input.lastWheelAt };
  if (input.now - input.lastWheelAt < 360) return { index: input.current, lockAt: input.lastWheelAt };
  const index = slideIndexForWheel(input.current, input.totalSlides, event.deltaY);
  return { index, lockAt: index === input.current ? input.lastWheelAt : input.now };
}

function splitSlides(content: CanvasContent, fallbackText: string): { blocks: CanvasBlock[] }[] {
  const blocks = content.blocks.length ? content.blocks : [{ id: "fallback", type: "paragraph" as const, text: fallbackText }];
  const slides: { blocks: CanvasBlock[] }[] = [];
  let current: CanvasBlock[] = [];

  for (const block of blocks) {
    if (block.type === "divider") {
      if (current.length) slides.push({ blocks: current });
      current = [];
      continue;
    }
    if (block.type === "heading" && current.length) {
      slides.push({ blocks: current });
      current = [block];
      continue;
    }
    current.push(block);
  }

  if (current.length) slides.push({ blocks: current });
  return slides.length ? slides : [{ blocks }];
}

function blocksToMarkdown(blocks: CanvasBlock[]): string {
  return blocks.map(blockToMarkdown).filter(Boolean).join("\n\n");
}

function blockToMarkdown(block: CanvasBlock): string {
  if (block.type === "heading") return `${"#".repeat(Number(block.attrs?.level ?? 2))} ${block.text ?? ""}`;
  if (block.type === "list" || block.type === "taskList") return (block.content ?? []).map((item) => `- ${blockText(item)}`).join("\n");
  if (block.type === "divider") return "---";
  return blockText(block);
}

function blockText(block: CanvasBlock): string {
  return block.text ?? block.content?.map(blockText).join("\n") ?? "";
}

function deckHtmlForIndex(html: string, index: number): string {
  const script = `<script>(function(){location.hash="#/${index + 1}";document.querySelectorAll(".slide").forEach(function(slide,slideIndex){var active=slideIndex===${index};slide.classList.toggle("is-active",active);slide.classList.toggle("is-prev",slideIndex<${index});});})();</script>`;
  const shellHtml = normalizeDeckHtmlShell(html);
  return /<\/body>/i.test(shellHtml) ? shellHtml.replace(/<\/body>/i, `${script}</body>`) : `${shellHtml}${script}`;
}

const deckShellStyle = '<style data-pinocchio-deck-shell>html,body{margin:0;width:100%;height:100%;overflow:hidden}.deck{width:100%;height:100%;overflow:hidden}</style>';

function normalizeDeckHtmlShell(html: string) {
  if (html.includes("data-pinocchio-deck-shell")) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${deckShellStyle}</head>`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${deckShellStyle}</head>`);
  return `${deckShellStyle}${html}`;
}
