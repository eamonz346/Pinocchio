import type { ToolCallState } from "@pinocchio/shared";
import type { WorkbenchTranslator } from "./workbenchI18n";

export function streamingStatusLabel(toolCalls: ToolCallState[], assistantDraftVisible: boolean, t: WorkbenchTranslator) {
  const active = toolCalls.find((tool) => tool.status === "running") ?? toolCalls.at(-1);
  if (!active) return t("message.streaming");
  if (active.status !== "running" && assistantDraftVisible) return t("message.streaming");
  const name = active?.toolName ?? "";
  if (/web_(search|fetch)|official_news/i.test(name)) return t("message.searching");
  if (/file|long_text/i.test(name)) return t("message.reading");
  if (/code|coding|execute|verification/i.test(name)) return t("message.runningCode");
  if (/artifact|canvas/i.test(name)) return t("message.preparingCanvas");
  return t("message.usingTool");
}
