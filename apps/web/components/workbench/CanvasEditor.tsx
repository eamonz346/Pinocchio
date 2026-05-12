"use client";

import type { Canvas } from "@pinocchio/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { useEffect, useMemo, useState } from "react";
import { useWorkbenchI18n } from "./workbenchI18n";

export function CanvasEditor({
  canvas,
  onSave,
  showTitle = true
}: {
  canvas: Canvas;
  onSave: (input: { title: string; contentText: string }) => void;
  showTitle?: boolean;
}) {
  const [title, setTitle] = useState(canvas.title);
  const [content, setContent] = useState(canvas.contentText);
  const isCode = canvas.kind === "code" || canvas.kind === "app";
  const { t } = useWorkbenchI18n();
  useEffect(() => {
    setTitle(canvas.title);
    setContent(canvas.contentText);
  }, [canvas.id, canvas.title, canvas.contentText]);
  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      {showTitle ? <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 rounded-[0.85rem] border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/35" /> : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-[0.85rem] border border-border bg-background">
        {isCode ? <CodeCanvasEditor canvas={canvas} value={content} onChange={setContent} /> : <DocumentCanvasEditor value={content} onChange={setContent} />}
      </div>
      <button type="button" onClick={() => onSave({ title, contentText: content })} className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-primary px-4 text-sm font-semibold text-primary-foreground">
        {t("canvas.save")}
      </button>
    </div>
  );
}

function DocumentCanvasEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useWorkbenchI18n();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image,
      Placeholder.configure({ placeholder: t("canvas.editorPlaceholder") }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true })
    ],
    content: textToHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getText({ blockSeparator: "\n\n" })),
    editorProps: {
      attributes: {
        class: "min-h-[500px] max-w-none px-5 py-4 text-sm leading-7 outline-none prose prose-neutral dark:prose-invert"
      }
    }
  });
  useEffect(() => {
    if (editor && editor.getText({ blockSeparator: "\n\n" }) !== value) editor.commands.setContent(textToHtml(value));
  }, [editor, value]);
  return <EditorContent editor={editor} />;
}

function CodeCanvasEditor({ canvas, value, onChange }: { canvas: Canvas; value: string; onChange: (value: string) => void }) {
  const extension = useMemo(() => languageExtension(canvas.contentJson.blocks[0]?.attrs?.language ?? canvas.kind), [canvas]);
  return <CodeMirror value={value} height="520px" basicSetup extensions={extension ? [extension] : []} onChange={onChange} />;
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function languageExtension(language: unknown) {
  const value = String(language).toLowerCase();
  if (value.includes("html") || value === "app") return html();
  if (value.includes("css")) return css();
  if (value.includes("json")) return json();
  if (value.includes("python") || value === "py") return python();
  if (value.includes("markdown") || value === "document") return markdown();
  return javascript({ jsx: true, typescript: value.includes("ts") || value.includes("typescript") });
}
