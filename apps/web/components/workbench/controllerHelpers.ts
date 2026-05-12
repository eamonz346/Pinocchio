import { emptyCapabilityFlags, type AiTask, type AiTaskEvent, type Canvas, type CanvasContent, type ChatMessage, type Conversation, type MemoryCandidate, type Plan, type ToolCallState } from "@pinocchio/shared";
import type { MessageDeliveryStatus, WorkbenchState } from "./types";

export function buildThinking(type: WorkbenchState["thinking"], reasoningEffort: WorkbenchState["reasoningEffort"]) {
  return type === "enabled" ? { type, reasoningEffort } : { type };
}

export function upsertAssistant(messages: ChatMessage[], id: string, delta: string, replace = false): ChatMessage[] {
  const found = messages.some((message) => message.id === id);
  if (!found) return [...messages, assistant(id, delta)];
  return messages.map((message) => (message.id === id ? { ...message, content: replace ? delta : `${message.content ?? ""}${delta}` } : message));
}

export function upsertReasoning(messages: ChatMessage[], id: string, delta: string): ChatMessage[] {
  const found = messages.some((message) => message.id === id);
  const next = messages.map((message) =>
    message.id === id ? { ...message, reasoning_content: `${message.reasoning_content ?? ""}${delta}` } : message
  );
  return found ? next : [...messages, { ...assistant(id, ""), reasoning_content: delta }];
}

export function preserveLocalReasoning(remote: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const localReasoning = new Map(local.flatMap((message) => message.reasoning_content?.trim() ? [[message.id, message.reasoning_content]] : []));
  const localReasoningByContent = new Map(
    local.flatMap((message) => {
      const reasoning = message.reasoning_content?.trim();
      const content = normalizeContent(message.content);
      return reasoning && content ? [[content, message.reasoning_content ?? reasoning]] : [];
    })
  );
  return remote.map((message) => {
    if (message.reasoning_content?.trim()) return message;
    const reasoning = localReasoning.get(message.id) ?? localReasoningByContent.get(normalizeContent(message.content));
    return reasoning ? { ...message, reasoning_content: reasoning } : message;
  });
}

export function formatAssistantError(message: string) {
  return `Error: ${message.trim() || "Unknown error"}`;
}

export function finalStreamingStatus(failed: boolean, status: string | undefined) {
  return failed ? status?.trim() || "Error" : "Ready";
}

export function shouldRefreshConversationAfterStream(failed: boolean) {
  return !failed;
}

export function shouldRefreshConversationForTaskCompletion(previous: AiTask[], next: AiTask[]) {
  const previousById = new Map(previous.map((task) => [task.id, task.status]));
  return next.some((task) => isTerminalTaskStatus(task.status) && previousById.get(task.id) !== task.status);
}

export function applyScopedTaskRefresh(current: WorkbenchState, conversationId: string | undefined, tasks: AiTask[], eventMap: Record<string, AiTaskEvent[]>): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, tasks, taskEvents: { ...current.taskEvents, ...eventMap } };
}

export function applyScopedCanvasUpsert(current: WorkbenchState, conversationId: string | undefined, canvas: Canvas, activate = true): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return {
    ...current,
    canvases: current.canvases.some((item) => item.id === canvas.id)
      ? current.canvases.map((item) => (item.id === canvas.id ? canvas : item))
      : [canvas, ...current.canvases],
    activeCanvasId: activate ? canvas.id : current.activeCanvasId
  };
}

export function applyCanvasResultUpsert(current: WorkbenchState, fallbackConversationId: string | undefined, canvas: Canvas, activate = true): WorkbenchState {
  return applyScopedCanvasUpsert(current, canvas.conversationId ?? fallbackConversationId, canvas, activate);
}

export function applyScopedCanvasListRefresh(current: WorkbenchState, conversationId: string | undefined, canvases: Canvas[]): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return {
    ...current,
    canvases,
    activeCanvasId: current.activeCanvasId && canvases.some((canvas) => canvas.id === current.activeCanvasId)
      ? current.activeCanvasId
      : canvases[0]?.id
  };
}

export function applyScopedCanvasTextAppend(current: WorkbenchState, conversationId: string | undefined, id: string, delta: string): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return {
    ...current,
    activeCanvasId: id,
    canvases: current.canvases.map((canvas) =>
      canvas.id === id ? { ...canvas, contentText: `${canvas.contentText}${delta}`, summary: "Generating..." } : canvas
    )
  };
}

export function applyScopedCanvasPatch(current: WorkbenchState, conversationId: string | undefined, id: string, contentJson: CanvasContent): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, canvases: current.canvases.map((canvas) => (canvas.id === id ? { ...canvas, contentJson } : canvas)) };
}

export function applyScopedStatusUpdate(current: WorkbenchState, conversationId: string | undefined, status: string): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, status };
}

export function applyScopedMessageUpdate(current: WorkbenchState, conversationId: string | undefined, update: (messages: ChatMessage[]) => ChatMessage[]): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, messages: update(current.messages) };
}

export function applyScopedMessageStatus(current: WorkbenchState, conversationId: string | undefined, id: string, status: MessageDeliveryStatus): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, messageStatusById: { ...current.messageStatusById, [id]: status } };
}

export function applyScopedToolUpdate(current: WorkbenchState, conversationId: string | undefined, next: ToolCallState): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return {
    ...current,
    toolCalls: current.toolCalls.some((item) => item.id === next.id)
      ? current.toolCalls.map((item) => (item.id === next.id ? next : item))
      : [...current.toolCalls, next]
  };
}

export function applyScopedMemoryCandidate(current: WorkbenchState, conversationId: string | undefined, candidate: MemoryCandidate): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, memoryCandidates: [...current.memoryCandidates, candidate] };
}

export function applyScopedBusy(current: WorkbenchState, conversationId: string | undefined, busy: boolean): WorkbenchState {
  if (!isCurrentConversation(current, conversationId)) return current;
  return { ...current, busy };
}

export function applyScopedPlanSave(current: WorkbenchState, conversationId: string | undefined, saved: Plan): WorkbenchState {
  if (!isCurrentConversation(current, conversationId) || (saved.conversationId ?? undefined) !== conversationId) return current;
  const plans = current.plans.some((item) => item.id === saved.id)
    ? current.plans.map((item) => (item.id === saved.id ? saved : item))
    : [saved, ...current.plans];
  return {
    ...current,
    plans,
    plan: current.plan?.id === saved.id || current.activePlanId === saved.id ? saved : current.plan,
    planDraft: current.activePlanId === saved.id ? saved.content : current.planDraft,
    planDraftById: { ...current.planDraftById, [saved.id]: saved.content }
  };
}

export function applyConversationRefresh(current: WorkbenchState, conversations: Conversation[]): WorkbenchState {
  const active = conversations.find((item) => item.id === current.conversationId);
  if (!active && current.conversationId) {
    return { ...resetWorkspaceData({ ...current, conversations }), conversationId: undefined, messages: [] };
  }
  return {
    ...current,
    conversations,
    conversationId: active?.id,
    messages: active ? active.messages : current.conversationId ? [] : current.messages
  };
}

export function resetWorkspaceData(current: WorkbenchState): WorkbenchState {
  return {
    ...current,
    toolCalls: [],
    capabilityFlags: emptyCapabilityFlags,
    canvases: [],
    activeCanvasId: undefined,
    plans: [],
    activePlanId: undefined,
    plan: undefined,
    planDraft: "",
    planDraftById: {},
    tasks: [],
    taskEvents: {},
    messageStatusById: {},
    streaming: false,
    busy: false,
    status: "Ready"
  };
}

export function summarizeCanvas(canvas: Canvas) {
  return `已在 Canvas 中生成：${canvas.title}（${canvas.kind}，v${canvas.version}）。`;
}

function assistant(id: string, content: string): ChatMessage {
  return { id, role: "assistant", content, reasoning_content: null, createdAt: new Date().toISOString() };
}

function normalizeContent(content: string | null | undefined) {
  return content?.replace(/\s+/g, " ").trim() ?? "";
}

function isCurrentConversation(current: WorkbenchState, conversationId: string | undefined) {
  return (conversationId ?? undefined) === (current.conversationId ?? undefined);
}

function isTerminalTaskStatus(status: AiTask["status"]) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
