import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { after } from "next/server";
import {
  AppendMessagesRequestSchema,
  CanvasAiEditRequestSchema,
  CreateArtifactRequestSchema,
  CreateCanvasOutputRequestSchema,
  CreateCanvasProjectRequestSchema,
  CreateCanvasReviewReportRequestSchema,
  CreateCanvasStudioJobRequestSchema,
  CreateCanvasProjectVersionRequestSchema,
  CreateConversationRequestSchema,
  CreateTaskRequestSchema,
  ExecutePlanRequestSchema,
  GeneratePlanRequestSchema,
  SaveApiKeyRequestSchema,
  SaveBudgetRequestSchema,
  SaveIntegrationsRequestSchema,
  TokenCountRequestSchema,
  UpdateArtifactRequestSchema,
  UpdateCanvasRequestSchema,
  UpdatePlanRequestSchema,
  UpsertCanvasNodeRequestSchema,
  UpsertCanvasProjectFileRequestSchema,
  UpsertMethodologyStateRequestSchema,
  UploadCanvasAssetRequestSchema,
  type AppSettings,
  type ChatMessage,
  type ChatRequest,
  type ChatStreamEvent,
  type MemoryCandidate,
  type MemoryItem,
  ChatRequestSchema,
  CreateCanvasRequestSchema,
  CreateMethodologyItemRequestSchema
} from "@pinocchio/shared";
import {
  describeWorkbenchApiKeys,
  describeWorkbenchIntegrations,
  legacyArtifactIdFromCanvasId,
  legacyArtifactToCanvas,
  runLocalRestricted,
  saveDeepSeekApiKey,
  saveDeepSeekBudgetLimit,
  saveWorkbenchIntegrations
} from "@pinocchio/core";
import { getEnv } from "@pinocchio/core/config/env";
import { getRuntime, resetRuntime } from "../../../lib/serverRuntime";

type RouteContext = {
  params?: Promise<Record<string, string | string[] | undefined>>;
};

type MemoryTier = "daily" | "weekly" | "longterm" | "fact";

type GroupedMemoryItem = MemoryItem & { tier: MemoryTier };

type MemoryResponseData = {
  items: GroupedMemoryItem[];
  candidates: MemoryCandidate[];
  grouped: Record<MemoryTier, GroupedMemoryItem[]>;
  groupedByTier: Record<MemoryTier, GroupedMemoryItem[]>;
};

export function apiOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function apiError(code: string, message: string, status = 400, recoverable = true): Response {
  return Response.json({ ok: false, error: { code, message, recoverable } }, { status });
}

export function requiredConversationId(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get("conversationId");
  return normalizeOptionalText(value);
}

export function requiredConversationIdFromRequestOrBody(request: Request, body: unknown): string | undefined {
  return (
    requiredConversationId(request) ??
    (body instanceof FormData ? normalizeOptionalText(body.get("conversationId")) : normalizeOptionalText(readObjectString(body, "conversationId")))
  );
}

export function stripConversationScope<T>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { conversationId: _conversationId, ...rest } = body as Record<string, unknown>;
  return rest as T;
}

export function projectMatchesConversation(
  project: { conversationId?: string | null } | undefined,
  conversationId: string
): boolean {
  return Boolean(project && project.conversationId === conversationId);
}

export async function getReadyChatEngine(runtime: ReturnType<typeof getRuntime>) {
  await runtime.pluginLoadPromise;
  return runtime.chatEngine;
}

export async function buildSettingsPayload(
  runtime: ReturnType<typeof getRuntime>,
  sessionId: string,
  currency: "CNY" | "USD"
): Promise<AppSettings & { integrations: NonNullable<AppSettings["integrations"]> }> {
  await runtime.pluginLoadPromise;
  return {
    deepSeek: describeWorkbenchApiKeys().deepSeek,
    integrations: {
      ...describeWorkbenchIntegrations(),
      plugins: runtime.pluginManager?.listStatuses?.() ?? []
    },
    pricing: await runtime.pricingService.getStatus(currency),
    budget: await runtime.budgetService.status(sessionId, currency)
  };
}

export function buildMemoryResponseData(input: {
  items: MemoryItem[];
  candidates: MemoryCandidate[];
  tier?: string | null | undefined;
  query?: string | null | undefined;
}): MemoryResponseData {
  const tiers: MemoryTier[] = ["daily", "weekly", "longterm", "fact"];
  const grouped = createEmptyMemoryGroups();
  const query = normalizeOptionalText(input.query)?.toLowerCase();
  const requestedTier = normalizeTier(input.tier);
  const items = input.items
    .map((item) => ({ ...item, tier: resolveMemoryTier(item) }))
    .filter((item) => !requestedTier || item.tier === requestedTier)
    .filter((item) => {
      if (!query) return true;
      const haystack = `${item.content}\n${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  for (const item of items) grouped[item.tier].push(item);
  for (const tier of tiers) grouped[tier].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    items,
    candidates: input.candidates,
    grouped,
    groupedByTier: grouped
  };
}

export async function GET(request: Request, context?: RouteContext) {
  return handle("GET", request, context);
}

export async function POST(request: Request, context?: RouteContext) {
  return handle("POST", request, context);
}

export async function PATCH(request: Request, context?: RouteContext) {
  return handle("PATCH", request, context);
}

export async function PUT(request: Request, context?: RouteContext) {
  return handle("PUT", request, context);
}

export async function DELETE(request: Request, context?: RouteContext) {
  return handle("DELETE", request, context);
}

async function handle(method: string, request: Request, context?: RouteContext): Promise<Response> {
  try {
    const runtime = getRuntime();
    const segments = await routeSegments(request, context);

    if (segments[0] === "chat" && method === "POST") return handleChat(runtime, request);

    if (segments[0] === "conversations") return handleConversations(runtime, method, request, segments);
    if (segments[0] === "cards") return handleCards(runtime, method, request, segments);
    if (segments[0] === "tasks") return handleTasks(runtime, method, request, segments);
    if (segments[0] === "plans") return handlePlans(runtime, method, request, segments);
    if (segments[0] === "tokens" && segments[1] === "count" && method === "POST") return handleTokenCount(runtime, request);
    if (segments[0] === "settings") return handleSettings(runtime, method, request, segments);
    if (segments[0] === "files" && segments[1] === "upload" && method === "POST") return handleFileUpload(runtime, request);
    if (segments[0] === "memory") return handleMemory(runtime, method, request, segments);
    if (segments[0] === "canvases") return handleCanvases(runtime, method, request, segments);
    if (segments[0] === "artifacts") return handleArtifacts(runtime, method, request, segments);
    if (segments[0] === "canvas-projects") return handleCanvasProjects(runtime, method, request, segments);
    if (segments[0] === "code" && segments[1] === "execute" && method === "POST") return handleCodeExecute(request);

    return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
  } catch (error) {
    return apiError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error), 500);
  }
}

async function handleChat(runtime: ReturnType<typeof getRuntime>, request: Request): Promise<Response> {
  const body = await readJson(request);
  const conversationId = requiredConversationIdFromRequestOrBody(request, body);
  if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
  const conversation = await runtime.conversationStore.get(conversationId);
  if (!conversation) return apiError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("CHAT_REQUEST_INVALID", "Invalid chat request", 400);
  const chatRequest = { ...parsed.data, conversationId } satisfies ChatRequest;
  const chatEngine = await getReadyChatEngine(runtime);
  await persistConversationDelta(runtime, conversationId, collectNewConversationMessages(conversation, chatRequest.messages));
  if (chatRequest.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let finalAssistant: ChatMessage | undefined;
        try {
          for await (const event of chatEngine.stream(chatRequest)) {
            if (event.type === "message.done") {
              finalAssistant = {
                id: event.messageId,
                role: "assistant",
                content: event.content,
                reasoning_content: null,
                createdAt: new Date().toISOString()
              };
            }
            controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`));
          }
        } catch (error) {
          const event: ChatStreamEvent = {
            type: "error",
            code: "CHAT_STREAM_ERROR",
            message: error instanceof Error ? error.message : String(error)
          };
          controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`));
        } finally {
          await persistConversationDelta(runtime, conversationId, finalAssistant ? [finalAssistant] : []);
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      }
    });
  }
  const result = await chatEngine.respond(chatRequest);
  await persistConversationDelta(runtime, conversationId, [result.message]);
  return apiOk(result);
}

function collectNewConversationMessages(
  conversation: { messages?: ChatMessage[] | null } | undefined,
  messages: ChatMessage[]
): ChatMessage[] {
  const existingIds = new Set((conversation?.messages ?? []).map((message) => message.id));
  return messages.filter((message) => message.role !== "system" && !existingIds.has(message.id));
}

async function persistConversationDelta(
  runtime: ReturnType<typeof getRuntime>,
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  if (!messages.length) return;
  await runtime.conversationStore.appendMessages(conversationId, messages);
}

async function handleConversations(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    return apiOk({ conversations: await runtime.conversationStore.list() });
  }
  if (segments.length === 1 && method === "POST") {
    const parsed = CreateConversationRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CONVERSATION_REQUEST_INVALID", "Invalid conversation request", 400);
    return apiOk({ conversation: await runtime.conversationStore.create(parsed.data) }, { status: 201 });
  }
  if (segments.length === 2 && method === "DELETE") {
    await runtime.conversationStore.delete(segments[1]!);
    return apiOk({});
  }
  if (segments.length === 3 && segments[2] === "messages" && method === "POST") {
    const parsed = AppendMessagesRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CONVERSATION_REQUEST_INVALID", "Invalid append messages request", 400);
    return apiOk({ conversation: await runtime.conversationStore.appendMessages(segments[1]!, parsed.data.messages) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCards(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const url = new URL(request.url);
    const archivedValue = url.searchParams.get("archived");
    const search = normalizeOptionalText(url.searchParams.get("search"));
    const type = normalizeOptionalText(url.searchParams.get("type")) as "chat" | "plan" | "canvas" | undefined;
    const archived = archivedValue === null ? undefined : archivedValue === "true";
    return apiOk({
      cards: runtime.cardStore.list({
        ...(type ? { type } : {}),
        ...(search ? { search } : {}),
        ...(archivedValue === null ? {} : { archived }),
        conversationId
      })
    });
  }
  if (segments.length === 2 && method === "PATCH") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const archived = Boolean((body as { archived?: unknown } | undefined)?.archived);
    const card = archived ? runtime.cardStore.archive(segments[1]!) : runtime.cardStore.unarchive(segments[1]!);
    return apiOk({ card });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleTasks(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    return apiOk({ tasks: await runtime.taskStore.list({ conversationId }) });
  }
  if (segments.length === 1 && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const parsed = CreateTaskRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("TASK_REQUEST_INVALID", "Invalid task request", 400);
    const task = await runtime.taskStore.create({ ...parsed.data, conversationId });
    after(() => void runtime.taskProcessor.process(task.id));
    return apiOk({ task }, { status: 202 });
  }
  if (segments.length === 3 && segments[2] === "events" && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    return apiOk({ events: await runtime.taskStore.listEvents(segments[1]!, { conversationId }) });
  }
  if (segments.length === 3 && segments[2] === "cancel" && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    return apiOk({ task: await runtime.taskStore.cancel(segments[1]!, { conversationId }) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handlePlans(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    return apiOk({ plans: runtime.planStore.list(conversationId) });
  }
  if (segments.length === 2 && segments[1] === "generate" && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const parsed = GeneratePlanRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("PLAN_REQUEST_INVALID", "Invalid generate plan request", 400);
    const generated = await runtime.planService.generatePlan(parsed.data.prompt);
    const plan = runtime.planStore.create({
      conversationId,
      workflowType: "iteration",
      phase: "focus",
      primaryGoal: generated.title,
      content: generated.content,
      status: "draft"
    });
    const conversation = await runtime.conversationStore.appendMessages(conversationId, [
      message("user", parsed.data.prompt),
      message("assistant", `Plan created: ${generated.title}`)
    ]);
    return apiOk({ plan, conversation }, { status: 201 });
  }
  if (segments.length === 2 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const plan = runtime.planStore.get(segments[1]!, conversationId);
    if (!plan) return apiError("PLAN_NOT_FOUND", "Plan not found", 404);
    return apiOk({ plan, steps: runtime.planStore.listSteps(segments[1]!) });
  }
  if (segments.length === 2 && method === "PATCH") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const parsed = UpdatePlanRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("PLAN_REQUEST_INVALID", "Invalid update plan request", 400);
    const plan = runtime.planStore.update(segments[1]!, pruneUndefined(stripConversationScope(parsed.data)) as never, conversationId);
    return apiOk({ plan, steps: runtime.planStore.listSteps(segments[1]!) });
  }
  if (segments.length === 3 && segments[2] === "execute" && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const parsed = ExecutePlanRequestSchema.safeParse(stripConversationScope(body));
    if (!parsed.success) return apiError("PLAN_REQUEST_INVALID", "Invalid execute plan request", 400);
    const plan = runtime.planStore.get(segments[1]!, conversationId);
    if (!plan) return apiError("PLAN_NOT_FOUND", "Plan not found", 404);
    const task = await runtime.taskStore.create({
      conversationId,
      type: "plan.execute",
      title: plan.primaryGoal,
      input: {
        planId: plan.id,
        plan: parsed.data.content ?? plan.content,
        currency: parsed.data.currency
      }
    });
    await runtime.conversationStore.appendMessages(conversationId, [
      message("assistant", `Plan execution queued: ${plan.primaryGoal}`)
    ]);
    after(() => void runtime.taskProcessor.process(task.id));
    return apiOk({ task }, { status: 202 });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleTokenCount(runtime: ReturnType<typeof getRuntime>, request: Request) {
  const parsed = TokenCountRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("TOKEN_REQUEST_INVALID", "Invalid token count request", 400);
  return apiOk({ usage: await runtime.tokenCounter.countComposer(parsed.data) });
}

async function handleSettings(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  const url = new URL(request.url);
  const sessionId = normalizeOptionalText(url.searchParams.get("sessionId")) ?? "settings";
  const currency = (normalizeOptionalText(url.searchParams.get("currency")) as "CNY" | "USD" | undefined) ?? "CNY";

  if (segments.length === 1 && method === "GET") {
    return apiOk({ settings: await buildSettingsPayload(runtime, sessionId, currency) });
  }
  if (segments.length === 2 && segments[1] === "api-key" && method === "POST") {
    const parsed = SaveApiKeyRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("SETTINGS_REQUEST_INVALID", "Invalid API key request", 400);
    await saveDeepSeekApiKey(parsed.data.apiKey);
    const nextRuntime = resetRuntime();
    return apiOk({ settings: await buildSettingsPayload(nextRuntime, sessionId, currency) });
  }
  if (segments.length === 2 && segments[1] === "budget" && method === "POST") {
    const parsed = SaveBudgetRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("SETTINGS_REQUEST_INVALID", "Invalid budget request", 400);
    await saveDeepSeekBudgetLimit(parsed.data.currency, parsed.data.limit);
    const nextRuntime = resetRuntime();
    return apiOk({ settings: await buildSettingsPayload(nextRuntime, sessionId, parsed.data.currency) });
  }
  if (segments.length === 2 && segments[1] === "integrations" && method === "POST") {
    const parsed = SaveIntegrationsRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("SETTINGS_REQUEST_INVALID", "Invalid integrations request", 400);
    await saveWorkbenchIntegrations(parsed.data);
    const nextRuntime = resetRuntime();
    return apiOk({ settings: await buildSettingsPayload(nextRuntime, sessionId, currency) });
  }
  if (segments.length === 2 && segments[1] === "avatar" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !isImageMime(file.type)) {
      return apiError("AVATAR_INVALID", "Avatar file must be an image", 400);
    }
    const extension = normalizeAvatarExtension(file.name, file.type);
    if (!extension) return apiError("AVATAR_INVALID", "Avatar file must be an image", 400);
    const id = `${randomUUID()}.${extension}`;
    const root = avatarRoot();
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), Buffer.from(await file.arrayBuffer()));
    return apiOk({ avatar: { kind: "url", value: `/api/settings/avatar/${id}` } });
  }
  if (segments.length === 3 && segments[1] === "avatar" && method === "GET") {
    const id = segments[2]!;
    if (!safeAvatarId(id)) return apiError("AVATAR_ID_INVALID", "Invalid avatar id", 400);
    const bytes = await readFile(join(avatarRoot(), id));
    return new Response(bytes, { headers: { "content-type": mimeFromPath(id) } });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleFileUpload(runtime: ReturnType<typeof getRuntime>, request: Request) {
  const form = await request.formData();
  const conversationId = requiredConversationIdFromRequestOrBody(request, form);
  if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return apiError("FILE_UPLOAD_INVALID", "Missing file", 400);
  await runtime.fileStore.cleanup({ conversationId, reserveSlots: 1 });
  const uploaded = await runtime.fileStore.upload({
    conversationId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer())
  });
  return apiOk(uploaded);
}

async function handleMemory(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const url = new URL(request.url);
    const data = buildMemoryResponseData({
      items: await runtime.memoryStore.list({ conversationId }),
      candidates: await runtime.memoryStore.listCandidates({ conversationId }),
      tier: url.searchParams.get("tier"),
      query: url.searchParams.get("q") ?? url.searchParams.get("search")
    });
    return apiOk(data);
  }
  if (segments.length === 2 && segments[1] === "confirm" && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    const candidateId = normalizeOptionalText((body as { candidateId?: unknown } | undefined)?.candidateId);
    if (!conversationId || !candidateId) return apiError("MEMORY_REQUEST_INVALID", "conversationId and candidateId are required", 400);
    return apiOk({ item: await runtime.memoryStore.confirm(candidateId, { conversationId }) });
  }
  if (segments.length === 2 && method === "DELETE") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    await runtime.memoryStore.delete(segments[1]!, { conversationId });
    return apiOk({});
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvases(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const canvases = await runtime.canvasService.list(conversationId);
    const artifacts = await runtime.artifactManager.list({ conversationId });
    const legacy = legacyArtifactsForConversationSafe(artifacts).map((artifact) => legacyArtifactToCanvas(artifact));
    return apiOk({ canvases: [...canvases, ...legacy] });
  }
  if (segments.length === 1 && method === "POST") {
    const body = await readJson(request);
    const conversationId = requiredConversationIdFromRequestOrBody(request, body);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const missing = await ensureConversation(runtime, conversationId);
    if (missing) return missing;
    const parsed = CreateCanvasRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("CANVAS_REQUEST_INVALID", "Invalid canvas request", 400);
    return apiOk({ canvas: await runtime.canvasService.create({ ...parsed.data, conversationId }) }, { status: 201 });
  }
  if (segments.length >= 2) {
    const id = segments[1]!;
    const conversationId = requiredConversationId(request) ?? requiredConversationIdFromRequestOrBody(request, await readJsonIfNeeded(request, method));
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    if (segments.length === 2 && method === "GET") return handleCanvasGet(runtime, id, conversationId);
    if (segments.length === 2 && method === "PATCH") return handleCanvasPatch(runtime, request, id, conversationId);
    if (segments.length === 2 && method === "DELETE") {
      await runtime.canvasStore.delete(id, conversationId);
      return apiOk({});
    }
    if (segments[2] === "ai-edit" && method === "POST") {
      const parsed = CanvasAiEditRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return apiError("CANVAS_REQUEST_INVALID", "Invalid canvas edit request", 400);
      return apiOk({ canvas: await runtime.canvasService.applyAction(id, parsed.data, conversationId) });
    }
    if (segments[2] === "revisions" && method === "GET") {
      return apiOk({ revisions: await runtime.canvasRevisionStore.list(id, conversationId) });
    }
    if (segments[2] === "export" && method === "GET") {
      const format = normalizeOptionalText(new URL(request.url).searchParams.get("format")) ?? "markdown";
      return apiOk({ content: await runtime.canvasService.export(id, format as never, conversationId) });
    }
    if (segments[2] === "obsidian-export" && method === "POST") {
      const canvas = await findCanvas(runtime, id, conversationId);
      if (!canvas) return apiError("CANVAS_NOT_FOUND", "Canvas not found", 404);
      const result = await runtime.obsidianBridge?.exportMarkdown({
        title: canvas.title,
        content: canvas.contentText
      });
      if (!result) return apiError("OBSIDIAN_EXPORT_UNAVAILABLE", "Obsidian export is unavailable", 503);
      return apiOk({ relativePath: result.relativePath });
    }
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasGet(runtime: ReturnType<typeof getRuntime>, id: string, conversationId: string) {
  const canvas = await findCanvas(runtime, id, conversationId);
  if (!canvas) return apiError("CANVAS_NOT_FOUND", "Canvas not found", 404);
  return apiOk({ canvas });
}

async function handleCanvasPatch(runtime: ReturnType<typeof getRuntime>, request: Request, id: string, conversationId: string) {
  const body = await readJson(request);
  const legacyArtifactId = legacyArtifactIdFromCanvasId(id);
  if (legacyArtifactId) {
    const parsed = UpdateArtifactRequestSchema.safeParse(stripConversationScope(body));
    if (!parsed.success) return apiError("CANVAS_REQUEST_INVALID", "Invalid canvas update request", 400);
    const artifact = await runtime.artifactManager.update(legacyArtifactId, parsed.data, { conversationId });
    return apiOk({ canvas: legacyArtifactToCanvas(artifact) });
  }
  if ((body as { action?: unknown } | undefined)?.action === "restore") {
    return apiOk({ canvas: await runtime.canvasService.restorePrevious(id, conversationId) });
  }
  const parsed = UpdateCanvasRequestSchema.safeParse(stripConversationScope(body));
  if (!parsed.success) return apiError("CANVAS_REQUEST_INVALID", "Invalid canvas update request", 400);
  return apiOk({ canvas: await runtime.canvasService.update(id, parsed.data, conversationId) });
}

async function handleArtifacts(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "POST") {
    const body = await readJson(request);
    const conversationId = normalizeOptionalText(readObjectString(readObject(body, "metadata"), "conversationId"));
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "metadata.conversationId is required", 400);
    const parsed = CreateArtifactRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("ARTIFACT_REQUEST_INVALID", "Invalid artifact request", 400);
    return apiOk({ artifact: await runtime.artifactManager.create(parsed.data) }, { status: 201 });
  }
  if (segments.length === 2 && method === "GET") {
    const conversationId = requiredConversationId(request);
    const artifact = await runtime.artifactManager.get(segments[1]!, conversationId ? { conversationId } : {});
    if (!artifact) return apiError("ARTIFACT_NOT_FOUND", "Artifact not found", 404);
    return apiOk({ artifact });
  }
  if (segments.length === 2 && method === "PATCH") {
    const parsed = UpdateArtifactRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("ARTIFACT_REQUEST_INVALID", "Invalid artifact request", 400);
    const conversationId = requiredConversationId(request);
    return apiOk({ artifact: await runtime.artifactManager.update(segments[1]!, parsed.data, conversationId ? { conversationId } : {}) });
  }
  if (segments.length === 2 && method === "DELETE") {
    const conversationId = requiredConversationId(request);
    await runtime.artifactManager.delete(segments[1]!, conversationId ? { conversationId } : {});
    return apiOk({});
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjects(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, segments: string[]) {
  if (segments.length === 1 && method === "GET") {
    const conversationId = requiredConversationId(request);
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    return apiOk({ projects: runtime.canvasStudioStore.listProjects(conversationId) });
  }
  if (segments.length === 1 && method === "POST") {
    const body = await readJson(request);
    const parsed = CreateCanvasProjectRequestSchema.safeParse(body);
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid canvas project request", 400);
    const bundle = runtime.canvasStudioStore.createProjectBundle(parsed.data);
    return apiOk(bundle, { status: 201 });
  }
  if (segments.length >= 2) {
    const projectId = segments[1]!;
    const conversationId = requiredConversationId(request) ?? requiredConversationIdFromRequestOrBody(request, await readJsonIfNeeded(request, method));
    if (!conversationId) return apiError("CONVERSATION_ID_REQUIRED", "conversationId is required", 400);
    const project = runtime.canvasStudioStore.getProject(projectId);
    if (!projectMatchesConversation(project, conversationId)) return apiError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);

    if (segments.length === 2 && method === "GET") {
      const bundle = canvasProjectBundle(runtime, projectId, project!);
      return apiOk({ ...bundle, bundle });
    }
    if (segments[2] === "files") return handleCanvasProjectFiles(runtime, method, request, projectId);
    if (segments[2] === "nodes") return handleCanvasProjectNodes(runtime, method, request, projectId);
    if (segments[2] === "versions") return handleCanvasProjectVersions(runtime, method, request, projectId);
    if (segments[2] === "reviews") return handleCanvasProjectReviews(runtime, method, request, projectId);
    if (segments[2] === "jobs") return handleCanvasProjectJobs(runtime, method, request, projectId, project!);
    if (segments[2] === "outputs") return handleCanvasProjectOutputs(runtime, method, request, projectId);
    if (segments[2] === "assets") return handleCanvasProjectAssets(runtime, method, request, projectId, conversationId);
    if (segments[2] === "methodology") return handleCanvasProjectMethodology(runtime, method, request, projectId, conversationId);
    if (segments[2] === "deck" && method === "GET") {
      return handleCanvasProjectDeck(runtime, request, projectId, segments.slice(3));
    }
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectFiles(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, projectId: string) {
  if (method === "GET") return apiOk({ files: runtime.canvasStudioStore.listFiles(projectId) });
  if (method === "POST") {
    const parsed = UpsertCanvasProjectFileRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid file request", 400);
    return apiOk({ file: runtime.canvasStudioStore.upsertFile({ projectId, ...pruneUndefined(parsed.data) } as never) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectNodes(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, projectId: string) {
  if (method === "GET") return apiOk({ nodes: runtime.canvasStudioStore.listNodes(projectId) });
  if (method === "POST") {
    const parsed = UpsertCanvasNodeRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid node request", 400);
    return apiOk({ node: runtime.canvasStudioStore.upsertNode({ projectId, ...pruneUndefined(parsed.data) } as never) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectVersions(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, projectId: string) {
  if (method === "GET") return apiOk({ versions: runtime.canvasStudioStore.listVersions(projectId) });
  if (method === "POST") {
    const parsed = CreateCanvasProjectVersionRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid version request", 400);
    return apiOk({ version: runtime.canvasStudioStore.createVersion({ projectId, ...pruneUndefined(parsed.data) } as never) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectReviews(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, projectId: string) {
  if (method === "GET") return apiOk({ reviews: runtime.canvasStudioStore.listReviewReports(projectId) });
  if (method === "POST") {
    const parsed = CreateCanvasReviewReportRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid review request", 400);
    return apiOk({ review: runtime.canvasStudioStore.createReviewReport({ projectId, ...pruneUndefined(parsed.data) } as never) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectJobs(
  runtime: ReturnType<typeof getRuntime>,
  method: string,
  request: Request,
  projectId: string,
  project: { engine?: string }
) {
  if (method === "GET") {
    const renderJobs = runtime.canvasStudioStore.listRenderJobs(projectId);
    const exportJobs = runtime.canvasStudioStore.listExportJobs(projectId);
    return apiOk({ renderJobs, exportJobs, jobs: [...renderJobs, ...exportJobs] });
  }
  if (method === "POST") {
    const parsed = CreateCanvasStudioJobRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid job request", 400);
    if (parsed.data.type === "render") {
      const job = runtime.canvasStudioStore.createRenderJob({
        projectId,
        ...withDefined("versionId", parsed.data.versionId),
        ...withDefined("engine", parsed.data.engine ?? (project.engine as never)),
        ...withDefined("inputJson", parsed.data.inputJson)
      });
      return apiOk({ type: "render", job }, { status: 202 });
    }
    const job = runtime.canvasStudioStore.createExportJob({
      projectId,
      ...withDefined("versionId", parsed.data.versionId),
      format: parsed.data.format,
      ...withDefined("optionsJson", parsed.data.optionsJson)
    });
    return apiOk({ type: "export", job }, { status: 202 });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectOutputs(runtime: ReturnType<typeof getRuntime>, method: string, request: Request, projectId: string) {
  if (method === "GET") return apiOk({ outputs: runtime.canvasStudioStore.listOutputs(projectId) });
  if (method === "POST") {
    const parsed = CreateCanvasOutputRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid output request", 400);
    return apiOk({ output: runtime.canvasStudioStore.recordOutput({ projectId, ...pruneUndefined(parsed.data) } as never) });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectAssets(
  runtime: ReturnType<typeof getRuntime>,
  method: string,
  request: Request,
  projectId: string,
  conversationId: string
) {
  if (method === "GET") return apiOk({ assets: runtime.canvasStudioStore.listAssets(projectId) });
  if (method === "POST") {
    const parsed = UploadCanvasAssetRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_ASSET_REQUEST_INVALID", "Invalid asset request", 400);
    let bytes: Buffer;
    try {
      bytes = decodeBase64Strict(parsed.data.dataBase64);
    } catch {
      return apiError("CANVAS_PROJECT_ASSET_REQUEST_INVALID", "Invalid asset request", 400);
    }
    const blob = await runtime.canvasAssetStore.write(bytes, {
      mime: parsed.data.mime,
      ...withDefined("extension", parsed.data.extension),
      conversationId
    });
    await runtime.canvasAssetRegistry.recordBlob(
      {
        hash: blob.hash,
        mime: blob.mime,
        bytes: blob.bytes,
        storageUri: blob.storageUri,
        ...withDefined("metadata", parsed.data.metadata)
      },
      { conversationId, projectId }
    );
    const asset = runtime.canvasStudioStore.linkAsset({
      projectId,
      assetHash: blob.hash,
      ...withDefined("role", parsed.data.role),
      name: parsed.data.name,
      metadata: {
        ...(parsed.data.metadata ?? {}),
        mime: blob.mime,
        bytes: blob.bytes,
        storageUri: blob.storageUri
      }
    });
    return apiOk({ asset });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectMethodology(
  runtime: ReturnType<typeof getRuntime>,
  method: string,
  request: Request,
  projectId: string,
  conversationId: string
) {
  if (method === "PUT") {
    const parsed = UpsertMethodologyStateRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid methodology state request", 400);
    return apiOk({
      methodologyState: runtime.canvasStudioStore.upsertMethodologyState({
        conversationId,
        projectId,
        ...pruneUndefined(parsed.data)
      } as never)
    });
  }
  if (method === "POST") {
    const parsed = CreateMethodologyItemRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("CANVAS_PROJECT_REQUEST_INVALID", "Invalid methodology item request", 400);
    const item = createMethodologyItem(runtime, conversationId, projectId, parsed.data);
    return apiOk({ item });
  }
  return apiError("ROUTE_NOT_FOUND", "Route not found", 404);
}

async function handleCanvasProjectDeck(
  runtime: ReturnType<typeof getRuntime>,
  request: Request,
  projectId: string,
  pathSegments: string[]
) {
  const safePath = normalizeDeckPath(pathSegments);
  if (!safePath) return apiError("DECK_PATH_INVALID", "Invalid deck path", 400);
  const file = runtime.canvasStudioStore.listFiles(projectId).find((entry: { path: string }) => entry.path === safePath);
  if (!file) return apiError("DECK_FILE_NOT_FOUND", "Deck file not found", 404);
  const contentType = mimeFromPath(file.path);
  const textContent = typeof file.textContent === "string" ? file.textContent : "";
  const body = safePath === "index.html" ? normalizeDeckHtml(textContent) : textContent;
  return new Response(body, { headers: { "content-type": contentType } });
}

async function handleCodeExecute(request: Request) {
  const body = await readJson(request);
  const result = await runLocalRestricted(body as { language: "javascript" | "typescript"; code: string }, getEnv());
  return apiOk(result);
}

function canvasProjectBundle(runtime: ReturnType<typeof getRuntime>, projectId: string, project: unknown) {
  return {
    project,
    nodes: runtime.canvasStudioStore.listNodes(projectId),
    files: runtime.canvasStudioStore.listFiles(projectId),
    versions: runtime.canvasStudioStore.listVersions(projectId),
    assets: runtime.canvasStudioStore.listAssets(projectId),
    renderJobs: runtime.canvasStudioStore.listRenderJobs(projectId),
    exportJobs: runtime.canvasStudioStore.listExportJobs(projectId),
    outputs: runtime.canvasStudioStore.listOutputs(projectId),
    reviews: runtime.canvasStudioStore.listReviewReports(projectId),
    methodologyState: runtime.canvasStudioStore.getMethodologyState({ projectId })
  };
}

function createMethodologyItem(
  runtime: ReturnType<typeof getRuntime>,
  conversationId: string,
  projectId: string,
  input: ReturnType<typeof CreateMethodologyItemRequestSchema.parse>
) {
  if (input.type === "evidence") {
    return runtime.methodologyRepository.addEvidence({
      conversationId,
      projectId,
      sourceType: input.sourceType,
      claim: input.claim,
      confidence: input.confidence,
      ...withDefined("citation", input.citation),
      ...withDefined("metadata", input.metadata)
    });
  }
  if (input.type === "contradiction") {
    return runtime.methodologyRepository.addContradiction({
      conversationId,
      projectId,
      subjectA: input.subjectA,
      subjectB: input.subjectB,
      nature: input.nature,
      rank: input.rank,
      dominantSide: input.dominantSide,
      risk: input.risk ?? ""
    });
  }
  if (input.type === "focus_lock") {
    return runtime.methodologyRepository.upsertFocusLock({
      conversationId,
      projectId,
      target: input.target,
      doneSignal: input.doneSignal ?? "",
      pausedItems: input.pausedItems ?? []
    });
  }
  if (input.type === "validation_cycle") {
    return runtime.methodologyRepository.addValidationCycle({
      conversationId,
      projectId,
      hypothesis: input.hypothesis,
      action: input.action,
      expected: input.expected ?? "",
      actual: input.actual ?? "",
      learning: input.learning ?? ""
    });
  }
  return runtime.methodologyRepository.addFeedbackSynthesis({ conversationId, projectId, ...input });
}

async function findCanvas(runtime: ReturnType<typeof getRuntime>, id: string, conversationId: string) {
  const canvas = await runtime.canvasService.get(id, conversationId);
  if (canvas) return canvas;
  const legacyArtifactId = legacyArtifactIdFromCanvasId(id);
  if (!legacyArtifactId) return undefined;
  const artifact = await runtime.artifactManager.get(legacyArtifactId, { conversationId });
  return artifact ? legacyArtifactToCanvas(artifact) : undefined;
}

async function ensureConversation(runtime: ReturnType<typeof getRuntime>, conversationId: string): Promise<Response | undefined> {
  const conversation = await runtime.conversationStore.get(conversationId);
  if (!conversation) return apiError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);
  return undefined;
}

function resolveMemoryTier(item: MemoryItem): MemoryTier {
  const tag = item.tags.find((entry) => entry.startsWith("tier:"));
  const tier = normalizeTier(tag?.slice(5));
  return tier ?? "fact";
}

function normalizeTier(value: string | null | undefined): MemoryTier | undefined {
  if (value === "daily" || value === "weekly" || value === "longterm" || value === "fact") return value;
  return undefined;
}

function createEmptyMemoryGroups(): Record<MemoryTier, GroupedMemoryItem[]> {
  return {
    daily: [],
    weekly: [],
    longterm: [],
    fact: []
  };
}

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

async function routeSegments(request: Request, context?: RouteContext): Promise<string[]> {
  const params = await context?.params;
  const segments = new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const id = typeof params?.id === "string" ? params.id : undefined;
  const path = Array.isArray(params?.path) ? params.path.map((segment) => decodeURIComponent(segment)) : undefined;
  if (!id && !path) return segments;
  if (segments[0] === "settings" && id) return ["settings", "avatar", id];
  if (segments[0] === "memory" && id) return ["memory", id];
  if (segments[0] === "artifacts" && id) return ["artifacts", id];
  if (segments[0] === "canvases" && id) return ["canvases", id, ...segments.slice(2)];
  if (segments[0] === "plans" && id) return ["plans", id, ...segments.slice(2)];
  if (segments[0] === "canvas-projects" && id && path) {
    return ["canvas-projects", id, "deck", ...(path ?? segments.slice(3))];
  }
  if (segments[0] === "canvas-projects" && id) {
    return ["canvas-projects", id, ...segments.slice(2)];
  }
  return segments;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

async function readJsonIfNeeded(request: Request, method: string): Promise<unknown> {
  if (method === "GET" || method === "DELETE") return undefined;
  return readJson(request);
}

function readObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : undefined;
}

function readObjectString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" ? nested : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function avatarRoot(): string {
  return join(process.env.WORKBENCH_DATA_DIR?.trim() || process.cwd(), "avatars");
}

function safeAvatarId(id: string): boolean {
  return /^[a-f0-9-]+\.(png|jpg|jpeg|gif|webp)$/i.test(id);
}

function normalizeAvatarExtension(name: string, mime: string): string | undefined {
  const fromName = extname(name).replace(/^\./, "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(fromName)) return fromName;
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return undefined;
}

function isImageMime(mime: string): boolean {
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime);
}

function mimeFromPath(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  return "text/plain; charset=utf-8";
}

function normalizeDeckPath(segments: string[]): string | undefined {
  if (!segments.length) return "index.html";
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\") || segment.includes(":"))) {
    return undefined;
  }
  return segments.join("/");
}

function normalizeDeckHtml(html: string): string {
  const shell = "<style data-pinocchio-deck-shell>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:transparent}.deck{width:100%;height:100%;overflow:hidden}</style>";
  if (html.includes("data-pinocchio-deck-shell")) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${shell}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${shell}</head>`);
  }
  return `<!doctype html><html><head>${shell}</head><body data-pinocchio-deck-shell>${html}</body></html>`;
}

function decodeBase64Strict(value: string): Buffer {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Invalid base64");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.toString("base64").replace(/=+$/u, "") !== normalized.replace(/=+$/u, "")) {
    throw new Error("Invalid base64");
  }
  return bytes;
}

function legacyArtifactsForConversationSafe<T extends { metadata?: Record<string, unknown> | undefined }>(artifacts: T[]): T[] {
  return artifacts.filter((artifact) => typeof artifact.metadata?.conversationId === "string");
}

function withDefined<TKey extends string, TValue>(key: TKey, value: TValue | undefined): Partial<Record<TKey, TValue>> {
  return value === undefined ? {} : { [key]: value } as Partial<Record<TKey, TValue>>;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return Object.fromEntries(entries) as T;
}
