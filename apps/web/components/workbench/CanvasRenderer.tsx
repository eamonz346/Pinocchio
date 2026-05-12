"use client";

import type { CanvasBlock, CanvasContent } from "@pinocchio/shared";
import DOMPurify from "dompurify";
import { useEffect, useId, useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { cx } from "./utils";
import { useWorkbenchI18n } from "./workbenchI18n";

export function CanvasRenderer({ content, fallbackText }: { content: CanvasContent; fallbackText: string }) {
  const blocks = content.blocks.length ? content.blocks : [{ id: "fallback", type: "paragraph" as const, text: fallbackText }];
  if (!hasSpecialBlocks(blocks)) {
    return (
      <article className="canvas-export-surface mx-auto max-w-[860px] px-2 py-6">
        <MarkdownContent content={fallbackText || blocks.map(text).join("\n\n")} />
      </article>
    );
  }
  return (
    <article className="canvas-export-surface mx-auto max-w-[860px] px-2 py-6">
      {blocks.map((block) => <BlockView key={block.id} block={block} />)}
    </article>
  );
}

function BlockView({ block }: { block: CanvasBlock }) {
  if (block.type === "section") return <section className="my-7">{children(block)}</section>;
  if (block.type === "heading") return <Heading block={block} />;
  if (block.type === "list") return <ul className="my-4 list-disc space-y-2 pl-6">{items(block)}</ul>;
  if (block.type === "taskList") return <ul className="my-4 space-y-2">{taskItems(block)}</ul>;
  if (block.type === "table") return <TableBlock block={block} />;
  if (block.type === "quote") return <blockquote className="my-5 rounded-md border bg-muted/30 px-4 py-3">{text(block)}</blockquote>;
  if (block.type === "callout") return <aside className="my-5 rounded-md border bg-muted/30 px-4 py-3">{children(block) || text(block)}</aside>;
  if (block.type === "code") return <CodeBlock block={block} />;
  if (block.type === "codeProject") return <CodeProject block={block} />;
  if (block.type === "math") return <MathBlock tex={text(block)} />;
  if (block.type === "mermaid") return <MermaidBlock code={text(block)} />;
  if (block.type === "vegaLite") return <VegaLiteBlock spec={block.text ?? block.attrs?.spec} />;
  if (block.type === "image") return <ImageBlock block={block} />;
  if (block.type === "divider") return <hr className="my-8 border-border" />;
  if (block.type === "embedHtml") return <HtmlBlock html={text(block)} />;
  return <div className="my-3 max-w-[72ch] text-[15px] leading-7 text-foreground/88"><MarkdownContent content={text(block)} compact /></div>;
}

function Heading({ block }: { block: CanvasBlock }) {
  const level = Math.min(3, Math.max(1, Number(block.attrs?.level ?? 2)));
  const className = "break-after-avoid font-semibold tracking-normal";
  if (level === 1) return <h1 className={cx("mb-5 border-b border-border pb-4 text-[1.7rem] leading-tight", className)}>{text(block)}</h1>;
  if (level === 2) return <h2 className={cx("mb-3 mt-8 text-[1.25rem] leading-tight", className)}>{text(block)}</h2>;
  return <h3 className={cx("mb-2 mt-6 text-base leading-snug", className)}>{text(block)}</h3>;
}

function TableBlock({ block }: { block: CanvasBlock }) {
  const rows = Array.isArray(block.attrs?.rows) ? block.attrs.rows : [];
  return (
    <div className="my-6 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <tbody>{rows.map((row, index) => <tr key={index}>{cells(row)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CodeBlock({ block }: { block: CanvasBlock }) {
  const [html, setHtml] = useState("");
  const code = text(block);
  useEffect(() => {
    let active = true;
    void import("shiki").then(({ codeToHtml }) =>
      codeToHtml(code, { lang: String(block.attrs?.language ?? "text"), theme: "github-dark" }).then((value) => {
        if (active) setHtml(value);
      })
    ).catch(() => undefined);
    return () => { active = false; };
  }, [block.attrs?.language, code]);
  return html ? <div className="my-5 overflow-x-auto rounded-md text-sm" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="my-5 overflow-x-auto rounded-md border p-4 text-sm"><code>{code}</code></pre>;
}

function CodeProject({ block }: { block: CanvasBlock }) {
  const { t } = useWorkbenchI18n();
  const files = Array.isArray(block.attrs?.files) ? block.attrs.files as { path: string; content: string }[] : [];
  const entry = files.find((file) => file.path === block.attrs?.entry) ?? files[0];
  if (!entry) return null;
  if (/\.html?$/i.test(entry.path)) {
    return <iframe title={t("canvas.appPreview")} className="my-5 h-[520px] w-full rounded-md border bg-white" sandbox="allow-scripts" srcDoc={sandbox(entry.content)} />;
  }
  return <CodeBlock block={{ ...block, type: "code", text: entry.content, attrs: { language: entry.path.split(".").pop() ?? "text" } }} />;
}

function MathBlock({ tex }: { tex: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let active = true;
    void import("katex").then((katex) => {
      const value = katex.default.renderToString(tex, { throwOnError: false, displayMode: true });
      if (active) setHtml(value);
    });
    return () => { active = false; };
  }, [tex]);
  return <div className="my-5 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      const result = await mermaid.render(`canvas-mermaid-${id}`, code);
      if (active) setSvg(result.svg);
    }).catch(() => setSvg(""));
    return () => { active = false; };
  }, [code, id]);
  return <figure className="my-6 overflow-x-auto rounded-md border bg-background p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function VegaLiteBlock({ spec }: { spec: unknown }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let view: { finalize?: () => void } | undefined;
    void import("vega-embed").then(async ({ default: embed }) => {
      if (!ref.current) return;
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      const result = await embed(ref.current, parsed as never, { actions: false, renderer: "svg" });
      view = result.view;
    }).catch(() => undefined);
    return () => view?.finalize?.();
  }, [spec]);
  return <figure className="my-6 overflow-x-auto rounded-md border bg-background p-4"><div ref={ref} /></figure>;
}

function ImageBlock({ block }: { block: CanvasBlock }) {
  return <figure className="my-6 overflow-hidden rounded-md border bg-background"><img src={String(block.attrs?.src ?? "")} alt={String(block.attrs?.alt ?? "")} className="max-h-[480px] w-full object-contain" /></figure>;
}

function HtmlBlock({ html }: { html: string }) {
  const { t } = useWorkbenchI18n();
  return <iframe title={t("canvas.htmlPreview")} className="my-5 h-[520px] w-full rounded-md border bg-white" sandbox="" srcDoc={DOMPurify.sanitize(html)} />;
}

function children(block: CanvasBlock) {
  return block.content?.map((child) => <BlockView key={child.id} block={child} />);
}

function items(block: CanvasBlock) {
  return block.content?.map((item) => <li key={item.id}>{text(item)}</li>);
}

function taskItems(block: CanvasBlock) {
  return block.content?.map((item) => <li key={item.id} className="flex gap-2"><span className="mt-1.5 size-3 rounded-sm border" />{text(item)}</li>);
}

function cells(row: unknown) {
  return Array.isArray(row) ? row.map((cell, index) => <td key={index} className="border-r border-border px-3 py-2 last:border-r-0">{String(cell)}</td>) : null;
}

function text(block: CanvasBlock): string {
  return block.text ?? block.content?.map(text).join("\n") ?? "";
}

function hasSpecialBlocks(blocks: CanvasBlock[]): boolean {
  const special = new Set<CanvasBlock["type"]>(["code", "codeProject", "math", "mermaid", "vegaLite", "image", "embedHtml"]);
  return blocks.some((block) => special.has(block.type) || hasSpecialBlocks(block.content ?? []));
}

function sandbox(content: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'">${content}`;
}
