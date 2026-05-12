import type { Canvas } from "@pinocchio/shared";
import { exportCanvas } from "../../lib/canvasClient";

export async function downloadCanvas(canvas: Canvas, format: "json" | "markdown" | "html" | "docx" | "pptx" | "pdf" | "png", target?: HTMLElement | null) {
  if (format === "png") {
    if (!target) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(target, { backgroundColor: getCanvasBackground() });
    downloadUrl(dataUrl, `${safeName(canvas.title)}.png`);
    return;
  }
  if (format === "pdf") {
    if (!target) return;
    const { toPng } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");
    const dataUrl = await toPng(target, { backgroundColor: getCanvasBackground() });
    const pdf = new jsPDF({ orientation: "p", unit: "px", format: "a4" });
    const width = pdf.internal.pageSize.getWidth();
    const image = await loadImage(dataUrl);
    const height = (image.height / image.width) * width;
    pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    pdf.save(`${safeName(canvas.title)}.pdf`);
    return;
  }
  const content = await exportCanvas(canvas.id, format, canvas.conversationId ?? undefined);
  if (format === "docx" || format === "pptx") {
    downloadBinary(`${safeName(canvas.title)}.${format}`, base64ToBytes(content), mime(format));
    return;
  }
  downloadText(`${safeName(canvas.title)}.${extension(format)}`, content, mime(format));
}

function downloadText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  downloadUrl(url, name);
  URL.revokeObjectURL(url);
}

function downloadBinary(name: string, content: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  downloadUrl(url, name);
  URL.revokeObjectURL(url);
}

function downloadUrl(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function extension(format: "json" | "markdown" | "html" | "docx" | "pptx") {
  return format === "markdown" ? "md" : format;
}

function mime(format: "json" | "markdown" | "html" | "docx" | "pptx") {
  if (format === "json") return "application/json";
  if (format === "html") return "text/html";
  if (format === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "text/markdown";
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "canvas";
}

function getCanvasBackground() {
  return getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "#f8f8f6";
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
