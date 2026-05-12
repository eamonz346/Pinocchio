import type { Canvas, CanvasBlock } from "@pinocchio/shared";

export function renderCanvasMarkdown(canvas: Canvas): string {
  return [canvas.title ? `# ${canvas.title}` : "", canvas.contentText, renderMetadata(canvas.metadata)]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizeCanvas(canvas: Canvas): string {
  const base = canvas.summary?.trim() || canvas.contentText.replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || "Empty canvas";
}

export function canvasPreviewBlocks(canvas: Canvas): CanvasBlock[] {
  return canvas.contentJson.blocks.slice(0, 6);
}

function renderMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata || !Object.keys(metadata).length) return "";
  const pairs = Object.entries(metadata)
    .map(([key, value]) => `- ${key}: ${stringify(value)}`)
    .join("\n");
  return pairs ? `## Metadata\n${pairs}` : "";
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
