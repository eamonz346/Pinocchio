import type { Canvas, ChatStreamEvent } from "@pinocchio/shared";
import { applyScopedMemoryCandidate, applyScopedStatusUpdate, formatAssistantError, summarizeCanvas } from "./controllerHelpers";
import type { WorkbenchState } from "./types";
import { usageStatus } from "./workbenchControllerState";

export interface WorkbenchStreamActions {
  updateAssistant(id: string, content: string, conversationId?: string): void;
  replaceAssistant(id: string, content: string, conversationId?: string): void;
  updateReasoning(id: string, content: string, conversationId?: string): void;
  updateTool(state: Extract<ChatStreamEvent, { type: "tool.status" }>["state"], conversationId?: string): void;
  upsertCanvas(canvas: Canvas, activate?: boolean, conversationId?: string): void;
  appendCanvasText(id: string, delta: string, conversationId?: string): void;
  patchCanvas(id: string, contentJson: WorkbenchState["canvases"][number]["contentJson"], conversationId?: string): void;
  setScopedState(conversationId: string | undefined, update: (current: WorkbenchState) => WorkbenchState): void;
  setState(update: (current: WorkbenchState) => WorkbenchState): void;
}

interface WorkbenchStreamContext {
  assistantId: string;
  conversationId: string;
  actions: WorkbenchStreamActions;
}

export function handleWorkbenchStreamEvent(event: ChatStreamEvent, { assistantId, conversationId, actions }: WorkbenchStreamContext): { failed: true; failureMessage: string } | undefined {
  if (event.type === "message.delta") actions.updateAssistant(assistantId, event.content, conversationId);
  if (event.type === "usage.updated") actions.setScopedState(conversationId, (current) => ({ ...current, lastUsageSummary: event.summary, status: usageStatus(event.summary) }));
  if (event.type === "message.done") {
    const finalUsage = event.usageSummary;
    if (finalUsage) actions.setScopedState(conversationId, (current) => ({ ...current, lastUsageSummary: finalUsage, status: usageStatus(finalUsage) }));
  }
  if (event.type === "capability.hints") actions.setScopedState(conversationId, (current) => ({ ...current, capabilityFlags: event.flags }));
  if (event.type === "reasoning.raw") actions.updateReasoning(assistantId, event.content, conversationId);
  if (event.type === "tool.status") actions.updateTool(event.state, conversationId);
  if (event.type === "artifact.created") actions.replaceAssistant(assistantId, `已在 Canvas 中生成：${event.artifact.title}`, conversationId);
  if (event.type === "canvas.started") actions.upsertCanvas(event.canvas, true, conversationId);
  if (event.type === "canvas.text_delta") actions.appendCanvasText(event.canvasId, event.content, conversationId);
  if (event.type === "canvas.patch") actions.patchCanvas(event.canvasId, event.contentJson, conversationId);
  if (event.type === "canvas.done") {
    actions.replaceAssistant(assistantId, summarizeCanvas(event.canvas), conversationId);
    actions.upsertCanvas(event.canvas, true, conversationId);
  }
  if (event.type === "canvas.error") actions.setState((current) => applyScopedStatusUpdate(current, conversationId, event.message));
  if (event.type === "memory.candidate") actions.setState((current) => applyScopedMemoryCandidate(current, conversationId, event.candidate));
  if (event.type === "reasoning.summary") actions.setScopedState(conversationId, (current) => ({ ...current, status: event.summary }));
  if (event.type !== "error") return undefined;
  actions.updateAssistant(assistantId, formatAssistantError(event.message), conversationId);
  actions.setState((current) => applyScopedStatusUpdate(current, conversationId, event.message));
  return { failed: true, failureMessage: event.message };
}
