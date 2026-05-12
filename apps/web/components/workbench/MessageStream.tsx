"use client";

import type { ChatMessage, ToolCallState } from "@pinocchio/shared";
import { CheckCircle2Icon, CheckIcon, CopyIcon, Loader2Icon, UserIcon, WrenchIcon } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { AvatarPreferences } from "./avatarPreferences";
import { defaultAssistantAvatarSrc } from "./avatarPreferences";
import { copyText } from "./clipboard";
import { MarkdownContent } from "./MarkdownContent";
import { streamingStatusLabel } from "./messageStreamingStatus";
import { ReasoningPanel } from "./ReasoningPanel";
import type { MessageDeliveryStatus } from "./types";
import { cx } from "./utils";
import { WelcomeScreen } from "./WelcomeScreen";
import { useWorkbenchI18n } from "./workbenchI18n";

export function MessageStream({
  messages,
  toolCalls,
  streaming,
  scrollRootRef,
  dockOpen,
  messageStatusById,
  avatarPreferences
}: {
  messages: ChatMessage[];
  toolCalls: ToolCallState[];
  streaming: boolean;
  scrollRootRef?: RefObject<HTMLDivElement | null>;
  dockOpen?: boolean;
  messageStatusById?: Record<string, MessageDeliveryStatus>;
  avatarPreferences: AvatarPreferences;
}) {
  const fallbackScrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = scrollRootRef ?? fallbackScrollRef;
  const endRef = useRef<HTMLDivElement | null>(null);
  const { t } = useWorkbenchI18n();
  const lastMessage = messages.at(-1);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessage?.content, lastMessage?.reasoning_content, streaming]);
  const visible = messages.filter((message) => message.role !== "system" && message.role !== "tool");
  const empty = visible.length === 0 && toolCalls.length === 0 && !streaming;
  const currentAssistant = lastMessage?.role === "assistant" ? lastMessage : undefined;
  const assistantDraftVisible = Boolean(currentAssistant?.content?.trim());
  return (
    <div ref={rootRef} className={cx("min-h-0 flex-1 overflow-auto px-4 md:px-8", empty ? "py-0" : "py-5")}>
      <div className={cx("mx-auto flex w-full max-w-4xl flex-col gap-5 transition-[padding-bottom] duration-200", empty ? "min-h-full justify-center" : dockOpen ? "pb-24" : "pb-4")}>
        {visible.length === 0 ? <WelcomeScreen /> : null}
        {visible.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            status={messageStatusById?.[message.id]}
            streaming={streaming && index === visible.length - 1}
            avatarPreferences={avatarPreferences}
          />
        ))}
        {toolCalls.length ? <ToolStrip toolCalls={toolCalls} /> : null}
        {streaming ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {streamingStatusLabel(toolCalls, assistantDraftVisible, t)}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageItem({
  message,
  status,
  streaming,
  avatarPreferences
}: {
  message: ChatMessage;
  status: MessageDeliveryStatus | undefined;
  streaming: boolean;
  avatarPreferences: AvatarPreferences;
}) {
  const mine = message.role === "user";
  const deliveryStatus = status ?? (streaming ? "sent" : "delivered");
  const time = formatMessageTime(message.createdAt);
  const mark = mine ? deliveryMark(deliveryStatus) : undefined;
  const content = message.content ?? "";
  const reasoningContent = message.reasoning_content?.trim();
  const activeThinking = streaming && Boolean(reasoningContent) && !content.trim();
  return (
    <article id={`chat-message-${message.id}`} className={cx("flex gap-3 scroll-mt-10", mine && "justify-end")}>
      {!mine ? <Avatar role="assistant" preferences={avatarPreferences} /> : null}
      <div className={cx("group/message max-w-[86%] rounded-[1.15rem] px-4 py-3 text-sm shadow-sm", mine ? "bg-primary text-primary-foreground" : "border border-border bg-card")}>
        {!mine && reasoningContent ? <ReasoningPanel content={reasoningContent} activeThinking={activeThinking} /> : null}
        {!mine && content.trim() ? <MessageActions content={content} /> : null}
        <MessageBody content={content} mine={mine} time={time} mark={mark} />
      </div>
      {mine ? <Avatar role="user" preferences={avatarPreferences} /> : null}
    </article>
  );
}

function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useWorkbenchI18n();

  async function copyBody() {
    if (!(await copyText(content))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="mb-2 flex justify-end">
      <button
        type="button"
        data-testid="copy-message-body"
        aria-label={t("message.copyBody")}
        title={t("message.copyBody")}
        onClick={() => void copyBody()}
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 group-hover/message:opacity-100"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
    </div>
  );
}

function MessageBody({ content, mine, time, mark }: { content: string; mine: boolean; time: string; mark: string | undefined }) {
  if (mine || isPlainAssistantText(content)) {
    return (
      <div className="flow-root whitespace-pre-wrap break-words leading-6">
        {content}
        <MessageStamp mine={mine} time={time} mark={mark} />
      </div>
    );
  }
  return (
    <>
      <div className="prose-lite">
        <MarkdownContent content={content} />
      </div>
      <div className="flow-root">
        <MessageStamp mine={mine} time={time} mark={undefined} />
      </div>
    </>
  );
}

function MessageStamp({ mine, time, mark }: { mine: boolean; time: string; mark: string | undefined }) {
  return (
    <span data-testid={mine ? "user-message-stamp" : "assistant-message-stamp"} className={cx("float-right ml-4 mt-1 inline-flex items-baseline gap-1.5 text-[10px] leading-4 opacity-60", mine ? "text-primary-foreground" : "text-muted-foreground")}>
      <span>{time}</span>
      {mark ? <span>{mark}</span> : null}
    </span>
  );
}

function Avatar({ role, preferences }: { role: "user" | "assistant"; preferences: AvatarPreferences }) {
  const user = role === "user";
  const source = user ? preferences.user : preferences.assistant;
  const { t } = useWorkbenchI18n();
  if (!user && source.kind === "default") {
    return (
      <img
        src={defaultAssistantAvatarSrc}
        alt={t("message.assistantAvatarAlt")}
        className="mt-1 size-9 shrink-0 rounded-full bg-white object-cover ring-1 ring-border"
      />
    );
  }
  if (source.kind !== "default") {
    return (
      <img
        src={source.value}
        alt={user ? t("message.userAvatarAlt") : t("message.assistantAvatarAlt")}
        className="mt-1 size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
      <UserIcon className="size-4" />
    </div>
  );
}

function deliveryMark(status: MessageDeliveryStatus) {
  if (status === "failed") return "!";
  if (status === "queued" || status === "sent") return "\u2713";
  return "\u2713\u2713";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function isPlainAssistantText(content: string) {
  return !/(^|\n)\s*([-*+] |\d+\. |#{1,6} |>\s)|[`*_~|]/.test(content);
}

function ToolStrip({ toolCalls }: { toolCalls: ToolCallState[] }) {
  const { t } = useWorkbenchI18n();
  return (
    <div className="rounded-[1rem] border border-border bg-card/70 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <WrenchIcon className="size-3.5" />
        {t("message.toolCalls")}
      </div>
      <div className="flex flex-wrap gap-2">
        {toolCalls.map((tool) => (
          <span key={tool.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
            {tool.status === "running" ? <Loader2Icon className="size-3 animate-spin" /> : <CheckCircle2Icon className="size-3" />}
            {tool.toolName}
          </span>
        ))}
      </div>
    </div>
  );
}
