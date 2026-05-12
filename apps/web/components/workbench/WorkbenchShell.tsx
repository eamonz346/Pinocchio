"use client";

import type { PricingCurrency } from "@pinocchio/shared";
import { ArchiveIcon, HistoryIcon, LanguagesIcon, LayoutPanelTopIcon, ListChecksIcon, Maximize2Icon, MessageSquareTextIcon, MoonIcon, PanelsTopLeftIcon, PlusIcon, SettingsIcon, SunIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AutoHideDock, DockControl, DockGroup, DockSeparator } from "./AutoHideDock";
import { CardStage, cardLayoutsEqual, cardLayoutStorageKey, createDefaultCardLayout, createDefaultCardLayouts, fitCardLayoutsToViewport, maxCardZIndex, type CardDefinition, type CardLayout, type CardLayoutMap, type CardWindowControls, type WorkbenchCardId } from "./CardStage";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { Composer } from "./Composer";
import { FullscreenChatSurface } from "./FullscreenChatSurface";
import { getInitialDarkTheme, runThemeTransition } from "./themeTransition";
import { useWorkbenchController } from "./useWorkbenchController";
import { V2PanelLayer, type V2Panel } from "./V2Panels";
import { ChatCard, PlanCard } from "./WorkbenchCards";
import { buildChatAnchors, canvasCardId, ensureRenderableLayouts, firstVisibleCard, hasVisibleKind, kindFromCardId, loadCardLayouts, planCardId } from "./workbenchCardInstances";
import { createTranslator, WorkbenchI18nProvider, type WorkbenchLanguage } from "./workbenchI18n";

type WorkbenchLayoutMode = "a" | "b";
type PendingCanvasReveal = { conversationId: string | undefined; allowNewConversation: boolean } | null;

export function WorkbenchShell() {
  const {
    state,
    setControl,
    newConversation,
    selectConversation,
    deleteConversation,
    setPlanDraft,
    setPlanDraftFor,
    setActivePlan,
    savePlan,
    setAvatarPreferences,
    sendMessage,
    startDeepResearch,
    createPlan,
    runPlan,
    addFile,
    refreshTasks,
    refreshCanvases,
    setActiveCanvas,
    upsertCanvas
  } = useWorkbenchController();
  const [panel, setPanel] = useState<V2Panel>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [language, setLanguage] = useState<WorkbenchLanguage>("zh");
  const [layoutMode, setLayoutMode] = useState<WorkbenchLayoutMode>("a");
  const [cardLayouts, setCardLayouts] = useState<CardLayoutMap>(() => createDefaultCardLayouts());
  const [focusedCard, setFocusedCard] = useState<WorkbenchCardId>("chat");
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [layoutConversationId, setLayoutConversationId] = useState<string | undefined>(undefined);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingCanvasRevealRef = useRef<PendingCanvasReveal>(null);
  const seenCanvasIdsRef = useRef<Set<string>>(new Set());
  const chatAnchors = useMemo(() => buildChatAnchors(state.messages), [state.messages]);
  const t = useMemo(() => createTranslator(language), [language]);
  const currency: PricingCurrency = language === "zh" ? "CNY" : "USD";
  const chatNode = (surface: "card" | "fullscreen") => (
    <ChatCard
      messages={state.messages}
      toolCalls={state.toolCalls}
      streaming={state.streaming}
      dockOpen={surface === "fullscreen" && dockOpen}
      messageStatusById={state.messageStatusById}
      avatarPreferences={state.avatarPreferences}
      scrollRootRef={messagesScrollRef}
      anchors={chatAnchors}
      surface={surface}
      onJumpToStart={() => messagesScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      onJumpToEnd={() => {
        const root = messagesScrollRef.current;
        root?.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
      }}
      onJumpToMessage={(id) => document.getElementById(`chat-message-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" })}
      composer={composer((text, artifactMode) => void sendChatMessage(text, artifactMode), surface)}
    />
  );

  const cards = useMemo<CardDefinition[]>(() => [
    {
      id: "chat",
      kind: "chat",
      title: t("message.chatCard"),
      icon: <MessageSquareTextIcon />,
      minWidth: 460,
      minHeight: 420,
      children: chatNode("card")
    },
    ...state.plans.map((plan) => ({
      id: planCardId(plan.id),
      kind: "plan" as const,
      title: plan.primaryGoal || t("planPanel.title"),
      icon: <ListChecksIcon />,
      minWidth: 430,
      minHeight: 500,
      customChrome: true,
      children: (controls: CardWindowControls) => (
        <PlanCard
          plan={plan}
          planDraft={state.planDraftById[plan.id] ?? plan.content}
          busy={state.busy}
          tasks={state.tasks}
          taskEvents={state.taskEvents}
          controls={controls}
          onPlanDraft={(value) => setPlanDraftFor(plan.id, value)}
          onSavePlan={() => void savePlan(plan.id)}
          onRunPlan={() => void runPlanAndRevealCanvas(plan.id)}
        />
      )
    })),
    ...state.canvases.map((canvas) => ({
      id: canvasCardId(canvas.id),
      kind: "canvas" as const,
      title: canvas.title || t("canvasPanel.title"),
      icon: <LayoutPanelTopIcon />,
      minWidth: 520,
      minHeight: 460,
      customChrome: true,
      children: (controls: CardWindowControls) => (
        <CanvasWorkspace
          canvases={state.canvases}
          canvasId={canvas.id}
          controls={controls}
          onOpenCanvas={openCanvasCard}
          onCanvasUpdated={upsertCanvas}
        />
      )
    }))
  ], [chatAnchors, dockOpen, state.avatarPreferences, state.busy, state.canvases, state.capabilityFlags, state.conversationId, state.files, state.messageStatusById, state.messages, state.model, state.mode, state.planDraftById, state.plans, state.reasoningEffort, state.streaming, state.taskEvents, state.tasks, state.thinking, state.toolCalls, state.toolMode, t]);
  const cardLayoutItems = useMemo(() => cards.map(({ id, kind }) => ({ id, kind })), [cards]);
  const visiblePlan = hasVisibleKind(cardLayouts, "plan");
  const visibleCanvas = hasVisibleKind(cardLayouts, "canvas");

  useEffect(() => {
    const initialDark = getInitialDarkTheme();
    document.documentElement.classList.toggle("dark", initialDark);
    setDark(initialDark);
    setThemeReady(true);
    const storedLanguage = window.localStorage.getItem("workbench-language");
    const initialLanguage = storedLanguage === "en" || storedLanguage === "zh" ? storedLanguage : "zh";
    setLanguage(initialLanguage);
    document.documentElement.lang = initialLanguage === "zh" ? "zh-CN" : "en";
  }, []);

  useEffect(() => {
    setLayoutHydrated(false);
    const next = loadCardLayouts(state.conversationId);
    setCardLayouts(next);
    setFocusedCard(firstVisibleCard(next, ["chat"]));
    setLayoutConversationId(state.conversationId);
    setLayoutHydrated(true);
  }, [state.conversationId]);

  useEffect(() => {
    setCardLayouts((current) => {
      const next = ensureRenderableLayouts(current, cardLayoutItems);
      return cardLayoutsEqual(next, current) ? current : next;
    });
  }, [cardLayoutItems]);

  useEffect(() => {
    if (!state.conversationId || !layoutHydrated || layoutConversationId !== state.conversationId) return;
    window.localStorage.setItem(cardLayoutStorageKey(state.conversationId), JSON.stringify(cardLayouts));
  }, [cardLayouts, layoutConversationId, layoutHydrated, state.conversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame: number | undefined;
    const syncDefaultLayoutsToViewport = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setCardLayouts((current) => {
          const next = fitCardLayoutsToViewport(current);
          return cardLayoutsEqual(next, current) ? current : next;
        });
      });
    };
    window.addEventListener("resize", syncDefaultLayoutsToViewport);
    window.visualViewport?.addEventListener("resize", syncDefaultLayoutsToViewport);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(syncDefaultLayoutsToViewport);
    observer?.observe(document.documentElement);
    syncDefaultLayoutsToViewport();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", syncDefaultLayoutsToViewport);
      window.visualViewport?.removeEventListener("resize", syncDefaultLayoutsToViewport);
    };
  }, []);

  useEffect(() => {
    const pending = pendingCanvasRevealRef.current;
    if (pending?.allowNewConversation && !pending.conversationId && state.conversationId) {
      pendingCanvasRevealRef.current = { conversationId: state.conversationId, allowNewConversation: false };
    } else if (pending && (pending.conversationId ?? undefined) !== (state.conversationId ?? undefined)) {
      pendingCanvasRevealRef.current = null;
    }
    seenCanvasIdsRef.current = new Set(state.canvases.map((canvas) => canvas.id));
  }, [state.conversationId]);

  useEffect(() => {
    const nextIds = new Set(state.canvases.map((canvas) => canvas.id));
    const fresh = state.canvases.find((canvas) => !seenCanvasIdsRef.current.has(canvas.id));
    seenCanvasIdsRef.current = nextIds;
    const fallback = !visibleCanvas ? state.activeCanvasId ?? state.canvases[0]?.id : undefined;
    const target = fresh?.id ?? fallback;
    if (target && isPendingCanvasRevealForCurrent()) {
      pendingCanvasRevealRef.current = null;
      openCanvasCard(target);
    }
  }, [state.activeCanvasId, state.canvases, visibleCanvas]);

  function applyTheme(next: boolean) {
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  function setUiLanguage(next: WorkbenchLanguage) {
    setLanguage(next);
    window.localStorage.setItem("workbench-language", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }

  return (
    <WorkbenchI18nProvider language={language}>
      {layoutMode === "a" ? (
        <>
          <FullscreenChatSurface>
            {chatNode("fullscreen")}
          </FullscreenChatSurface>
          <CardStage
            overlay
            layouts={cardLayouts}
            focusedCard={focusedCard}
            cards={cards.filter((card) => card.kind !== "chat")}
            onLayout={setCardLayout}
            onFocus={focusCard}
            onClose={hideCard}
            onReset={resetCardLayout}
          />
        </>
      ) : (
        <CardStage
          layouts={cardLayouts}
          focusedCard={focusedCard}
          cards={cards}
          onLayout={setCardLayout}
          onFocus={focusCard}
          onClose={hideCard}
          onReset={resetCardLayout}
        />
      )}

      <AutoHideDock
        {...(panel ? { className: "h-dvh" } : {})}
        overlay={panel ? panelLayer(panel as Exclude<V2Panel, null>) : null}
        onOpenChange={(open) => setDockOpen(open)}
        primary={
          <>
            <DockGroup label="Layout">
              <DockControl data-testid="layout-mode-toggle" title={layoutMode === "a" ? "B Mode" : "A Mode"} aria-label={layoutMode === "a" ? "B Mode" : "A Mode"} active={layoutMode === "b"} onClick={(event) => { event.stopPropagation(); toggleLayoutMode(); }}>{layoutMode === "a" ? <PanelsTopLeftIcon /> : <Maximize2Icon />}</DockControl>
            </DockGroup>
            <DockSeparator />
            <DockGroup label="Workspace">
              <DockControl data-testid="dock-new-conversation-control" title={t("conversation.new")} aria-label={t("conversation.new")} onClick={(event) => { event.stopPropagation(); startNewConversation(); }}><PlusIcon /></DockControl>
              <DockControl data-testid="dock-chat-control" title={t("message.chatCard")} aria-label={t("message.chatCard")} active={layoutMode === "a" ? focusedCard === "chat" : Boolean(cardLayouts.chat?.visible && focusedCard === "chat")} onClick={(event) => { event.stopPropagation(); activateWorkspaceControl("chat"); }}><MessageSquareTextIcon /></DockControl>
              <DockControl data-testid="dock-plan-control" title={t("dock.plan")} aria-label={t("dock.plan")} active={panel === "plan" || visiblePlan} onClick={(event) => { event.stopPropagation(); activateWorkspaceControl("plan"); }}><ListChecksIcon /></DockControl>
              <DockControl data-testid="dock-canvas-control" title={t("dock.canvas")} aria-label={t("dock.canvas")} active={panel === "canvas" || visibleCanvas} onClick={(event) => { event.stopPropagation(); activateWorkspaceControl("canvas"); }}><LayoutPanelTopIcon /></DockControl>
            </DockGroup>
            <DockSeparator />
            <DockGroup label="Panels">
              <DockControl data-testid="dock-timeline-control" title={t("dock.timeline")} aria-label={t("dock.timeline")} active={panel === "timeline"} onClick={(event) => { event.stopPropagation(); togglePanel("timeline"); }}><HistoryIcon /></DockControl>
              <DockControl data-testid="dock-organize-control" title={t("dock.organize")} aria-label={t("dock.organize")} active={panel === "organize"} onClick={(event) => { event.stopPropagation(); togglePanel("organize"); }}><ArchiveIcon /></DockControl>
              <DockControl data-testid="dock-settings-control" title={t("dock.settings")} aria-label={t("dock.settings")} active={panel === "settings"} onClick={(event) => { event.stopPropagation(); togglePanel("settings"); }}><SettingsIcon /></DockControl>
            </DockGroup>
          </>
        }
        tools={
          <DockGroup label="Appearance">
            <DockControl
              title={themeReady && dark ? t("dock.themeDark") : t("dock.themeLight")}
              aria-label={t("dock.theme")}
              active={themeReady && dark}
              onClick={(event) => {
                event.stopPropagation();
                runThemeTransition(event, () => applyTheme(!dark));
              }}
            >
              {themeReady && dark ? <SunIcon /> : <MoonIcon />}
            </DockControl>
            <DockControl
              title={language === "zh" ? t("dock.languageZh") : t("dock.languageEn")}
              aria-label={t("dock.language")}
              active={language === "en"}
              onClick={(event) => {
                event.stopPropagation();
                setUiLanguage(language === "zh" ? "en" : "zh");
              }}
            >
              <LanguagesIcon />
            </DockControl>
          </DockGroup>
        }
      />
    </WorkbenchI18nProvider>
  );

  function composer(onSend: (text: string, artifactMode: boolean) => void, surface: "card" | "fullscreen") {
    return (
      <Composer
        model={state.model}
        mode={state.mode}
        thinking={state.thinking}
        reasoningEffort={state.reasoningEffort}
        toolMode={state.toolMode}
        capabilityFlags={state.capabilityFlags}
        files={state.files}
        messages={state.messages}
        usageSummary={state.lastUsageSummary}
        busy={state.busy || state.streaming}
        dockOpen={dockOpen}
        dockAvoidance={surface === "fullscreen" ? "always" : "overlap"}
        onControl={(key, value) => setControl(key, value as never)}
        onSend={onSend}
        onDeepResearch={(query) => {
          beginCanvasReveal();
          void startDeepResearch(query);
        }}
        onCreatePlan={(prompt) => {
          void createPlan(prompt).then((plan) => {
            if (plan) openPlanCard(plan.id);
          });
        }}
        onFile={(file) => void addFile(file)}
      />
    );
  }

  async function sendChatMessage(text: string, artifactMode: boolean) {
    beginCanvasReveal();
    revealFullscreenChat();
    try {
      await sendMessage(text, artifactMode, currency);
    } finally {
      window.setTimeout(() => {
        pendingCanvasRevealRef.current = null;
      }, 4000);
    }
  }

  async function runPlanAndRevealCanvas(planId?: string) {
    beginCanvasReveal();
    const conversationId = await runPlan(planId, currency);
    if (conversationId) await refreshTasks(conversationId).catch(() => undefined);
  }

  function panelLayer(visiblePanel: Exclude<V2Panel, null>) {
    return (
      <V2PanelLayer
        panel={visiblePanel}
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        canvases={state.canvases}
        activeCanvasId={state.activeCanvasId}
        plans={state.plans}
        activePlanId={state.activePlanId}
        busy={state.busy}
        onClose={() => closePanel()}
        onSelectConversation={selectConversation}
        onDeleteConversation={(id) => void deleteConversation(id)}
        onOpenCanvas={openCanvasCard}
        onOpenPlan={openPlanCard}
        avatarPreferences={state.avatarPreferences}
        onAvatarPreferences={setAvatarPreferences}
        currency={currency}
      />
    );
  }

  function togglePanel(next: Exclude<V2Panel, null>) {
    setPanel((current) => current === next ? null : next);
  }

  function closePanel() {
    setPanel(null);
  }

  function startNewConversation() {
    revealFullscreenChat();
    newConversation();
  }

  function openCanvasCard(id: string) {
    setActiveCanvas(id);
    showCard(canvasCardId(id));
  }

  function openPlanCard(id: string) {
    setActivePlan(id);
    showCard(planCardId(id));
  }

  function beginCanvasReveal() {
    pendingCanvasRevealRef.current = { conversationId: state.conversationId, allowNewConversation: !state.conversationId };
  }

  function isPendingCanvasRevealForCurrent() {
    const pending = pendingCanvasRevealRef.current;
    if (!pending) return false;
    return (pending.conversationId ?? undefined) === (state.conversationId ?? undefined);
  }

  function setCardLayout(id: WorkbenchCardId, layout: CardLayout) {
    setCardLayouts((current) => ({ ...current, [id]: layout }));
  }

  function focusCard(id: WorkbenchCardId) {
    setFocusedCard(id);
    setCardLayouts((current) => {
      const base = current[id] ?? createDefaultCardLayout(id, kindFromCardId(id));
      return { ...current, [id]: { ...base, visible: true, zIndex: maxCardZIndex(current) + 1 } };
    });
  }

  function showCard(id: WorkbenchCardId) {
    if (id.startsWith("canvas:")) void refreshCanvases(state.conversationId).catch(() => undefined);
    closePanel();
    focusCard(id);
  }

  function activateWorkspaceControl(id: "chat" | "plan" | "canvas") {
    if (id === "chat") {
      if (layoutMode === "a") {
        revealFullscreenChat();
        return;
      }
      toggleCard("chat");
      return;
    }
    togglePanel(id);
  }

  function toggleCard(id: WorkbenchCardId) {
    const current = cardLayouts[id];
    if (current?.visible && focusedCard === id) {
      hideCard(id);
      return;
    }
    showCard(id);
  }

  function revealFullscreenChat() {
    closePanel();
    setFocusedCard("chat");
    setCardLayouts((current) => {
      if (layoutMode !== "a") return { ...current, chat: { ...(current.chat ?? createDefaultCardLayout("chat", "chat")), visible: true } };
      return { ...current, chat: { ...(current.chat ?? createDefaultCardLayout("chat", "chat")), visible: true } };
    });
  }

  function toggleLayoutMode() {
    if (layoutMode === "a") {
      setLayoutMode("b");
      focusCard("chat");
      return;
    }
    setLayoutMode("a");
    setFocusedCard("chat");
  }

  function hideCard(id: WorkbenchCardId) {
    const next: CardLayoutMap = { ...cardLayouts, [id]: { ...(cardLayouts[id] ?? createDefaultCardLayout(id, kindFromCardId(id))), visible: false } };
    const renderable = new Set(cards.map((card) => card.id));
    const visible = Object.keys(next).filter((cardId) => renderable.has(cardId) && next[cardId]?.visible);
    if (!visible.length) {
      next.chat = { ...(next.chat ?? createDefaultCardLayout("chat", "chat")), visible: true, zIndex: maxCardZIndex(next) + 1 };
      setFocusedCard("chat");
    } else if (focusedCard === id) {
      const top = visible.reduce((left, right) => (next[right]!.zIndex > next[left]!.zIndex ? right : left), visible[0]!);
      setFocusedCard(top);
    }
    setCardLayouts(next);
  }

  function resetCardLayout(id: WorkbenchCardId) {
    setFocusedCard(id);
    setCardLayouts((current) => ({
      ...current,
      [id]: { ...createDefaultCardLayout(id, kindFromCardId(id)), visible: true, zIndex: maxCardZIndex(current) + 1 }
    }));
  }
}
