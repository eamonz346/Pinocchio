"use client";

import { inferRouteDecision, type AppMode, type CapabilityFlags, type ChatMessage, type ModelName, type ReasoningEffort, type ThinkingType, type TokenUsage, type UploadedFile, type UsageSummary } from "@pinocchio/shared";
import { BrainIcon, FileTextIcon, FileSearchIcon, Globe2Icon, PaperclipIcon, SendIcon, SparklesIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ToolMode } from "./types";
import { cx } from "./utils";
import { useTokenUsage } from "./useTokenUsage";
import { useWorkbenchI18n, type WorkbenchTranslator } from "./workbenchI18n";

type DockAvoidance = "always" | "overlap";
type ComposerSubmitTarget = "send" | "research" | "plan";

export function resolveComposerSubmission({
  text,
  toolMode,
  artifactMode
}: {
  text: string;
  toolMode: ToolMode;
  artifactMode: boolean;
}): { target: ComposerSubmitTarget; text: string; artifactMode: boolean } {
  if (toolMode === "research") return { target: "research", text, artifactMode };
  if (toolMode === "plan") return { target: "plan", text, artifactMode };
  if (toolMode === "web") {
    return {
      target: "send",
      text: `请先使用 web_search / web_fetch 获取当前信息，然后回答：${text}`,
      artifactMode
    };
  }
  const decision = inferRouteDecision(text, { manualToolMode: "chat", artifactMode });
  if (decision.action === "deep_research") return { target: "research", text, artifactMode };
  if (decision.action === "plan") return { target: "plan", text, artifactMode };
  return { target: "send", text, artifactMode };
}

export function Composer({
  model,
  mode,
  thinking,
  reasoningEffort,
  toolMode,
  capabilityFlags,
  files,
  messages,
  usageSummary,
  busy,
  dockOpen,
  dockAvoidance = "overlap",
  onControl,
  onSend,
  onDeepResearch,
  onCreatePlan,
  onFile
}: {
  model: ModelName;
  mode: AppMode;
  thinking: ThinkingType;
  reasoningEffort: ReasoningEffort;
  toolMode: ToolMode;
  capabilityFlags: CapabilityFlags;
  files: UploadedFile[];
  messages: ChatMessage[];
  usageSummary?: UsageSummary | undefined;
  busy: boolean;
  dockOpen?: boolean;
  dockAvoidance?: DockAvoidance;
  onControl: (key: "model" | "mode" | "reasoningEffort" | "thinking" | "toolMode", value: string) => void;
  onSend: (text: string, artifactMode: boolean) => void;
  onDeepResearch: (query: string) => void;
  onCreatePlan: (prompt: string) => void;
  onFile: (file: File) => void;
}) {
  const [text, setText] = useState("");
  const [artifactMode, setArtifactMode] = useState(false);
  const [dockOffset, setDockOffset] = useState(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { usage, failed } = useTokenUsage(text, messages);
  const { t } = useWorkbenchI18n();
  const disabled = busy || !text.trim();

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, Math.floor(window.innerHeight * 0.4))}px`;
  }, [text]);

  useLayoutEffect(() => {
    if (!dockOpen) {
      setDockOffset(0);
      return;
    }
    if (dockAvoidance === "always") {
      setDockOffset(80);
      return;
    }

    let frame: number | undefined;
    const updateOffset = () => {
      const shell = shellRef.current;
      const dock = document.querySelector("[data-dock-root] nav");
      if (!shell || !(dock instanceof HTMLElement)) {
        setDockOffset(0);
        return;
      }
      const shellBox = shell.getBoundingClientRect();
      const dockBox = dock.getBoundingClientRect();
      setDockOffset(Math.max(0, Math.ceil(shellBox.bottom - dockBox.top + 12)));
    };
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateOffset);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [dockAvoidance, dockOpen]);

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    const submission = resolveComposerSubmission({ text: value, toolMode, artifactMode });
    if (submission.target === "research") onDeepResearch(submission.text);
    else if (submission.target === "plan") onCreatePlan(submission.text);
    else onSend(submission.text, submission.artifactMode);
  }

  return (
    <div
      ref={shellRef}
      data-testid="composer-shell"
      data-dock-avoidance={dockAvoidance}
      className="composer-shell relative z-30 px-3 py-3 transition-transform duration-200 ease-out"
      style={{ transform: dockOffset ? `translateY(-${dockOffset}px)` : undefined }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <InfoBar
          usage={usage}
          usageSummary={usageSummary}
          failed={failed}
          files={files}
          model={model}
          mode={mode}
          thinking={thinking}
          reasoningEffort={reasoningEffort}
          toolMode={toolMode}
          capabilityFlags={capabilityFlags}
          artifactMode={artifactMode}
          busy={busy}
          onControl={onControl}
          onAttachment={() => fileRef.current?.click()}
          onArtifactMode={() => setArtifactMode((value) => !value)}
        />
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept=".txt,.md,.json,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = "";
          }}
        />
        <div className="flex items-end rounded-[1.2rem] border border-border bg-background p-2 shadow-[var(--shadow-panel)] transition-all focus-within:ring-2 focus-within:ring-ring/35">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder(toolMode, t)}
              className="min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />
            <button type="button" disabled={disabled} onClick={submit} className="send-button" aria-label={t("composer.send")}>
              <SendIcon className="size-4" />
            </button>
        </div>
      </div>
    </div>
  );
}

function InfoBar({
  usage,
  usageSummary,
  failed,
  files,
  model,
  mode,
  thinking,
  reasoningEffort,
  toolMode,
  capabilityFlags,
  artifactMode,
  busy,
  onControl,
  onAttachment,
  onArtifactMode
}: {
  usage: TokenUsage | null;
  usageSummary?: UsageSummary | undefined;
  failed: boolean;
  files: UploadedFile[];
  model: ModelName;
  mode: AppMode;
  thinking: ThinkingType;
  reasoningEffort: ReasoningEffort;
  toolMode: ToolMode;
  capabilityFlags: CapabilityFlags;
  artifactMode: boolean;
  busy: boolean;
  onControl: (key: "model" | "mode" | "reasoningEffort" | "thinking" | "toolMode", value: string) => void;
  onAttachment: () => void;
  onArtifactMode: () => void;
}) {
  const { t } = useWorkbenchI18n();
  return (
    <div className="composer-info-bar max-w-full rounded-[0.95rem] border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground shadow-[var(--shadow-control)]">
      <TokenMeter usage={usage} failed={failed} summary={usageSummary} />
      <CapabilityHints flags={capabilityFlags} />
      <div className="composer-controls">
        <IconTool title={t("composer.deepResearch")} active={toolMode === "research"} disabled={busy} onClick={() => onControl("toolMode", toolMode === "research" ? "chat" : "research")}><FileSearchIcon /></IconTool>
        <IconTool title={t("composer.canvas")} active={artifactMode} onClick={onArtifactMode}><FileTextIcon /></IconTool>
        <div
          data-testid="composer-primary-controls"
          style={{
            width: thinking === "enabled" ? "10.75rem" : "7.75rem",
            gridTemplateColumns: thinking === "enabled" ? "minmax(0,1fr) 3rem 1.75rem" : "minmax(0,1fr) 1.75rem"
          }}
          className="composer-primary-controls grid shrink-0 items-center gap-1"
        >
          <ModelToggle model={model} onControl={onControl} />
          {thinking === "enabled" ? <EffortToggle value={reasoningEffort} onControl={onControl} /> : null}
          <IconTool title={t("composer.thinking")} active={thinking === "enabled"} disabled={busy} onClick={() => onControl("thinking", thinking === "enabled" ? "disabled" : "enabled")}><BrainIcon /></IconTool>
        </div>
        <IconTool title={t("composer.plan")} active={toolMode === "plan"} disabled={busy} onClick={() => onControl("toolMode", toolMode === "plan" ? "chat" : "plan")}><SparklesIcon /></IconTool>
        <IconTool title={t("composer.web")} active={toolMode === "web"} disabled={busy} onClick={() => onControl("toolMode", toolMode === "web" ? "chat" : "web")}><Globe2Icon /></IconTool>
        <IconTool title={t("composer.upload")} active={files.length > 0} onClick={onAttachment}><PaperclipIcon /></IconTool>
      </div>
    </div>
  );
}

function CapabilityHints({ flags }: { flags: CapabilityFlags }) {
  const { t } = useWorkbenchI18n();
  const items = [
    flags.multiAgent ? t("capability.multiAgent") : "",
    flags.coding ? t("capability.coding") : "",
    flags.webSearch ? t("capability.web") : "",
    flags.deepResearch ? t("capability.deepResearch") : "",
    flags.canvas ? t("capability.canvas") : "",
    flags.thinking ? t("capability.thinking") : ""
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div aria-label={t("capability.aria")} className="hidden min-w-0 flex-wrap items-center gap-1 md:flex">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
          {item}
        </span>
      ))}
    </div>
  );
}

function ModelToggle({ model, onControl }: { model: ModelName; onControl: (key: "model", value: string) => void }) {
  const next = model === "deepseek-v4-flash" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  return (
    <TogglePill label={model === "deepseek-v4-flash" ? "V4-Flash" : "V4-Pro"} onClick={() => onControl("model", next)} className="w-full justify-center" />
  );
}

function EffortToggle({ value, onControl }: { value: ReasoningEffort; onControl: (key: "reasoningEffort", value: string) => void }) {
  const next = value === "high" ? "max" : "high";
  return (
    <TogglePill label={value === "high" ? "High" : "Max"} onClick={() => onControl("reasoningEffort", next)} className="w-12 justify-center" />
  );
}

function TogglePill({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx("shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45", className)}
    >
      {label}
    </button>
  );
}

function TokenMeter({ usage, failed, summary }: { usage: TokenUsage | null; failed: boolean; summary?: UsageSummary | undefined }) {
  const { language, t } = useWorkbenchI18n();
  if (failed) return null;
  if (!usage) return <span data-testid="token-meter" className="rounded-full bg-muted px-2 py-0.5 font-semibold">{t("token.calculating")}</span>;
  const labels = tokenMeterVisibleLabels(usage, summary, t);
  const fullLabel = labels.join(" · ");
  const cacheLabel = labels.find((label) => label.startsWith("cache "));
  return (
    <div data-testid="token-meter" className="composer-token-meter" title={fullLabel}>
      {labels.map((label, index) => (
        <TokenMeterItem key={label} label={label} showSeparator={index > 0} />
      ))}
      <span className="composer-token-compact" aria-label={fullLabel}>
        {t("token.input")} {compactNumber(usage.draftTokens)}
        <span aria-hidden="true"> · </span>
        {t("token.history")} {compactNumber(usage.messageTokens)}
        <span aria-hidden="true"> · </span>
        {t("token.context")} {compactNumber(usage.contextTokens)} / {compactNumber(usage.contextBudgetTokens)}
        {cacheLabel ? <><span aria-hidden="true"> · </span>{cacheLabel}</> : null}
      </span>
    </div>
  );
}

function TokenMeterItem({ label, showSeparator }: { label: string; showSeparator: boolean }) {
  return (
    <>
      {showSeparator ? <span>·</span> : null}
      <span className="composer-token-full-item">{label}</span>
    </>
  );
}

export function tokenMeterVisibleLabels(
  usage: TokenUsage,
  summary: UsageSummary | undefined,
  t: WorkbenchTranslator
) {
  const labels = [
    `${t("token.input")} ${compactNumber(usage.draftTokens)}`,
    `${t("token.history")} ${compactNumber(usage.messageTokens)}`,
    `${t("token.context")} ${compactNumber(usage.contextTokens)} / ${compactNumber(usage.contextBudgetTokens)}`
  ];
  if (summary) labels.push(`cache ${Math.round(summary.turn.cacheHitRatio * 100)}%`);
  return labels;
}

function IconTool({
  title,
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { title: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-pressed={active}
      className="flex size-7 items-center justify-center rounded-[0.65rem] text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 data-[pressed=true]:bg-primary data-[pressed=true]:text-primary-foreground [&>svg]:size-3.5"
      {...props}
    >
      {children}
    </button>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: Math.abs(value) >= 10000 ? "compact" : "standard" }).format(value);
}

function placeholder(mode: ToolMode, t: WorkbenchTranslator) {
  if (mode === "research") return t("composer.placeholder.research");
  if (mode === "plan") return t("composer.placeholder.plan");
  if (mode === "web") return t("composer.placeholder.web");
  return t("composer.placeholder.chat");
}
