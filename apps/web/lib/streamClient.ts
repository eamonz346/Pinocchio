import { ChatStreamEventSchema, type ChatRequest, type ChatStreamEvent } from "@pinocchio/shared";

export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, stream: true })
  });
  if (!response.ok) throw new Error(await responseErrorMessage(response));
  if (!response.body) throw new Error("No response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const block of events) {
      const line = block.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      onEvent(ChatStreamEventSchema.parse(JSON.parse(line.slice(5))));
    }
  }
}

async function responseErrorMessage(response: Response) {
  const fallback = `Chat request failed (${response.status})`;
  try {
    if ((response.headers.get("content-type") ?? "").includes("application/json")) {
      const body = await response.json() as { error?: { message?: unknown }; message?: unknown };
      const message = typeof body.error?.message === "string" ? body.error.message : typeof body.message === "string" ? body.message : "";
      return message.trim() || fallback;
    }
    const text = await response.text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}
