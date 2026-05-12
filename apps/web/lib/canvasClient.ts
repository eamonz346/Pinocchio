import type {
  Canvas,
  CanvasAiEditRequest,
  CanvasProjectBundle,
  CanvasRevision,
  CanvasReviewReport,
  CanvasStudioJob,
  CreateCanvasRequest,
  CreateCanvasReviewReportRequest,
  CreateCanvasStudioJobRequest,
  UpdateCanvasRequest
} from "@pinocchio/shared";

export async function listCanvases(conversationId?: string): Promise<Canvas[]> {
  const suffix = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  const data = await unwrap(fetch(`/api/canvases${suffix}`));
  return data.canvases;
}

export async function createCanvas(input: CreateCanvasRequest): Promise<Canvas> {
  const data = await unwrap(fetch("/api/canvases", json("POST", input)));
  return data.canvas;
}

export async function getCanvas(id: string, conversationId?: string): Promise<Canvas> {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}`, conversationId)));
  return data.canvas;
}

export async function updateCanvas(id: string, input: UpdateCanvasRequest, conversationId?: string): Promise<Canvas> {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}`, conversationId), json("PATCH", withConversationId(input, conversationId))));
  return data.canvas;
}

export async function restoreCanvas(id: string, conversationId?: string): Promise<Canvas> {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}`, conversationId), json("PATCH", withConversationId({ action: "restore" }, conversationId))));
  return data.canvas;
}

export async function deleteCanvas(id: string, conversationId?: string): Promise<void> {
  await unwrap(fetch(scopedPath(`/api/canvases/${id}`, conversationId), { method: "DELETE" }));
}

export async function editCanvas(id: string, input: CanvasAiEditRequest, conversationId?: string): Promise<Canvas> {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}/ai-edit`, conversationId), json("POST", withConversationId(input, conversationId))));
  return data.canvas;
}

export async function listCanvasRevisions(id: string, conversationId?: string): Promise<CanvasRevision[]> {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}/revisions`, conversationId)));
  return data.revisions;
}

export async function exportCanvas(id: string, format: "json" | "markdown" | "html" | "docx" | "pptx", conversationId?: string) {
  const data = await unwrap(fetch(scopedPath(`/api/canvases/${id}/export?format=${format}`, conversationId)));
  return data.content as string;
}

export async function exportCanvasToObsidian(id: string, conversationId?: string): Promise<{ path: string; relativePath: string }> {
  return unwrap(fetch(scopedPath(`/api/canvases/${id}/obsidian-export`, conversationId), json("POST", withConversationId({}, conversationId))));
}

export async function getCanvasProjectBundle(id: string, conversationId?: string): Promise<CanvasProjectBundle> {
  const data = await unwrap(fetch(scopedPath(`/api/canvas-projects/${id}`, conversationId)));
  return data.bundle;
}

export async function createCanvasStudioJob(id: string, input: CreateCanvasStudioJobRequest, conversationId?: string): Promise<CanvasStudioJob> {
  const data = await unwrap(fetch(scopedPath(`/api/canvas-projects/${id}/jobs`, conversationId), json("POST", withConversationId(input, conversationId))));
  return data.job;
}

export async function createCanvasReviewReport(id: string, input: CreateCanvasReviewReportRequest, conversationId?: string): Promise<CanvasReviewReport> {
  const data = await unwrap(fetch(scopedPath(`/api/canvas-projects/${id}/reviews`, conversationId), json("POST", withConversationId(input, conversationId))));
  return data.review;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function canvasProjectDeckUrl(projectId: string, conversationId?: string): string {
  return scopedPath(`/api/canvas-projects/${encodeURIComponent(projectId)}/deck/index.html`, conversationId);
}

function scopedPath(path: string, conversationId?: string): string {
  if (!conversationId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}conversationId=${encodeURIComponent(conversationId)}`;
}

function withConversationId<T extends object>(body: T, conversationId?: string): T & { conversationId?: string } {
  return conversationId ? { ...body, conversationId } : body;
}

async function unwrap(input: Response | Promise<Response>) {
  const response = await input;
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) throw new Error(body.error?.message ?? "Canvas request failed");
  return body.data;
}
