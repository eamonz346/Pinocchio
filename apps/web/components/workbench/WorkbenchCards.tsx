"use client";

import type { AiTask, AiTaskEvent, ChatMessage, Plan, ToolCallState } from "@pinocchio/shared";
import { AlertTriangleIcon, CheckCircle2Icon, Edit3Icon, EyeIcon, ListChecksIcon, Loader2Icon, Maximize2Icon, Minimize2Icon, PlayIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useState } from "react";
import type { AvatarPreferences } from "./avatarPreferences";
import { HeaderButton, type CardWindowControls } from "./CardStage";
import { ChatPositionRail } from "./ChatPositionRail";
import { MarkdownContent } from "./MarkdownContent";
import { MessageStream } from "./MessageStream";
import { PlanMethodologyControls } from "./PlanMethodologyControls";
import type { MessageDeliveryStatus } from "./types";
import { compactDate, cx, taskTone } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function ChatCard({
  messages,
  toolCalls,
  streaming,
  dockOpen,
  messageStatusById,
  avatarPreferences,
  scrollRootRef,
  anchors,
  composer,
  onJumpToStart,
  onJumpToEnd,
  onJumpToMessage,
  surface = "card"
}: {
  messages: ChatMessage[];
  toolCalls: ToolCallState[];
  streaming: boolean;
  dockOpen: boolean;
  messageStatusById: Record<string, MessageDeliveryStatus>;
  avatarPreferences: AvatarPreferences;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  anchors: { id: string; label: string; index: number }[];
  composer: ReactNode;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onJumpToMessage: (id: string) => void;
  surface?: "card" | "fullscreen";
}) {
  return (
    <section className={cx("relative flex min-h-0 flex-col", surface === "fullscreen" ? "flex-1 bg-background" : "h-full bg-background")}>
      <ChatPositionRail visible={messages.length > 0} anchors={anchors} scrollRootRef={scrollRootRef} onJumpToStart={onJumpToStart} onJumpToEnd={onJumpToEnd} onJumpToMessage={onJumpToMessage} />
      <MessageStream messages={messages} toolCalls={toolCalls} streaming={streaming} scrollRootRef={scrollRootRef} dockOpen={dockOpen} messageStatusById={messageStatusById} avatarPreferences={avatarPreferences} />
      {composer}
    </section>
  );
}

export function PlanCard({
  plan,
  planDraft,
  busy,
  tasks,
  taskEvents,
  controls,
  onPlanDraft,
  onSavePlan,
  onRunPlan
}: {
  plan: Plan | undefined;
  planDraft: string;
  busy: boolean;
  tasks: AiTask[];
  taskEvents: Record<string, AiTaskEvent[]>;
  controls: CardWindowControls;
  onPlanDraft: (value: string) => void;
  onSavePlan: () => void;
  onRunPlan: () => void;
}) {
  const { t } = useWorkbenchI18n();
  const [editing, setEditing] = useState(false);
  const title = plan?.primaryGoal ?? t("planPanel.title");
  const status = plan ? `${plan.workflowType} / ${plan.phase} / ${plan.status}` : "";
  const executionState = derivePlanExecutionState(plan, tasks);
  const finishEditing = () => {
    onSavePlan();
    setEditing(false);
  };
  return (
    <section className="card-workspace flex h-full min-h-0 flex-col bg-card/85">
      <PlanHeader title={title} status={status} busy={busy} executionState={executionState} editing={editing} controls={controls} onEdit={() => editing ? finishEditing() : setEditing(true)} onRun={onRunPlan} />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!plan ? (
          <div className="flex h-full min-h-0 items-center justify-center">
            <div className="max-w-sm rounded-[1rem] border border-dashed border-border bg-background/70 p-4 text-sm leading-6 text-muted-foreground">{busy ? t("message.streaming") : t("planPanel.empty")}</div>
          </div>
        ) : editing ? (
          <div className="flex min-h-[520px] flex-col gap-3">
            <PlanMethodologyControls draft={planDraft} onDraft={onPlanDraft} />
            <textarea value={planDraft} onChange={(event) => onPlanDraft(event.target.value)} onBlur={onSavePlan} className="min-h-[300px] flex-1 resize-none rounded-[1rem] border border-border bg-background p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring/35" />
          </div>
        ) : (
          <div className="mx-auto max-w-[860px] bg-background px-4 py-3">
            <MarkdownContent content={planDraft || plan.content} />
            <TaskSummary tasks={tasks} events={taskEvents} />
          </div>
        )}
      </div>
    </section>
  );
}

function PlanHeader({
  title,
  status,
  busy,
  executionState,
  editing,
  controls,
  onEdit,
  onRun
}: {
  title: string;
  status: string;
  busy: boolean;
  executionState: PlanExecutionState;
  editing: boolean;
  controls: CardWindowControls;
  onEdit: () => void;
  onRun: () => void;
}) {
  const { t } = useWorkbenchI18n();
  const running = executionState === "queued" || executionState === "running";
  const failed = executionState === "failed" || executionState === "cancelled";
  const done = executionState === "done";
  const label = executionState === "queued"
    ? t("planPanel.queued")
    : executionState === "running"
      ? t("planPanel.running")
      : done
        ? t("planPanel.rerun")
        : failed
          ? t("planPanel.retry")
          : t("planPanel.run");
  return (
    <header className="flex h-10 shrink-0 cursor-grab touch-none items-center justify-between gap-2 border-b border-border bg-background/85 px-2 active:cursor-grabbing" {...controls.moveProps}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="card-title-icon flex size-7 shrink-0 items-center justify-center rounded-[0.7rem] bg-muted text-muted-foreground"><ListChecksIcon className="size-4" /></span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {status ? <div className="card-header-subtitle truncate text-[10px] text-muted-foreground">{status}</div> : null}
        </div>
      </div>
      <div className="card-header-actions flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto">
        <button
          data-card-control
          type="button"
          disabled={busy || running}
          aria-busy={running}
          data-execution-state={executionState}
          onClick={onRun}
          className={cx(
            "card-primary-action inline-flex h-8 items-center gap-1.5 rounded-[0.7rem] px-2.5 text-xs font-semibold transition disabled:pointer-events-none disabled:opacity-80",
            running ? "bg-blue-600 text-white shadow-[0_0_0_1px_rgba(37,99,235,0.22)]" : done ? "bg-emerald-600 text-white" : failed ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"
          )}
        >
          {running ? <Loader2Icon className="size-3.5 animate-spin" /> : done ? <CheckCircle2Icon className="size-3.5" /> : failed ? <AlertTriangleIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          <span className="card-action-label">{label}</span>
        </button>
        <HeaderButton title={editing ? t("canvas.preview") : t("canvas.edit")} onClick={onEdit}>{editing ? <EyeIcon /> : <Edit3Icon />}</HeaderButton>
        <HeaderButton title={controls.fullscreen ? t("plan.exitFullscreen") : t("plan.fullscreen")} onClick={controls.onToggleFullscreen}>{controls.fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}</HeaderButton>
        <HeaderButton title={t("card.resetLayout")} onClick={controls.onReset}><RotateCcwIcon /></HeaderButton>
        <HeaderButton title={t("plan.hide")} onClick={controls.onClose}><XIcon /></HeaderButton>
      </div>
    </header>
  );
}

type PlanExecutionState = "idle" | "queued" | "running" | "done" | "failed" | "cancelled";

function derivePlanExecutionState(plan: Plan | undefined, tasks: AiTask[]): PlanExecutionState {
  if (!plan) return "idle";
  const task = latestPlanExecutionTask(plan.id, tasks);
  if (task?.status === "queued" || task?.status === "running") return task.status;
  if (plan.status === "running") return "running";
  if (task?.status === "failed" || task?.status === "cancelled") return task.status;
  if (plan.status === "done" || task?.status === "succeeded") return "done";
  if (plan.status === "cancelled") return "cancelled";
  return "idle";
}

function latestPlanExecutionTask(planId: string, tasks: AiTask[]) {
  return tasks
    .filter((task) => task.type === "plan.execute" && task.input.planId === planId)
    .sort((left, right) => taskSortStamp(right).localeCompare(taskSortStamp(left)))[0];
}

function taskSortStamp(task: AiTask) {
  return task.createdAt || task.updatedAt || "";
}

function TaskSummary({ tasks, events }: { tasks: AiTask[]; events: Record<string, AiTaskEvent[]> }) {
  const { t } = useWorkbenchI18n();
  if (!tasks.length) return null;
  return (
    <div className="mt-5 rounded-[1rem] border border-border bg-background/75 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="size-3 rounded-full bg-primary/55" />
        {t("aiWorkspace.tasks")}
      </div>
      <div className="space-y-2">
        {tasks.slice(0, 3).map((task) => {
          const latest = events[task.id]?.at(-1);
          return (
            <div key={task.id} className="rounded-[0.8rem] border border-border bg-card px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{task.title}</div>
                  <div className="mt-1 text-muted-foreground">{compactDate(task.updatedAt)}</div>
                </div>
                <span className={cx("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", taskTone(task.status))}>{task.status}</span>
              </div>
              {latest ? <div className="mt-2 line-clamp-2 text-muted-foreground">{latest.message}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
