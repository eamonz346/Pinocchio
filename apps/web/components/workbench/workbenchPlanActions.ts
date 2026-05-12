import type { Conversation, Plan } from "@pinocchio/shared";
import { preserveLocalReasoning } from "./controllerHelpers";
import type { WorkbenchState } from "./types";
import { derivePlanState, upsertConversation, upsertPlan } from "./workbenchControllerState";

export function applyGeneratedPlanResult(
  current: WorkbenchState,
  conversationId: string,
  result: { plan: Plan; conversation?: Conversation }
): WorkbenchState {
  if ((current.conversationId ?? undefined) !== conversationId) return current;
  const plans = upsertPlan(current.plans, result.plan);
  return {
    ...current,
    conversations: result.conversation ? upsertConversation(current.conversations, result.conversation) : current.conversations,
    messages: result.conversation ? preserveLocalReasoning(result.conversation.messages, current.messages) : current.messages,
    busy: false,
    workspaceTab: "plan",
    ...derivePlanState(current, plans, result.plan.id, { [result.plan.id]: result.plan.content })
  };
}

export function resolvePlanDraftInput(current: WorkbenchState, planId = current.activePlanId) {
  if (!planId) return undefined;
  const plan = current.plans.find((item) => item.id === planId) ?? (current.plan?.id === planId ? current.plan : undefined);
  if (!plan) return undefined;
  const conversationId = plan.conversationId ?? current.conversationId;
  if (!conversationId) return undefined;
  return { plan, conversationId, content: current.planDraftById[planId] ?? plan.content };
}
