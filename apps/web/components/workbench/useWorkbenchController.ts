"use client";

import { type ChatMessage, type PricingCurrency, type ToolCallState } from "@pinocchio/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendConversationMessages,
  createConversation,
  createTask,
  deleteConversation,
  executePlan,
  generatePlan,
  getMemory,
  getTaskEvents,
  listConversations,
  listPlans,
  listTasks,
  updatePlan,
  uploadFile
} from "../../lib/apiClient";
import { getCanvas, listCanvases } from "../../lib/canvasClient";
import { streamChat } from "../../lib/streamClient";
import { loadAvatarPreferences, saveAvatarPreferences } from "./avatarPreferences";
import type { AvatarPreferences } from "./avatarPreferences";
import { applyCanvasResultUpsert, applyConversationRefresh, applyScopedBusy, applyScopedCanvasListRefresh, applyScopedCanvasPatch, applyScopedCanvasTextAppend, applyScopedCanvasUpsert, applyScopedMessageStatus, applyScopedMessageUpdate, applyScopedPlanSave, applyScopedStatusUpdate, applyScopedTaskRefresh, applyScopedToolUpdate, finalStreamingStatus, formatAssistantError, resetWorkspaceData, shouldRefreshConversationAfterStream, shouldRefreshConversationForTaskCompletion, upsertAssistant, upsertReasoning } from "./controllerHelpers";
import { initialWorkbenchState } from "./initialWorkbenchState";
import { taskCanvasIds } from "./taskCanvasSync";
import type { MessageDeliveryStatus, WorkbenchState } from "./types";
import { compactTitle } from "./utils";
import { applyOutgoingUserMessage, buildWorkbenchChatRequest } from "./workbenchChatActions";
import { applyEnsuredConversation, applySelectedConversation, withActiveConversationReasoning } from "./workbenchConversationActions";
import { derivePlanState } from "./workbenchControllerState";
import { applyGeneratedPlanResult, resolvePlanDraftInput } from "./workbenchPlanActions";
import { handleWorkbenchStreamEvent, type WorkbenchStreamActions } from "./workbenchStreamEvents";

export function useWorkbenchController() {
  const [state, setState] = useState<WorkbenchState>(initialWorkbenchState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshCanvases = useCallback(async (conversationId = stateRef.current.conversationId) => {
    if (!conversationId) {
      setState((current) => applyScopedCanvasListRefresh(current, conversationId, []));
      return;
    }
    const canvases = await listCanvases(conversationId);
    setState((current) => applyScopedCanvasListRefresh(current, conversationId, canvases));
  }, []);

  const refreshPlans = useCallback(async (conversationId = stateRef.current.conversationId) => {
    if (!conversationId) {
      setState((current) => ({ ...current, ...derivePlanState(current, []) }));
      return;
    }
    const plans = await listPlans(conversationId);
    setState((current) => {
      if ((conversationId ?? undefined) !== (current.conversationId ?? undefined)) return current;
      return { ...current, ...derivePlanState(current, plans) };
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    const activeId = stateRef.current.conversationId;
    const conversations = withActiveConversationReasoning(await listConversations(), activeId, stateRef.current.messages);
    const active = conversations.find((item) => item.id === activeId);
    setState((current) => applyConversationRefresh(current, conversations));
    await Promise.all([refreshCanvases(active?.id), refreshPlans(active?.id)]);
  }, [refreshCanvases, refreshPlans]);

  const loadTasks = useCallback(async (conversationId = stateRef.current.conversationId) => {
    if (!conversationId) {
      setState((current) => ({ ...current, tasks: [], taskEvents: {} }));
      return;
    }
    const tasks = await listTasks(conversationId);
    const eventPairs = await Promise.all(tasks.map(async (task) => [task.id, await getTaskEvents(task.id, conversationId)] as const));
    const eventMap = Object.fromEntries(eventPairs);
    const shouldRefreshConversation =
      (stateRef.current.conversationId ?? undefined) === conversationId &&
      shouldRefreshConversationForTaskCompletion(stateRef.current.tasks, tasks);
    setState((current) => applyScopedTaskRefresh(current, conversationId, tasks, eventMap));
    if (shouldRefreshConversation && (stateRef.current.conversationId ?? undefined) === conversationId) {
      await refreshConversations().catch(() => undefined);
    }
    for (const task of tasks) {
      for (const canvasId of taskCanvasIds(task, eventMap[task.id] ?? [])) {
        const canvas = await getCanvas(canvasId, conversationId);
        setState((current) => applyScopedCanvasUpsert(current, conversationId, canvas, !current.canvases.some((item) => item.id === canvas.id)));
      }
    }
  }, [refreshConversations]);

  const loadMemory = useCallback(async (conversationId = stateRef.current.conversationId) => {
    if (!conversationId) {
      setState((current) => ({ ...current, memoryItems: [], memoryCandidates: [] }));
      return;
    }
    const data = await getMemory(conversationId);
    setState((current) => {
      if ((conversationId ?? undefined) !== (current.conversationId ?? undefined)) return current;
      return { ...current, memoryItems: data.items, memoryCandidates: data.candidates };
    });
  }, []);

  useEffect(() => {
    void refreshConversations();
    setState((current) => ({ ...current, avatarPreferences: loadAvatarPreferences() }));
  }, [refreshConversations]);

  useEffect(() => {
    if (!state.conversationId) return;
    void loadTasks(state.conversationId).catch(() => undefined);
    void loadMemory(state.conversationId).catch(() => undefined);
    const timer = window.setInterval(() => void loadTasks(state.conversationId).catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, [loadMemory, loadTasks, state.conversationId]);

  async function ensureConversation(seed: string) {
    if (stateRef.current.conversationId) return stateRef.current.conversationId;
    const conversation = await createConversation(compactTitle(seed));
    setState((current) => applyEnsuredConversation(current, conversation));
    return conversation.id;
  }

  async function sendMessage(text: string, artifactMode: boolean, currency: PricingCurrency = "CNY") {
    const conversationId = await ensureConversation(text);
    const baseMessages = stateRef.current.conversationId === conversationId ? stateRef.current.messages : [];
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };
    const assistantId = crypto.randomUUID();
    setState((current) => applyOutgoingUserMessage(current, conversationId, baseMessages, userMessage));
    const request = buildWorkbenchChatRequest(stateRef.current, {
      requestId: crypto.randomUUID(),
      conversationId,
      baseMessages,
      userMessage,
      artifactMode,
      currency,
    });
    let failed = false;
    let accepted = false;
    let failureMessage: string | undefined;
    const streamActions: WorkbenchStreamActions = {
      updateAssistant,
      replaceAssistant,
      updateReasoning,
      updateTool,
      upsertCanvas,
      appendCanvasText,
      patchCanvas,
      setScopedState,
      setState
    };
    try {
      await streamChat(request, (event) => {
        if (!accepted) {
          accepted = true;
          setMessageStatus(userMessage.id, "sent", conversationId);
        }
        const result = handleWorkbenchStreamEvent(event, { assistantId, conversationId, actions: streamActions });
        if (result?.failed) {
          failed = true;
          failureMessage = result.failureMessage;
        }
      });
    } catch (cause) {
      failed = true;
      const message = cause instanceof Error ? cause.message : String(cause);
      failureMessage = message;
      updateAssistant(assistantId, formatAssistantError(message), conversationId);
      setState((current) => applyScopedStatusUpdate(current, conversationId, message));
    } finally {
      setScopedState(conversationId, (current) => ({ ...current, streaming: false, status: finalStreamingStatus(failed, failureMessage ?? current.status) }));
      setMessageStatus(userMessage.id, failed ? "failed" : "delivered", conversationId);
      if (shouldRefreshConversationAfterStream(failed)) await refreshConversations().catch(() => undefined);
      await refreshCanvases(conversationId).catch(() => undefined);
    }
  }

  async function startDeepResearch(query: string) {
    const conversationId = await ensureConversation(query);
    const now = new Date().toISOString();
    const queued: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `已创建深度研究任务，结果将在 Canvas 中生成：${query}`,
      createdAt: now
    };
    const user: ChatMessage = { id: crypto.randomUUID(), role: "user", content: query, createdAt: now };
    setState((current) => {
      if ((current.conversationId ?? undefined) !== conversationId) return current;
      return {
        ...current,
        messages: [...current.messages, user, queued],
        messageStatusById: { ...current.messageStatusById, [user.id]: "delivered" },
        workspaceTab: "tasks",
        busy: true
      };
    });
    await appendConversationMessages(conversationId, [user, queued]);
    await createTask({ type: "research.deep", title: compactTitle(query, "Deep research"), conversationId, input: { query } });
    await Promise.all([refreshConversations(), loadTasks(conversationId)]).finally(() =>
      setState((current) => applyScopedBusy(current, conversationId, false))
    );
  }

  async function createPlan(prompt: string) {
    const conversationId = await ensureConversation(prompt);
    setState((current) => ((current.conversationId ?? undefined) === conversationId ? { ...current, busy: true, workspaceTab: "plan" } : current));
    try {
      const result = await generatePlan(prompt, conversationId);
      const plan = result.plan;
      if ((stateRef.current.conversationId ?? undefined) !== conversationId) {
        setState((current) => applyScopedBusy(current, conversationId, false));
        return undefined;
      }
      setState((current) => applyGeneratedPlanResult(current, conversationId, result));
      return plan;
    } catch (cause) {
      setState((current) => applyScopedBusy(current, conversationId, false));
      throw cause;
    }
  }

  async function savePlan(planId = stateRef.current.activePlanId) {
    const input = resolvePlanDraftInput(stateRef.current, planId);
    if (!input) return undefined;
    const saved = await updatePlan(input.plan.id, { content: input.content }, input.conversationId);
    setState((current) => applyScopedPlanSave(current, input.conversationId, saved));
    return saved;
  }

  async function runPlan(planId = stateRef.current.activePlanId, currency: PricingCurrency = "CNY") {
    const input = resolvePlanDraftInput(stateRef.current, planId);
    if (!input) return;
    setState((current) => (
      (current.conversationId ?? undefined) === input.conversationId
        ? { ...current, busy: true, workspaceTab: "tasks" }
        : current
    ));
    try {
      await executePlan(input.plan.id, input.content, currency, input.conversationId);
      await Promise.all([refreshConversations(), loadTasks(input.conversationId), refreshPlans(input.conversationId)]);
      return input.conversationId;
    } finally {
      setState((current) => applyScopedBusy(current, input.conversationId, false));
    }
  }

  async function addFile(file: File) {
    const conversationId = await ensureConversation(file.name);
    const uploaded = await uploadFile(file, conversationId);
    setState((current) => ({ ...current, files: [...current.files, uploaded] }));
  }

  function setScopedState(conversationId: string | undefined, update: (current: WorkbenchState) => WorkbenchState) {
    setState((current) => ((current.conversationId ?? undefined) === (conversationId ?? undefined) ? update(current) : current));
  }

  function updateAssistant(id: string, content: string, conversationId?: string) {
    setState((current) => applyScopedMessageUpdate(current, conversationId, (messages) => upsertAssistant(messages, id, content)));
  }

  function replaceAssistant(id: string, content: string, conversationId?: string) {
    setState((current) => applyScopedMessageUpdate(current, conversationId, (messages) => upsertAssistant(messages, id, content, true)));
  }

  function updateReasoning(id: string, content: string, conversationId?: string) {
    setState((current) => applyScopedMessageUpdate(current, conversationId, (messages) => upsertReasoning(messages, id, content)));
  }

  function updateTool(next: ToolCallState, conversationId?: string) {
    setState((current) => applyScopedToolUpdate(current, conversationId, next));
  }

  function setMessageStatus(id: string, status: MessageDeliveryStatus, conversationId?: string) {
    setState((current) => applyScopedMessageStatus(current, conversationId, id, status));
  }

  function setAvatarPreferences(preferences: AvatarPreferences) {
    saveAvatarPreferences(preferences);
    setState((current) => ({ ...current, avatarPreferences: preferences }));
  }

  function upsertCanvas(canvas: NonNullable<WorkbenchState["canvases"][number]>, activate = true, conversationId = stateRef.current.conversationId) {
    setState((current) => applyCanvasResultUpsert(current, conversationId, canvas, activate));
  }

  function appendCanvasText(id: string, delta: string, conversationId = stateRef.current.conversationId) {
    setState((current) => applyScopedCanvasTextAppend(current, conversationId, id, delta));
  }

  function patchCanvas(id: string, contentJson: WorkbenchState["canvases"][number]["contentJson"], conversationId = stateRef.current.conversationId) {
    setState((current) => applyScopedCanvasPatch(current, conversationId, id, contentJson));
  }

  function setActivePlan(activePlanId: string) {
    setState((current) => {
      const plan = current.plans.find((item) => item.id === activePlanId);
      return { ...current, activePlanId, plan, planDraft: plan ? current.planDraftById[plan.id] ?? plan.content : "" };
    });
  }

  function setPlanDraftFor(planId: string, value: string) {
    setState((current) => ({
      ...current,
      planDraftById: { ...current.planDraftById, [planId]: value },
      planDraft: current.activePlanId === planId ? value : current.planDraft
    }));
  }

  return {
    state,
    setControl: <K extends "model" | "thinking" | "reasoningEffort" | "mode" | "toolMode" | "workspaceTab" | "mobileSheet">(key: K, value: WorkbenchState[K]) => setState((current) => ({ ...current, [key]: value })),
    newConversation: () => setState((current) => ({ ...resetWorkspaceData(current), conversationId: undefined, messages: [] })),
    selectConversation: (id: string) => {
      const conversation = stateRef.current.conversations.find((item) => item.id === id);
      if (conversation) {
        setState((current) => applySelectedConversation(current, conversation));
        void refreshCanvases(id);
        void refreshPlans(id);
      }
    },
    deleteConversation: async (id: string) => {
      await deleteConversation(id);
      await refreshConversations();
    },
    setPlanDraft: (planDraft: string) => {
      const activePlanId = stateRef.current.activePlanId;
      if (activePlanId) setPlanDraftFor(activePlanId, planDraft);
      else setState((current) => ({ ...current, planDraft }));
    },
    setPlanDraftFor,
    setActivePlan,
    savePlan,
    setAvatarPreferences,
    setActiveCanvas: (activeCanvasId: string) => setState((current) => ({ ...current, activeCanvasId })),
    upsertCanvas,
    sendMessage,
    startDeepResearch,
    createPlan,
    runPlan,
    addFile,
    refreshTasks: loadTasks,
    refreshCanvases,
    refreshPlans
  };
}
