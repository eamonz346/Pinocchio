import { emptyCapabilityFlags, type ChatMessage, type ChatRequest, type PricingCurrency } from "@pinocchio/shared";
import { buildThinking } from "./controllerHelpers";
import type { WorkbenchState } from "./types";

export function applyOutgoingUserMessage(
  current: WorkbenchState,
  conversationId: string,
  baseMessages: ChatMessage[],
  userMessage: ChatMessage
): WorkbenchState {
  if ((current.conversationId ?? undefined) !== conversationId) return current;
  return {
    ...current,
    messages: [...baseMessages, userMessage],
    messageStatusById: { ...current.messageStatusById, [userMessage.id]: "queued" },
    status: "Streaming...",
    streaming: true,
    toolCalls: [],
    capabilityFlags: emptyCapabilityFlags
  };
}

export function buildWorkbenchChatRequest(
  state: WorkbenchState,
  params: {
    requestId: string;
    conversationId: string;
    baseMessages: ChatMessage[];
    userMessage: ChatMessage;
    artifactMode: boolean;
    currency: PricingCurrency;
  }
): ChatRequest {
  return {
    id: params.requestId,
    conversationId: params.conversationId,
    mode: state.mode,
    model: state.model,
    thinking: buildThinking(state.thinking, state.reasoningEffort),
    messages: [...params.baseMessages, params.userMessage],
    files: state.files,
    artifactMode: params.artifactMode,
    currency: params.currency,
    stream: true
  };
}
