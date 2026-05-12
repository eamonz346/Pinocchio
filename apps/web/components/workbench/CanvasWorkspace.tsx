"use client";

import type { Canvas, CanvasAction, CanvasProjectBundle } from "@pinocchio/shared";
import { FileTextIcon, Maximize2Icon, Minimize2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasProjectDeckUrl, createCanvasReviewReport, createCanvasStudioJob, editCanvas, exportCanvasToObsidian, getCanvasProjectBundle, restoreCanvas, updateCanvas } from "../../lib/canvasClient";
import { CanvasEditor } from "./CanvasEditor";
import { CanvasHistory } from "./CanvasHistory";
import { CanvasRenderer } from "./CanvasRenderer";
import { CanvasStudioPanel } from "./CanvasStudioPanel";
import { CanvasToolbar, type CanvasToolbarExportFormat } from "./CanvasToolbar";
import { HeaderButton, type CardWindowControls } from "./CardStage";
import { PptCanvasViewer } from "./PptCanvasViewer";
import { downloadCanvas } from "./canvasExport";
import { useWorkbenchI18n } from "./workbenchI18n";

export type CanvasFullscreenScrollLockTarget = {
  documentElement: { style: Pick<CSSStyleDeclaration, "overflow" | "overscrollBehavior"> };
  body: { style: Pick<CSSStyleDeclaration, "overflow" | "overscrollBehavior"> };
};

type CanvasFullscreenScrollLockState = {
  count: number;
  previous: {
    htmlOverflow: string;
    bodyOverflow: string;
    htmlOverscrollBehavior: string;
    bodyOverscrollBehavior: string;
  };
};

const canvasFullscreenScrollLocks = new WeakMap<object, CanvasFullscreenScrollLockState>();

export function applyCanvasFullscreenScrollLock(target: CanvasFullscreenScrollLockTarget) {
  const existing = canvasFullscreenScrollLocks.get(target);
  if (existing) {
    existing.count += 1;
    lockCanvasFullscreenScroll(target);
    return releaseCanvasFullscreenScrollLock(target);
  }
  const previous = {
    htmlOverflow: target.documentElement.style.overflow,
    bodyOverflow: target.body.style.overflow,
    htmlOverscrollBehavior: target.documentElement.style.overscrollBehavior,
    bodyOverscrollBehavior: target.body.style.overscrollBehavior
  };
  canvasFullscreenScrollLocks.set(target, { count: 1, previous });
  lockCanvasFullscreenScroll(target);
  return releaseCanvasFullscreenScrollLock(target);
}

function lockCanvasFullscreenScroll(target: CanvasFullscreenScrollLockTarget) {
  target.documentElement.style.overflow = "hidden";
  target.body.style.overflow = "hidden";
  target.documentElement.style.overscrollBehavior = "none";
  target.body.style.overscrollBehavior = "none";
}

function releaseCanvasFullscreenScrollLock(target: CanvasFullscreenScrollLockTarget) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = canvasFullscreenScrollLocks.get(target);
    if (!current) return;
    current.count -= 1;
    if (current.count > 0) return;
    canvasFullscreenScrollLocks.delete(target);
    target.documentElement.style.overflow = current.previous.htmlOverflow;
    target.body.style.overflow = current.previous.bodyOverflow;
    target.documentElement.style.overscrollBehavior = current.previous.htmlOverscrollBehavior;
    target.body.style.overscrollBehavior = current.previous.bodyOverscrollBehavior;
  };
}

export function CanvasWorkspace({
  canvases,
  canvasId,
  controls,
  onOpenCanvas,
  onCanvasUpdated
}: {
  canvases: Canvas[];
  canvasId: string;
  controls: CardWindowControls;
  onOpenCanvas: (id: string) => void;
  onCanvasUpdated: (canvas: Canvas) => void;
}) {
  const active = useMemo(() => canvases.find((canvas) => canvas.id === canvasId), [canvasId, canvases]);
  const activeIsLegacyArtifact = Boolean(active?.metadata?.legacyArtifactId);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | undefined>();
  const [studioBundle, setStudioBundle] = useState<CanvasProjectBundle | undefined>();
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | undefined>();
  const [titleDraft, setTitleDraft] = useState("");
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const activeStudioScopeRef = useRef<{ projectId: string | undefined; conversationId: string | undefined }>({ projectId: undefined, conversationId: undefined });
  const { t } = useWorkbenchI18n();
  const activeProjectId = metadataString(active?.metadata, "canvasProjectId");
  const hasDeckEntry = Boolean(active?.kind === "ppt" && activeProjectId && studioBundle?.project.id === activeProjectId && studioBundle.files.some((file) => file.path === "index.html" && file.textContent !== undefined));
  const deckUrl = hasDeckEntry && activeProjectId ? canvasProjectDeckUrl(activeProjectId, active?.conversationId ?? undefined) : undefined;

  useEffect(() => {
    setTitleDraft(active?.title ?? "");
  }, [active?.id, active?.title]);

  useEffect(() => {
    activeStudioScopeRef.current = { projectId: activeProjectId, conversationId: active?.conversationId ?? undefined };
  }, [activeProjectId, active?.conversationId]);

  useEffect(() => {
    if (!controls.fullscreen || typeof document === "undefined") return;
    return applyCanvasFullscreenScrollLock(document);
  }, [controls.fullscreen]);

  const refreshStudioBundle = useCallback(async (projectId = activeProjectId) => {
    const conversationId = active?.conversationId ?? undefined;
    if (!projectId) {
      setStudioBundle(undefined);
      setStudioError(undefined);
      setStudioLoading(false);
      return;
    }
    setStudioLoading(true);
    setStudioError(undefined);
    try {
      const bundle = await getCanvasProjectBundle(projectId, conversationId);
      if (isActiveStudioScope(activeStudioScopeRef.current, projectId, conversationId)) setStudioBundle(bundle);
    } catch (cause) {
      if (isActiveStudioScope(activeStudioScopeRef.current, projectId, conversationId)) {
        setStudioBundle(undefined);
        setStudioError(cause instanceof Error ? cause.message : "Canvas Studio sync failed");
      }
    } finally {
      if (isActiveStudioScope(activeStudioScopeRef.current, projectId, conversationId)) setStudioLoading(false);
    }
  }, [activeProjectId, active?.conversationId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) {
      setStudioBundle(undefined);
      setStudioError(undefined);
      setStudioLoading(false);
      return;
    }
    setStudioLoading(true);
    setStudioError(undefined);
    void getCanvasProjectBundle(activeProjectId, active?.conversationId ?? undefined)
      .then((bundle) => {
        if (!cancelled) setStudioBundle(bundle);
      })
      .catch((cause) => {
        if (!cancelled) {
          setStudioBundle(undefined);
          setStudioError(cause instanceof Error ? cause.message : "Canvas Studio sync failed");
        }
      })
      .finally(() => {
        if (!cancelled) setStudioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, active?.conversationId]);

  async function save(input: { title: string; contentText: string }) {
    if (!active) return;
    setBusy(true);
    try {
      onCanvasUpdated(await updateCanvas(active.id, { ...input, reason: "manual_save" }, active.conversationId ?? undefined));
      await refreshStudioBundle();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function renameTitle(value: string) {
    if (!active) return;
    const title = value.trim();
    if (!title) {
      setTitleDraft(active.title);
      return;
    }
    if (title === active.title) return;
    setBusy(true);
    try {
      onCanvasUpdated(await updateCanvas(active.id, { title, reason: "rename" }, active.conversationId ?? undefined));
      await refreshStudioBundle();
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: CanvasAction) {
    if (!active) return;
    setBusy(true);
    try {
      onCanvasUpdated(await editCanvas(active.id, { action: actionName }, active.conversationId ?? undefined));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!active) return;
    setBusy(true);
    try {
      onCanvasUpdated(await restoreCanvas(active.id, active.conversationId ?? undefined));
    } finally {
      setBusy(false);
    }
  }

  async function exportCanvas(format: CanvasToolbarExportFormat) {
    if (!active) return;
    setExportNotice(undefined);
    if (format !== "obsidian") {
      await downloadCanvas(active, format, surfaceRef.current);
      return;
    }
    setBusy(true);
    try {
      const result = await exportCanvasToObsidian(active.id, active.conversationId ?? undefined);
      setExportNotice(`Exported to Obsidian: ${result.relativePath}`);
    } catch (cause) {
      setExportNotice(cause instanceof Error ? cause.message : "Obsidian export failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestStudioReview() {
    if (!activeProjectId || !active) return;
    setBusy(true);
    setExportNotice(undefined);
    try {
      await createCanvasReviewReport(activeProjectId, {
        scope: "studio_quality",
        scoreJson: { requestedFrom: "canvas_studio_panel" },
        findingsJson: [{ type: "review_requested", canvasId: active.id, title: active.title }],
        ...(currentStudioVersionId(studioBundle, activeProjectId) ? { versionId: currentStudioVersionId(studioBundle, activeProjectId) } : {})
      }, active.conversationId ?? undefined);
      await refreshStudioBundle(activeProjectId);
      setExportNotice("Canvas Studio review recorded.");
    } catch (cause) {
      setExportNotice(cause instanceof Error ? cause.message : "Canvas Studio review failed");
    } finally {
      setBusy(false);
    }
  }

  async function queueStudioExport() {
    if (!activeProjectId || !active) {
      await exportCanvas("html");
      return;
    }
    setBusy(true);
    setExportNotice(undefined);
    try {
      const job = await createCanvasStudioJob(activeProjectId, {
        type: "export",
        format: active.kind === "ppt" ? "pptx" : "html",
        optionsJson: { requestedFrom: "canvas_studio_panel" },
        ...(currentStudioVersionId(studioBundle, activeProjectId) ? { versionId: currentStudioVersionId(studioBundle, activeProjectId) } : {})
      }, active.conversationId ?? undefined);
      await refreshStudioBundle(activeProjectId);
      setExportNotice(`Canvas Studio export queued: ${job.id}`);
    } catch (cause) {
      setExportNotice(cause instanceof Error ? cause.message : "Canvas Studio export failed");
    } finally {
      setBusy(false);
    }
  }

  if (controls.fullscreen) {
    return (
      <aside aria-label={t("canvas.workspace")} data-canvas-fullscreen="true" className="card-workspace relative flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-background">
        <div ref={surfaceRef} className="flex h-full min-h-0 w-full overflow-hidden overscroll-none bg-background">
          {!active ? (
            <EmptyCanvas />
          ) : active.kind === "ppt" ? (
            <PptCanvasViewer content={active.contentJson} fallbackText={active.contentText} deckUrl={deckUrl} fullscreen />
          ) : (
            <div className="h-full min-h-0 w-full overflow-y-auto bg-background">
              <CanvasRenderer content={active.contentJson} fallbackText={active.contentText} />
            </div>
          )}
        </div>
        <div data-testid="canvas-exit-dock" className="group absolute bottom-3 right-3 z-20 flex h-16 w-16 items-end justify-end">
          <span className="pointer-events-none absolute bottom-2 right-2 h-1 w-8 rounded-full bg-foreground/35 opacity-70 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0" />
          <button
            data-card-control
            type="button"
            title={t("canvas.exitFullscreen")}
            aria-label={t("canvas.exitFullscreen")}
            onClick={controls.onToggleFullscreen}
            className="icon-chip size-10 translate-y-3 opacity-0 shadow-[var(--shadow-dock)] transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 [&>svg]:size-4"
          >
            <Minimize2Icon />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label={t("canvas.workspace")} className="card-workspace flex h-full min-h-0 flex-col bg-card/85">
      <header className="flex h-10 shrink-0 cursor-grab touch-none items-center justify-between gap-2 border-b border-border bg-background/85 px-2 active:cursor-grabbing" {...controls.moveProps}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="card-title-icon flex size-7 shrink-0 items-center justify-center rounded-[0.7rem] bg-muted text-muted-foreground">
            <FileTextIcon className="size-4" />
          </span>
          <input
            value={titleDraft}
            disabled={!active || busy}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void renameTitle(titleDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setTitleDraft(active?.title ?? "");
            }}
            aria-label={t("canvas.title")}
            className="min-w-0 flex-1 truncate rounded-[0.55rem] border border-transparent bg-transparent px-1 py-1 text-sm font-semibold outline-none transition hover:border-border focus:border-ring focus:bg-background"
            placeholder={t("canvas.noCanvas")}
          />
          {active?.status === "streaming" ? <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">{t("canvas.generating")}</span> : null}
        </div>
        <div className="card-header-actions flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto">
          <CanvasHistory canvases={canvases} activeId={active?.id} onSelect={onOpenCanvas} />
          <CanvasToolbar
            editing={editing}
            disabled={!active || busy}
            aiDisabled={activeIsLegacyArtifact}
            onEdit={() => setEditing((value) => !value)}
            onCopy={() => active && void navigator.clipboard.writeText(active.contentText)}
            restoreDisabled={activeIsLegacyArtifact}
            onRestore={() => void restore()}
            onAction={(value) => void action(value)}
            onExport={(format) => void exportCanvas(format)}
          />
          <HeaderButton title={controls.fullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")} onClick={controls.onToggleFullscreen}>{controls.fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}</HeaderButton>
          <HeaderButton title={t("card.resetLayout")} onClick={controls.onReset}><RotateCcwIcon /></HeaderButton>
          <HeaderButton title={t("canvas.hide")} onClick={controls.onClose}><XIcon /></HeaderButton>
        </div>
      </header>
      {exportNotice ? (
        <div role="status" className="border-b border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
          {exportNotice}
        </div>
      ) : null}
      <div className="canvas-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <CanvasStudioPanel
          canvas={active}
          editing={editing}
          studioBundle={studioBundle}
          studioLoading={studioLoading}
          studioError={studioError}
          onEdit={() => setEditing((value) => !value)}
          onReview={() => void requestStudioReview()}
          onExport={() => void queueStudioExport()}
        />
        <div className="p-2">
          {!active ? (
            <EmptyCanvas />
          ) : editing ? (
            <CanvasEditor canvas={active} showTitle={false} onSave={(input) => void save({ title: titleDraft || active.title, contentText: input.contentText })} />
          ) : (
            <div ref={surfaceRef} className="min-h-full bg-background px-2">
              {active.kind === "ppt" ? (
                <PptCanvasViewer content={active.contentJson} fallbackText={active.contentText} deckUrl={deckUrl} />
              ) : (
                <CanvasRenderer content={active.contentJson} fallbackText={active.contentText} />
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function metadataString(metadata: Canvas["metadata"] | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isActiveStudioScope(scope: { projectId: string | undefined; conversationId: string | undefined }, projectId: string, conversationId: string | undefined) {
  return scope.projectId === projectId && scope.conversationId === conversationId;
}

function currentStudioVersionId(bundle: CanvasProjectBundle | undefined, projectId: string | undefined) {
  if (!bundle || bundle.project.id !== projectId) return undefined;
  return bundle.project.currentVersionId;
}

function EmptyCanvas() {
  const { t } = useWorkbenchI18n();
  return <div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.2rem] border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">{t("canvas.empty")}</div>;
}
