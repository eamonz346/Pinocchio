"use client";

import { ArrowDownIcon, ArrowUpIcon, TargetIcon } from "lucide-react";
import { useMemo } from "react";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

const workflowLabels = ["新项目启动", "疑难攻坚", "迭代优化"];
const phaseLabels = ["探索积累", "攻坚推进", "全面展开"];

export interface MatrixRow {
  status: "main" | "paused";
  task: string;
  impact: string;
  difficulty: string;
  dependencies: string;
}

export function PlanMethodologyControls({ draft, onDraft }: { draft: string; onDraft: (value: string) => void }) {
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const { t } = useWorkbenchI18n();
  if (!parsed.exists) return null;

  function setWorkflow(label: string) {
    if (label === parsed.workflow) return;
    if (!window.confirm(t("plan.method.confirmWorkflow"))) return;
    onDraft(replaceLine(replaceLine(draft, "计划类型", label), "多角度步骤", defaultMultiAngle(label)));
  }

  function setPhase(label: string) {
    onDraft(replaceLine(draft, "当前阶段", label));
  }

  function setMultiAngle(enabled: boolean) {
    onDraft(replaceLine(draft, "多角度启用", enabled ? "是" : "否"));
  }

  function setPrimary(task: string) {
    if (task === parsed.primaryFocus) return;
    if (!window.confirm(t("plan.method.confirmPrimary", { task }))) return;
    onDraft(rewriteMatrix(replaceLine(draft, "主攻目标", task), parsed.rows.map((row) => ({ ...row, status: row.task === task ? "main" : "paused" }))));
  }

  function move(index: number, direction: -1 | 1) {
    const rows = [...parsed.rows];
    const target = index + direction;
    if (!rows[index] || !rows[target]) return;
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    onDraft(rewriteMatrix(draft, rows));
  }

  return (
    <div className="rounded-[1rem] border border-border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-muted-foreground">{t("plan.method.workflow")}</span>
        <div className="flex rounded-[0.8rem] bg-muted p-1">
          {workflowLabels.map((label) => (
            <button key={label} type="button" data-active={parsed.workflow === label} onClick={() => setWorkflow(label)} className="rounded-[0.65rem] px-2 py-1 font-semibold text-muted-foreground data-[active=true]:bg-background data-[active=true]:text-foreground">
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 font-semibold text-muted-foreground">
          {t("plan.method.phase")}
          <select value={parsed.phase} onChange={(event) => setPhase(event.target.value)} className="rounded-[0.7rem] border border-border bg-background px-2 py-1 text-foreground outline-none">
            {phaseLabels.map((label) => <option key={label}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 rounded-[0.9rem] border border-border bg-background p-2">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <TargetIcon className="size-3.5" />
          {t("plan.method.primary")}：{parsed.primaryFocus}
        </div>
        <div className="space-y-1">
          {parsed.rows.map((row, index) => (
            <div key={`${row.task}-${index}`} className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[0.7rem] px-2 py-1", row.status === "main" ? "bg-primary/10 text-foreground" : "text-muted-foreground")}>
              <button type="button" onClick={() => setPrimary(row.task)} className="min-w-0 truncate text-left">
                {row.status === "main" ? t("plan.method.main") : t("plan.method.paused")} · {row.task}
              </button>
              <div className="flex gap-1">
                <button type="button" className="icon-chip size-6" aria-label={t("plan.method.moveUp")} onClick={() => move(index, -1)}><ArrowUpIcon className="size-3" /></button>
                <button type="button" className="icon-chip size-6" aria-label={t("plan.method.moveDown")} onClick={() => move(index, 1)}><ArrowDownIcon className="size-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-[0.9rem] border border-border bg-background px-2 py-2">
        <span className="min-w-0 truncate font-semibold text-muted-foreground">{t("plan.method.multiAngle")}：{parsed.multiAngleSteps || t("plan.method.noSteps")}</span>
        <div className="flex rounded-[0.75rem] bg-muted p-1">
          <button type="button" data-active={parsed.multiAngleEnabled} onClick={() => setMultiAngle(true)} className="rounded-[0.55rem] px-2 py-1 font-semibold text-muted-foreground data-[active=true]:bg-background data-[active=true]:text-foreground">{t("plan.method.enable")}</button>
          <button type="button" data-active={!parsed.multiAngleEnabled} onClick={() => setMultiAngle(false)} className="rounded-[0.55rem] px-2 py-1 font-semibold text-muted-foreground data-[active=true]:bg-background data-[active=true]:text-foreground">{t("plan.method.skip")}</button>
        </div>
      </div>
    </div>
  );
}

export function parseDraft(draft: string) {
  const rows = matrixRows(draft);
  return {
    exists: /## 方法标记/.test(draft),
    workflow: lineValue(draft, "计划类型") || workflowLabels[1]!,
    phase: lineValue(draft, "当前阶段") || phaseLabels[0]!,
    primaryFocus: lineValue(draft, "主攻目标") || rows.find((row) => row.status === "main")?.task || rows[0]?.task || "明确目标和验收标准",
    multiAngleSteps: lineValue(draft, "多角度步骤"),
    multiAngleEnabled: lineValue(draft, "多角度启用") === "是",
    rows
  };
}

function lineValue(draft: string, key: string) {
  const value = draft.match(new RegExp(`^${key}：(.+)$`, "m"))?.[1]?.trim();
  return value ? unescapeTableCell(value) : value;
}

function replaceLine(draft: string, key: string, value: string) {
  const line = `${key}：${value}`;
  const pattern = new RegExp(`^${key}：.+$`, "m");
  return pattern.test(draft) ? draft.replace(pattern, line) : draft.replace("## 方法标记", `## 方法标记\n${line}`);
}

function matrixRows(draft: string): MatrixRow[] {
  return draft.split(/\r?\n/).flatMap((line) => {
    const cells = splitTableRow(line).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length !== 5 || cells[0] === "状态" || cells[0] === "---") return [];
    return [{ status: cells[0]!.includes("主攻") ? "main" : "paused", task: cells[1]!, impact: cells[2]!, difficulty: cells[3]!, dependencies: cells[4]! }];
  });
}

export function rewriteMatrix(draft: string, rows: MatrixRow[]) {
  const rendered = rows.map((row) => `| ${row.status === "main" ? "🎯 主攻" : "⏸ 暂缓"} | ${escapeTableCell(row.task)} | ${escapeTableCell(row.impact)} | ${escapeTableCell(row.difficulty)} | ${escapeTableCell(row.dependencies)} |`);
  const lines = draft.split(/\r?\n/);
  let rowIndex = 0;
  return lines.map((line) => (isMatrixRow(line) ? rendered[rowIndex++] ?? line : line)).join("\n");
}

function splitTableRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  let escaping = false;

  for (const char of line) {
    if (escaping) {
      cell += char === "|" ? "|" : `\\${char}`;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(escaping ? `${cell}\\` : cell);
  return cells;
}

function unescapeTableCell(value: string) {
  return value.replace(/\\\|/g, "|");
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|");
}

function isMatrixRow(line: string) {
  return /^\|\s*(🎯 主攻|⏸ 暂缓)\s*\|/.test(line);
}

function defaultMultiAngle(label: string) {
  if (label === "新项目启动") return "矛盾分析、方案设计";
  if (label === "迭代优化") return "反馈综合、方案验证";
  return "调查研究、方案验证";
}
