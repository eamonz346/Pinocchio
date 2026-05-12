"use client";

import { BrainIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "./clipboard";
import { MarkdownContent } from "./MarkdownContent";
import { useWorkbenchI18n } from "./workbenchI18n";

export function ReasoningPanel({ content, activeThinking = false }: { content: string | null | undefined; activeThinking?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(activeThinking);
  const autoOpenedRef = useRef(activeThinking);
  const { t } = useWorkbenchI18n();
  const text = content?.trim() ?? "";
  useEffect(() => {
    if (activeThinking) {
      autoOpenedRef.current = true;
      setOpen(true);
    } else if (autoOpenedRef.current) {
      autoOpenedRef.current = false;
      setOpen(false);
    }
  }, [activeThinking]);
  async function copyReasoning() {
    if (!text) return;
    if (!(await copyText(text))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <details
      data-testid="reasoning-panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mb-3 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 text-xs text-amber-950 open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-semibold">
        <span className="flex items-center gap-2">
          <BrainIcon className="size-3.5" />
          {t("reasoning.title")}
        </span>
        <button
          type="button"
          data-testid="copy-reasoning"
          aria-label={t("reasoning.copy")}
          disabled={!text}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyReasoning();
          }}
          className="flex size-7 items-center justify-center rounded-md hover:bg-background/70 disabled:pointer-events-none disabled:opacity-35"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </summary>
      <div data-testid="reasoning-content" className="mx-3 mb-3 rounded-[0.85rem] bg-background/80 p-3 text-[11px] leading-5 text-foreground">
        <MarkdownContent content={text || t("reasoning.empty")} compact />
      </div>
    </details>
  );
}
