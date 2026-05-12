"use client";

import type { CanvasAction } from "@pinocchio/shared";
import { CopyIcon, DownloadIcon, Edit3Icon, RotateCcwIcon, WandSparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useWorkbenchI18n } from "./workbenchI18n";

export type CanvasToolbarExportFormat = "json" | "markdown" | "html" | "docx" | "pptx" | "pdf" | "png" | "obsidian";

export function CanvasToolbar({
  editing,
  disabled,
  aiDisabled,
  onEdit,
  onCopy,
  restoreDisabled,
  onRestore,
  onAction,
  onExport
}: {
  editing: boolean;
  disabled: boolean;
  aiDisabled?: boolean;
  onEdit: () => void;
  onCopy: () => void;
  restoreDisabled?: boolean;
  onRestore: () => void;
  onAction: (action: CanvasAction) => void;
  onExport: (format: CanvasToolbarExportFormat) => void;
}) {
  const { t } = useWorkbenchI18n();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <SelectButton disabled={disabled || Boolean(aiDisabled)} label={t("canvas.toolbar.ai")} icon={<WandSparklesIcon />} onChange={(value) => onAction(value as CanvasAction)}>
        <option value="auto_layout">{t("canvas.action.autoLayout")}</option>
        <option value="rewrite">{t("canvas.action.rewrite")}</option>
        <option value="expand">{t("canvas.action.expand")}</option>
        <option value="shorten">{t("canvas.action.shorten")}</option>
        <option value="tone">{t("canvas.action.tone")}</option>
        <option value="translate">{t("canvas.action.translate")}</option>
        <option value="outline">{t("canvas.action.outline")}</option>
        <option value="extract_table">{t("canvas.action.extractTable")}</option>
        <option value="to_chart">{t("canvas.action.toChart")}</option>
        <option value="to_diagram">{t("canvas.action.toDiagram")}</option>
        <option value="fix_code">{t("canvas.action.fixCode")}</option>
        <option value="explain_code">{t("canvas.action.explainCode")}</option>
      </SelectButton>
      <SelectButton disabled={disabled} label={t("canvas.toolbar.export")} icon={<DownloadIcon />} onChange={(value) => onExport(value as never)}>
        <option value="markdown">Markdown</option>
        <option value="pptx">PPTX</option>
        <option value="docx">DOCX</option>
        <option value="html">HTML</option>
        <option value="json">JSON</option>
        <option value="pdf">PDF</option>
        <option value="png">PNG</option>
        <option value="obsidian">Obsidian</option>
      </SelectButton>
      <ToolButton disabled={disabled} title={t("canvas.copy")} onClick={onCopy}><CopyIcon /></ToolButton>
      <ToolButton disabled={disabled || Boolean(restoreDisabled)} title={t("canvas.restore")} onClick={onRestore}><RotateCcwIcon /></ToolButton>
      <ToolButton disabled={disabled} title={editing ? t("canvas.preview") : t("canvas.edit")} onClick={onEdit}><Edit3Icon /></ToolButton>
    </div>
  );
}

function ToolButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button data-card-control type="button" className="flex size-8 items-center justify-center rounded-[0.7rem] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-4" {...props}>
      {children}
    </button>
  );
}

function SelectButton({ children, icon, label, onChange, disabled }: { children: ReactNode; icon: ReactNode; label: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label data-card-control className="relative flex h-8 items-center gap-1 rounded-[0.7rem] px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
      <span className="[&>svg]:size-4">{icon}</span>
      <span className="card-action-label">{label}</span>
      <select disabled={disabled} className="absolute inset-0 cursor-pointer opacity-0 disabled:pointer-events-none" defaultValue="" onChange={(event) => { if (event.target.value) onChange(event.target.value); event.target.value = ""; }}>
        <option value="" />
        {children}
      </select>
    </label>
  );
}
