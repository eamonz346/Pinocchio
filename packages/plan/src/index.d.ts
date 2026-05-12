import type { Plan, PlanStep, WorkflowType } from "@pinocchio/shared";
export declare function createPlanDraft(input: {
    id: string;
    title: string;
    goal: string;
    workflowType?: WorkflowType;
    conversationId?: string | null;
    createdAt: string;
}): Plan;
export declare function createPlanSteps(planId: string, goal: string, createdAt: string): PlanStep[];
export declare function formatPlanMarkdown(title: string, goal: string, steps?: PlanStep[]): string;
