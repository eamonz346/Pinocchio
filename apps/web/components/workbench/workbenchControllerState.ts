import type { Conversation, Plan, PricingCurrency } from "@pinocchio/shared";
import type { WorkbenchState } from "./types";

export function derivePlanState(current: WorkbenchState, plans: Plan[], preferredPlanId?: string, draftOverrides: Record<string, string> = {}) {
  const existingDrafts = { ...current.planDraftById, ...draftOverrides };
  const planDraftById = Object.fromEntries(plans.map((plan) => [plan.id, existingDrafts[plan.id] ?? plan.content]));
  const activePlanId = chooseActivePlanId(plans, preferredPlanId ?? current.activePlanId);
  const plan = plans.find((item) => item.id === activePlanId);
  return {
    plans,
    activePlanId,
    plan,
    planDraft: plan ? planDraftById[plan.id] ?? plan.content : "",
    planDraftById
  };
}

export function chooseActivePlanId(plans: Plan[], preferredPlanId: string | undefined) {
  return preferredPlanId && plans.some((plan) => plan.id === preferredPlanId) ? preferredPlanId : plans[0]?.id;
}

export function upsertPlan(plans: Plan[], plan: Plan) {
  return plans.some((item) => item.id === plan.id) ? plans.map((item) => (item.id === plan.id ? plan : item)) : [plan, ...plans];
}

export function upsertConversation(conversations: Conversation[], conversation: Conversation) {
  return [conversation, ...conversations.filter((item) => item.id !== conversation.id)];
}

export function usageStatus(summary: NonNullable<WorkbenchState["lastUsageSummary"]>) {
  const budget = summary.budget;
  if (budget.state === "blocked") return budget.message ?? "Budget reached";
  if (budget.state === "warning") return budget.message ?? "Budget warning";
  return `Bill ${money(summary.turn.cost, summary.turn.currency)} · cache ${(summary.turn.cacheHitRatio * 100).toFixed(0)}%`;
}

function money(value: number, currency: PricingCurrency) {
  return currency === "CNY" ? `¥${value.toFixed(value < 0.01 ? 6 : 4)}` : `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}
