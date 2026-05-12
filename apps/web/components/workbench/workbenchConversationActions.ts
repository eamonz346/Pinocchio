import type { ChatMessage, Conversation } from "@pinocchio/shared";
import { preserveLocalReasoning, resetWorkspaceData } from "./controllerHelpers";
import type { WorkbenchState } from "./types";
import { upsertConversation } from "./workbenchControllerState";

export function withActiveConversationReasoning(conversations: Conversation[], activeId: string | undefined, localMessages: ChatMessage[]) {
  if (!activeId) return conversations;
  return conversations.map((conversation) =>
    conversation.id === activeId ? { ...conversation, messages: preserveLocalReasoning(conversation.messages, localMessages) } : conversation
  );
}

export function applyEnsuredConversation(current: WorkbenchState, conversation: Conversation): WorkbenchState {
  return {
    ...resetWorkspaceData(current),
    conversations: upsertConversation(current.conversations, conversation),
    conversationId: conversation.id,
    messages: conversation.messages
  };
}

export function applySelectedConversation(current: WorkbenchState, conversation: Conversation): WorkbenchState {
  return {
    ...resetWorkspaceData(current),
    conversationId: conversation.id,
    messages: preserveLocalReasoning(conversation.messages, current.messages)
  };
}
