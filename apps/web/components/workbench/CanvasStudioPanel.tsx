"use client";

import type { Canvas, CanvasProjectBundle } from "@pinocchio/shared";
import {
  DatabaseIcon,
  DownloadIcon,
  Edit3Icon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./utils";
import { useWorkbenchI18n, type WorkbenchTranslator } from "./workbenchI18n";

type StudioTab = {
  key: "editor" | "preview" | "assets" | "versions" | "review" | "export";
  icon: ReactNode;
  label: string;
  detail: string;
  tone: "active" | "neutral" | "warn";
};

type StudioAction = {
  label: string;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
};

export function CanvasStudioPanel({
  canvas,
  editing,
  studioBundle,
  studioLoading = false,
  studioError,
  onEdit,
  onReview,
  onExport
}: {
  canvas: Canvas | undefined;
  editing: boolean;
  studioBundle?: CanvasProjectBundle | undefined;
  studioLoading?: boolean;
  studioError?: string | undefined;
  onEdit?: (() => void) | undefined;
  onReview?: (() => void) | undefined;
  onExport?: (() => void) | undefined;
}) {
  const { t } = useWorkbenchI18n();
  const identity = getStudioIdentity(canvas, studioBundle, t);
  const tabs = getStudioTabs(canvas, editing, studioBundle, studioLoading, studioError, t);
  const actions = getNextActions(canvas, editing, t, { onEdit, onReview, onExport });

  return (
    <section aria-label={t("canvasStudio.aria")} className="border-b border-border bg-surface-panel/70 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
            <SparklesIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">{t("canvasStudio.title")}</div>
            <h2 className="truncate text-sm font-semibold">{identity.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge>{identity.projectLabel}</Badge>
              {identity.legacyLabel ? <Badge>{identity.legacyLabel}</Badge> : null}
              <span>{identity.kindLabel}</span>
            </div>
          </div>
        </div>
        <div className="grid min-w-[210px] flex-1 grid-cols-3 gap-1 text-[11px] sm:flex-none">
          <Metric label={t("canvasStudio.engine")} value={identity.engineLabel} />
          <Metric label={t("canvasStudio.status")} value={identity.statusLabel} />
          <Metric label={t("canvasStudio.version")} value={identity.versionLabel} />
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(88px,1fr))]">
        {tabs.map((tab) => (
          <section
            key={tab.key}
            className={cx(
              "min-w-0 rounded-md border px-2 py-2",
              tab.tone === "active" ? "border-primary/45 bg-primary/8" : tab.tone === "warn" ? "border-red-500/30 bg-red-500/8" : "border-border bg-card/70"
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="shrink-0 text-muted-foreground [&>svg]:size-3.5">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{tab.detail}</p>
          </section>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-muted-foreground">{t("canvasStudio.nextActions")}</span>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-muted-foreground transition hover:border-primary/45 hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>

      {!canvas ? <div className="mt-3 rounded-md border border-dashed border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">{t("canvasStudio.empty")}</div> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/70 px-2 py-1.5">
      <div className="truncate text-muted-foreground">{label}</div>
      <div className="truncate font-semibold">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="max-w-full truncate rounded-md border border-border bg-background px-1.5 py-0.5">{children}</span>;
}

function getStudioIdentity(canvas: Canvas | undefined, bundle: CanvasProjectBundle | undefined, t: WorkbenchTranslator) {
  if (!canvas) {
    return {
      title: t("canvasStudio.selectCanvas"),
      projectLabel: t("canvasStudio.noProject"),
      legacyLabel: undefined,
      kindLabel: t("canvasStudio.noKind"),
      engineLabel: t("canvasStudio.noEngine"),
      statusLabel: t("canvasStudio.idle"),
      versionLabel: t("canvasStudio.noVersion")
    };
  }

  const projectId = bundle?.project.id ?? metadataString(canvas.metadata, "canvasProjectId");
  const legacyArtifactId = metadataString(canvas.metadata, "legacyArtifactId");
  const engine = bundle?.project.engine ?? engineForKind(canvas.kind);
  const latestVersion = bundle?.versions[0]?.versionNumber;

  return {
    title: bundle?.project.title ?? canvas.title,
    projectLabel: projectId ? t("canvasStudio.projectId", { id: projectId }) : t("canvasStudio.noProject"),
    legacyLabel: legacyArtifactId ? t("canvasStudio.legacyId", { id: legacyArtifactId }) : undefined,
    kindLabel: t("canvasStudio.kindValue", { kind: bundle?.project.kind ?? canvas.kind }),
    engineLabel: t("canvasStudio.engineValue", { engine }),
    statusLabel: bundle?.project.status ?? canvas.status,
    versionLabel: latestVersion ? `v${latestVersion}` : `v${canvas.version}`
  };
}

function getStudioTabs(canvas: Canvas | undefined, editing: boolean, bundle: CanvasProjectBundle | undefined, loading: boolean, error: string | undefined, t: WorkbenchTranslator): StudioTab[] {
  const failed = canvas?.status === "failed";
  const streaming = canvas?.status === "streaming";
  const loadingDetail = loading ? "Loading Studio data" : undefined;
  const bundleError = error ? `Studio sync error: ${error}` : undefined;
  return [
    {
      key: "editor",
      icon: <Edit3Icon />,
      label: t("canvasStudio.tab.editor"),
      detail: !canvas ? t("canvasStudio.editor.empty") : loadingDetail ?? bundleError ?? (bundle ? `${bundle.files.length} files · ${bundle.nodes.length} nodes` : editing ? t("canvasStudio.editor.editing") : t("canvasStudio.editor.ready")),
      tone: editing ? "active" : "neutral"
    },
    {
      key: "preview",
      icon: streaming ? <Loader2Icon className="animate-spin" /> : <PlayIcon />,
      label: t("canvasStudio.tab.preview"),
      detail: !canvas ? t("canvasStudio.preview.empty") : streaming ? t("canvasStudio.preview.streaming") : bundle?.renderJobs[0] ? `render ${bundle.renderJobs[0].status}` : previewDetail(canvas, t),
      tone: streaming ? "active" : "neutral"
    },
    {
      key: "assets",
      icon: <DatabaseIcon />,
      label: t("canvasStudio.tab.assets"),
      detail: !canvas ? t("canvasStudio.assets.empty") : bundle ? `${bundle.assets.length} assets` : metadataString(canvas.metadata, "canvasProjectId") ? t("canvasStudio.assets.ready") : t("canvasStudio.assets.standalone"),
      tone: "neutral"
    },
    {
      key: "versions",
      icon: <RotateCcwIcon />,
      label: t("canvasStudio.tab.versions"),
      detail: !canvas ? t("canvasStudio.versions.empty") : bundle ? `${bundle.versions.length} versions · ${bundle.versions[0] ? `v${bundle.versions[0].versionNumber}` : "v0"}` : t("canvasStudio.versions.value", { version: canvas.version }),
      tone: "neutral"
    },
    {
      key: "review",
      icon: failed ? <XIcon /> : <SearchIcon />,
      label: t("canvasStudio.tab.review"),
      detail: !canvas ? t("canvasStudio.review.empty") : failed ? t("canvasStudio.review.failed") : bundle ? `${bundle.reviews.length} reports` : t("canvasStudio.review.ready"),
      tone: failed ? "warn" : "neutral"
    },
    {
      key: "export",
      icon: <DownloadIcon />,
      label: t("canvasStudio.tab.export"),
      detail: !canvas ? t("canvasStudio.export.empty") : bundle ? `${bundle.outputs.length} outputs · export ${bundle.exportJobs[0]?.status ?? "idle"}` : t("canvasStudio.export.ready"),
      tone: "neutral"
    }
  ];
}

function getNextActions(canvas: Canvas | undefined, editing: boolean, t: WorkbenchTranslator, handlers: { onEdit?: (() => void) | undefined; onReview?: (() => void) | undefined; onExport?: (() => void) | undefined }): StudioAction[] {
  if (!canvas) return [{ label: t("canvasStudio.action.selectCanvas"), disabled: true }];
  if (canvas.status === "failed") {
    return [
      { label: t("canvasStudio.action.reviewFailure"), onClick: handlers.onReview, disabled: !handlers.onReview },
      { label: t("canvasStudio.action.openEditor"), onClick: handlers.onEdit, disabled: !handlers.onEdit }
    ];
  }
  if (canvas.status === "streaming") return [{ label: t("canvasStudio.action.waitForRender"), disabled: true }, { label: t("canvasStudio.action.keepPreview"), disabled: true }];

  const actions: StudioAction[] = [
    { label: editing ? t("canvasStudio.action.saveDraft") : t("canvasStudio.action.openEditor"), onClick: handlers.onEdit, disabled: !handlers.onEdit },
    { label: t("canvasStudio.action.reviewQuality"), onClick: handlers.onReview, disabled: !handlers.onReview },
    { label: t("canvasStudio.action.exportPackage"), onClick: handlers.onExport, disabled: !handlers.onExport }
  ];
  if (!metadataString(canvas.metadata, "canvasProjectId") && metadataString(canvas.metadata, "legacyArtifactId")) {
    actions.unshift({ label: t("canvasStudio.action.linkLegacy"), disabled: true });
  }
  return actions;
}

function previewDetail(canvas: Canvas, t: WorkbenchTranslator) {
  if (canvas.kind === "ppt") return t("canvasStudio.preview.ppt");
  return t("canvasStudio.preview.renderer");
}

function engineForKind(kind: Canvas["kind"]) {
  if (kind === "ppt") return "deck";
  if (kind === "app" || kind === "code") return "prototype";
  if (kind === "diagram" || kind === "chart") return "document";
  return "document";
}

function metadataString(metadata: Canvas["metadata"], key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
