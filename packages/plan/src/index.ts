import type { Plan, PlanStep, WorkflowType } from "@pinocchio/shared";

export function createPlanDraft(input: {
  id: string;
  title: string;
  goal: string;
  workflowType?: WorkflowType;
  conversationId?: string | null;
  createdAt: string;
}): Plan {
  return {
    id: input.id,
    conversationId: input.conversationId ?? null,
    workflowType: input.workflowType ?? "new_project",
    phase: "explore",
    primaryGoal: input.goal.trim(),
    content: formatPlanMarkdown(input.title, input.goal),
    status: "draft",
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export function createPlanSteps(planId: string, goal: string, createdAt: string): PlanStep[] {
  return [
    makeStep(planId, 1, "明确目标和边界", "pending", createdAt),
    makeStep(planId, 2, `围绕 ${goal.slice(0, 24) || "主目标"} 拆解执行路径`, "pending", createdAt),
    makeStep(planId, 3, "完成后复盘并归档", "pending", createdAt)
  ];
}

export function formatPlanMarkdown(title: string, goal: string, steps: PlanStep[] = []): string {
  const outline = steps.length
    ? steps.map((step) => `${step.stepOrder}. ${step.title}`).join("\n")
    : "1. 明确目标和边界\n2. 拆解执行路径\n3. 完成后复盘并归档";
  return [`# ${title}`, "", `**主目标**：${goal}`, "", "## 步骤", outline].join("\n");
}

function makeStep(planId: string, stepOrder: number, title: string, status: PlanStep["status"], createdAt: string): PlanStep {
  return {
    id: `${planId}-step-${stepOrder}`,
    planId,
    stepOrder,
    title,
    status,
    result: null,
    createdAt,
    updatedAt: createdAt
  };
}
