"use client";

import {
  filterMemoryItems,
  groupMemoryByTier,
  memoryTiers,
  type AiTask,
  type AiTaskEvent,
  type MemoryCandidate,
  type MemoryItem,
  type MemoryTier,
  type Plan
} from "@pinocchio/shared";
import {
  CheckCircle2Icon,
  DatabaseIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCcwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { WorkspaceTab } from "./types";
import { PlanMethodologyControls } from "./PlanMethodologyControls";
import { cx, compactDate, taskTone } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function AiWorkspacePanel({
  tab,
  onTab,
  tasks,
  events,
  plan,
  planDraft,
  memoryItems,
  memoryCandidates,
  busy,
  onPlanDraft,
  onRunPlan,
  onRefresh,
  onClose,
  side = "right"
}: {
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  tasks: AiTask[];
  events: Record<string, AiTaskEvent[]>;
  plan: Plan | undefined;
  planDraft: string;
  memoryItems: MemoryItem[];
  memoryCandidates: MemoryCandidate[];
  busy: boolean;
  onPlanDraft: (value: string) => void;
  onRunPlan: () => void;
  onRefresh: () => void;
  onClose?: () => void;
  side?: "left" | "right";
}) {
  const { t } = useWorkbenchI18n();
  return (
    <aside className={cx("flex min-h-0 flex-col border-border bg-surface-panel/90", side === "left" ? "border-r" : "border-l")}>
      <header className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">AI Workspace</div>
            <h2 className="mt-1 text-base font-semibold">{t("aiWorkspace.title")}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onRefresh} className="icon-chip" aria-label={t("aiWorkspace.refresh")}>
              <RefreshCcwIcon className="size-4" />
            </button>
            {onClose ? (
              <button type="button" onClick={onClose} className="icon-chip" aria-label={t("aiWorkspace.hide")}>
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-[1rem] bg-muted p-1 text-xs">
          <TabButton active={tab === "tasks"} onClick={() => onTab("tasks")}>{t("aiWorkspace.tasks")}</TabButton>
          <TabButton active={tab === "plan"} onClick={() => onTab("plan")}>{t("aiWorkspace.plan")}</TabButton>
          <TabButton active={tab === "memory"} onClick={() => onTab("memory")}>{t("aiWorkspace.memory")}</TabButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === "tasks" ? <TaskList tasks={tasks} events={events} /> : null}
        {tab === "plan" ? (
          <PlanPanel plan={plan} planDraft={planDraft} busy={busy} onPlanDraft={onPlanDraft} onRunPlan={onRunPlan} />
        ) : null}
        {tab === "memory" ? <MemoryPanel items={memoryItems} candidates={memoryCandidates} /> : null}
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-[0.75rem] px-2 py-2 font-semibold text-muted-foreground transition data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm"
    >
      {children}
    </button>
  );
}

function TaskList({ tasks, events }: { tasks: AiTask[]; events: Record<string, AiTaskEvent[]> }) {
  const { t } = useWorkbenchI18n();
  if (!tasks.length) return <Empty text={t("aiWorkspace.tasksEmpty")} />;
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <section key={task.id} className="rounded-[1rem] border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{task.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{task.type} · {compactDate(task.updatedAt)}</div>
            </div>
            <span className={cx("rounded-full border px-2 py-1 text-[11px] font-semibold", taskTone(task.status))}>{task.status}</span>
          </div>
          <div className="mt-3 space-y-2">
            {(events[task.id] ?? []).slice(-4).map((event) => (
              <div key={event.id} className="flex gap-2 text-xs text-muted-foreground">
                {task.status === "running" ? <Loader2Icon className="mt-0.5 size-3 animate-spin" /> : <CheckCircle2Icon className="mt-0.5 size-3" />}
                <span>{event.message}</span>
              </div>
            ))}
          </div>
          {task.errorMessage ? <div className="mt-3 rounded-md bg-red-500/10 p-2 text-xs text-red-700">{task.errorMessage}</div> : null}
        </section>
      ))}
    </div>
  );
}

function PlanPanel({
  plan,
  planDraft,
  busy,
  onPlanDraft,
  onRunPlan
}: {
  plan: Plan | undefined;
  planDraft: string;
  busy: boolean;
  onPlanDraft: (value: string) => void;
  onRunPlan: () => void;
}) {
  const { t } = useWorkbenchI18n();
  if (!plan) return <Empty text={t("aiWorkspace.planEmpty")} />;
  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SparklesIcon className="size-4" />
        {plan.primaryGoal}
      </div>
      <div className="rounded-[0.9rem] border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        {plan.workflowType} · {plan.phase} · {plan.status}
      </div>
      <PlanMethodologyControls draft={planDraft} onDraft={onPlanDraft} />
      <textarea value={planDraft} onChange={(event) => onPlanDraft(event.target.value)} className="min-h-0 flex-1 resize-none rounded-[1rem] border border-border bg-background p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring/35" />
      <button type="button" disabled={busy || !planDraft.trim()} onClick={onRunPlan} className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.9rem] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
        {t("aiWorkspace.runPlan")}
      </button>
    </div>
  );
}

function MemoryPanel({ items, candidates }: { items: MemoryItem[]; candidates: MemoryCandidate[] }) {
  const { t } = useWorkbenchI18n();
  const [tier, setTier] = useState<MemoryTier | undefined>();
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => filterMemoryItems(items, { tier, query }), [items, tier, query]);
  const grouped = useMemo(() => groupMemoryByTier(filteredItems), [filteredItems]);
  return (
    <div className="space-y-4">
      <div className="rounded-[1rem] border border-border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><DatabaseIcon className="size-4" />{t("aiWorkspace.savedMemory")}</div>
        <div className="grid grid-cols-4 gap-2">
          {memoryTiers.map((memoryTier) => (
            <button
              key={memoryTier}
              type="button"
              onClick={() => setTier((current) => (current === memoryTier ? undefined : memoryTier))}
              data-active={tier === memoryTier}
              className="rounded-[0.75rem] border border-border bg-background px-2 py-2 text-left text-xs transition data-[active=true]:border-primary data-[active=true]:bg-primary/10"
            >
              <span className="block font-semibold">{t(`aiWorkspace.memoryTier.${memoryTier}`)}</span>
              <span className="text-muted-foreground">{grouped[memoryTier].length}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-[0.75rem] border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          <SearchIcon className="size-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("aiWorkspace.memorySearch")}
            placeholder={t("aiWorkspace.memorySearch")}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <div className="rounded-[1rem] border border-border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">{t("aiWorkspace.memorySummary")}</div>
        {filteredItems.length ? (
          <div className="space-y-3">
            {memoryTiers.map((memoryTier) =>
              grouped[memoryTier].length ? (
                <section key={memoryTier}>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{t(`aiWorkspace.memoryTier.${memoryTier}`)}</div>
                  {grouped[memoryTier].map((item) => (
                    <div key={item.id} className="border-t border-border py-2 text-xs leading-5">
                      <div>{item.content}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.source} · {compactDate(item.updatedAt)}</div>
                    </div>
                  ))}
                </section>
              ) : null
            )}
          </div>
        ) : <div className="text-xs text-muted-foreground">{t("aiWorkspace.noMemory")}</div>}
      </div>
      <div className="rounded-[1rem] border border-border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">{t("aiWorkspace.candidateMemory")}</div>
        {candidates.length ? candidates.map((item) => (
          <div key={item.id} className="border-t border-border py-2 text-xs leading-5">
            <div>{item.content}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{item.reason}</div>
          </div>
        )) : <div className="text-xs text-muted-foreground">{t("aiWorkspace.noCandidateMemory")}</div>}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[1rem] border border-dashed border-border bg-card/55 p-4 text-sm leading-6 text-muted-foreground">{text}</div>;
}
