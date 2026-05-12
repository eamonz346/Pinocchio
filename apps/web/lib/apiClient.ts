import type {
  AiTask,
  AiTaskEvent,
  Card,
  CodeExecutionRequest,
  ChatMessage,
  Conversation,
  CreateTaskRequest,
  Plan,
  PricingCurrency,
  TokenUsage,
  UploadedFile,
  AppSettings
} from "@pinocchio/shared";

export async function uploadFile(file: File, conversationId?: string): Promise<UploadedFile> {
  const scope = requireConversationId(conversationId);
  const form = new FormData();
  form.append("file", file);
  form.append("conversationId", scope);
  const response = await fetch(scopedPath("/api/files/upload", scope), { method: "POST", body: form });
  return unwrap(response);
}

export async function listConversations(): Promise<Conversation[]> {
  const data = await unwrap(fetch("/api/conversations"));
  return data.conversations;
}

export async function createConversation(title: string): Promise<Conversation> {
  const data = await unwrap(fetch("/api/conversations", json("POST", { title })));
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await unwrap(fetch(`/api/conversations/${id}`, { method: "DELETE" }));
}

export async function appendConversationMessages(conversationId: string, messages: ChatMessage[]): Promise<Conversation> {
  const data = await unwrap(fetch(`/api/conversations/${conversationId}/messages`, json("POST", { messages })));
  return data.conversation;
}

export async function listCards(filter: { type?: "chat" | "plan" | "canvas"; archived?: boolean; search?: string; conversationId?: string } = {}): Promise<Card[]> {
  const scope = requireConversationId(filter.conversationId);
  const url = new URL("/api/cards", window.location.origin);
  if (filter.type) url.searchParams.set("type", filter.type);
  if (typeof filter.archived === "boolean") url.searchParams.set("archived", String(filter.archived));
  if (filter.search?.trim()) url.searchParams.set("search", filter.search.trim());
  url.searchParams.set("conversationId", scope);
  const data = await unwrap(fetch(url));
  return data.cards;
}

export async function setCardArchived(id: string, archived: boolean, conversationId?: string): Promise<Card> {
  const scope = requireConversationId(conversationId);
  const data = await unwrap(fetch(scopedPath(`/api/cards/${id}`, scope), json("PATCH", withConversationId({ archived }, scope))));
  return data.card;
}

export async function listTasks(conversationId?: string): Promise<AiTask[]> {
  const scope = requireConversationId(conversationId);
  const suffix = `?conversationId=${encodeURIComponent(scope)}`;
  const data = await unwrap(fetch(`/api/tasks${suffix}`));
  return data.tasks;
}

export async function createTask(input: CreateTaskRequest): Promise<AiTask> {
  const data = await unwrap(fetch("/api/tasks", json("POST", input)));
  return data.task;
}

export async function getTaskEvents(taskId: string, conversationId?: string): Promise<AiTaskEvent[]> {
  const data = await unwrap(fetch(scopedPath(`/api/tasks/${taskId}/events`, requireConversationId(conversationId))));
  return data.events;
}

export async function cancelTask(taskId: string, conversationId?: string): Promise<AiTask | undefined> {
  const scope = requireConversationId(conversationId);
  const data = await unwrap(fetch(scopedPath(`/api/tasks/${taskId}/cancel`, scope), json("POST", withConversationId({}, scope))));
  return data.task;
}

export interface GeneratePlanResult {
  plan: Plan;
  conversation?: Conversation;
}

export async function generatePlan(prompt: string, conversationId?: string): Promise<GeneratePlanResult> {
  const data = await unwrap(fetch("/api/plans/generate", json("POST", { prompt, conversationId: requireConversationId(conversationId) })));
  return { plan: data.plan, conversation: data.conversation };
}

export async function listPlans(conversationId?: string): Promise<Plan[]> {
  const scope = requireConversationId(conversationId);
  const suffix = `?conversationId=${encodeURIComponent(scope)}`;
  const data = await unwrap(fetch(`/api/plans${suffix}`));
  return data.plans;
}

export async function updatePlan(planId: string, input: { content?: string; primaryGoal?: string }, conversationId?: string): Promise<Plan> {
  const scope = requireConversationId(conversationId);
  const data = await unwrap(fetch(scopedPath(`/api/plans/${planId}`, scope), json("PATCH", withConversationId(input, scope))));
  return data.plan;
}

export async function executePlan(planId: string, content?: string, currency: PricingCurrency = "CNY", conversationId?: string): Promise<AiTask> {
  const scope = requireConversationId(conversationId);
  const data = await unwrap(fetch(scopedPath(`/api/plans/${planId}/execute`, scope), json("POST", withConversationId({ ...(content ? { content } : {}), currency }, scope))));
  return data.task;
}

export async function countTokens(input: { draft: string; messages: ChatMessage[] }): Promise<TokenUsage> {
  const data = await unwrap(fetch("/api/tokens/count", json("POST", input)));
  return data.usage;
}

export async function getSettings(sessionId?: string, currency: PricingCurrency = "CNY"): Promise<AppSettings> {
  const suffix = settingsSuffix(sessionId, currency);
  const data = await unwrap(fetch(`/api/settings${suffix}`));
  return data.settings;
}

export async function saveApiKey(apiKey: string, sessionId?: string, currency: PricingCurrency = "CNY"): Promise<AppSettings> {
  const suffix = settingsSuffix(sessionId, currency);
  const data = await unwrap(fetch(`/api/settings/api-key${suffix}`, json("POST", { apiKey })));
  return data.settings;
}

export async function saveBudget(limit: number, currency: PricingCurrency, sessionId?: string): Promise<AppSettings> {
  const suffix = settingsSuffix(sessionId, currency);
  const data = await unwrap(fetch(`/api/settings/budget${suffix}`, json("POST", { limit, currency })));
  return data.settings;
}

export async function saveIntegrations(
  input: { pluginDir?: string | null; obsidianVaultPath?: string | null; obsidianExportFolder?: string | null },
  sessionId?: string,
  currency: PricingCurrency = "CNY"
): Promise<AppSettings> {
  const suffix = settingsSuffix(sessionId, currency);
  const data = await unwrap(fetch(`/api/settings/integrations${suffix}`, json("POST", input)));
  return data.settings;
}

export async function executeCode(input: CodeExecutionRequest) {
  return unwrap(fetch("/api/code/execute", json("POST", input)));
}

export async function getMemory(conversationId: string) {
  return unwrap(fetch(scopedPath("/api/memory", conversationId)));
}

export async function confirmMemory(candidateId: string, conversationId: string) {
  return unwrap(fetch("/api/memory/confirm", json("POST", { candidateId, conversationId })));
}

export async function deleteMemory(id: string, conversationId: string) {
  return unwrap(fetch(scopedPath(`/api/memory/${id}`, conversationId), { method: "DELETE" }));
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function settingsSuffix(sessionId: string | undefined, currency: PricingCurrency): string {
  const params = new URLSearchParams({ currency });
  if (sessionId) params.set("sessionId", sessionId);
  return `?${params.toString()}`;
}

function scopedPath(path: string, conversationId?: string): string {
  if (!conversationId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}conversationId=${encodeURIComponent(conversationId)}`;
}

function requireConversationId(conversationId: string | undefined): string {
  const value = conversationId?.trim();
  if (!value) throw new Error("conversationId is required");
  return value;
}

function withConversationId<T extends object>(body: T, conversationId?: string): T & { conversationId?: string } {
  return conversationId ? { ...body, conversationId } : body;
}

async function unwrap(input: Response | Promise<Response>) {
  const response = await input;
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) throw new Error(body.error?.message ?? "Request failed");
  return body.data;
}
