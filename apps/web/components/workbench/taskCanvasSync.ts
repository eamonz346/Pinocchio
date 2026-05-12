import type { AiTask, AiTaskEvent } from "@pinocchio/shared";

export function taskCanvasIds(task: AiTask, events: AiTaskEvent[]): string[] {
  const ids = new Set<string>();
  if (typeof task.result?.canvasId === "string") ids.add(task.result.canvasId);
  for (const event of events) {
    if (typeof event.data?.canvasId === "string") ids.add(event.data.canvasId);
  }
  return [...ids];
}
