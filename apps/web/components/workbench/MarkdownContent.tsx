"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className={compact ? "my-1.5 leading-6" : "my-3 leading-7"}>{children}</p>,
        h1: ({ children }) => <h1 className={compact ? "mb-2 mt-3 text-xl font-semibold leading-tight" : "mb-3 mt-6 text-2xl font-semibold leading-tight"}>{children}</h1>,
        h2: ({ children }) => <h2 className={compact ? "mb-2 mt-3 text-lg font-semibold leading-tight" : "mb-3 mt-6 text-xl font-semibold leading-tight"}>{children}</h2>,
        h3: ({ children }) => <h3 className={compact ? "mb-1.5 mt-3 text-base font-semibold leading-snug" : "mb-2 mt-5 text-lg font-semibold leading-snug"}>{children}</h3>,
        h4: ({ children }) => <h4 className="mb-1.5 mt-4 text-sm font-semibold leading-snug">{children}</h4>,
        ul: ({ children }) => <ul className={compact ? "my-2 list-disc space-y-1 pl-5 leading-6" : "my-3 list-disc space-y-1.5 pl-5 leading-7"}>{children}</ul>,
        ol: ({ children }) => <ol className={compact ? "my-2 list-decimal space-y-1 pl-5 leading-6" : "my-3 list-decimal space-y-1.5 pl-5 leading-7"}>{children}</ol>,
        li: ({ children }) => <li className="pl-1 [&>p]:my-1">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-3 border-l-4 border-border bg-muted/30 px-4 py-2 text-muted-foreground">{children}</blockquote>,
        hr: () => <hr className="my-5 border-border" />,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>,
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-[1rem] border bg-muted/45 p-4 text-sm leading-6">{children}</pre>,
        table: ({ children }) => (
          <div className="my-5 overflow-x-auto rounded-[1rem] border bg-card/50">
            <table className="w-full min-w-[520px] border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="bg-muted/70 px-4 py-3 text-left text-xs font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-t border-border px-4 py-3 align-top leading-6">{children}</td>
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
