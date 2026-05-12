# Canvas PPT Deck Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PPT Canvas render real audience-facing HTML decks, keep plan/process content in the existing Plan card, and stop repeated slide content.

**Architecture:** Preserve the current Canvas and Canvas Project APIs, but add a deck-specific content payload on `CanvasContent` for `kind: "ppt"`. The server normalizes PPT text into a `DeckSpec`, renders a self-contained html-ppt-style `deckHtml`, and the web app renders that deck in a sandboxed iframe with slide controls. Existing Plan/Task cards remain the dedicated surface for process plans.

**Tech Stack:** TypeScript, Zod, React SSR tests with Vitest, Playwright e2e, Next.js API routes, existing Canvas Store/Service, html-ppt assets from `O:\any_skills\html-ppt-skill-main`.

---

## File Structure

- Modify `packages/shared/src/canvas.ts`
  - Add `DeckSlideSpecSchema` and `DeckSpecSchema`.
  - Add optional `deck` to `CanvasContentSchema`.
- Create `packages/core/src/canvas/canvasDeck.ts`
  - Convert PPT text blocks into `DeckSpec`.
  - Remove assistant process preamble before the first real slide.
  - Render self-contained html-ppt-compatible HTML with `.deck`, `.slide`, `aside.notes`, theme CSS, and runtime JS.
  - Validate duplicate visible slide text and visible plan phrases.
- Modify `packages/core/src/canvas/canvasText.ts`
  - Attach `deck` to `CanvasContent` when `kind === "ppt"`.
  - Preserve existing `blocks` for editor/export compatibility.
- Modify `packages/core/src/canvas/canvasPptx.ts`
  - Prefer `content.deck.slides` for PPTX slide titles and body lines.
- Modify `packages/core/src/core/promptManager.ts`
  - Add a PPT-specific artifact contract: slide content only in Canvas; plan/process belongs to Plan card.
- Modify `apps/web/components/workbench/PptCanvasViewer.tsx`
  - Fix fallback repetition for legacy block slides.
  - Render `content.deck.html` in an iframe when present.
  - Keep Canvas-level previous/next controls and page indicator.
- Add `apps/web/components/workbench/PptCanvasViewer.test.ts`
  - SSR regression test for legacy slide isolation.
  - SSR test that `deck.html` is rendered through an iframe.
- Modify `apps/web/tests/e2e/workbench.spec.ts`
  - Assert first slide does not include second slide content.
  - Assert generated deck iframe exists for PPT canvases.
- Modify `packages/core/src/tests/canvasService.test.ts`
  - Assert PPT Canvas content includes `deck`, slide specs, hidden notes, no visible process preamble.
  - Assert PPTX export uses deck slides.

---

### Task 1: Legacy PPT Slide Isolation

**Files:**
- Modify: `apps/web/components/workbench/PptCanvasViewer.tsx`
- Test: `apps/web/components/workbench/PptCanvasViewer.test.ts`
- Test: `apps/web/tests/e2e/workbench.spec.ts`

- [ ] **Step 1: Write the failing SSR regression test**

Add `apps/web/components/workbench/PptCanvasViewer.test.ts`:

```ts
import type { CanvasContent } from "@pinocchio/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PptCanvasViewer } from "./PptCanvasViewer";
import { WorkbenchI18nProvider } from "./workbenchI18n";

describe("PptCanvasViewer", () => {
  it("renders only the active legacy slide instead of the full fallback text", () => {
    const content: CanvasContent = {
      format: "block_ast_v1",
      blocks: [
        { id: "h1", type: "heading", text: "Slide 1", attrs: { level: 1 } },
        { id: "p1", type: "paragraph", text: "Only first" },
        { id: "h2", type: "heading", text: "Slide 2", attrs: { level: 1 } },
        { id: "p2", type: "paragraph", text: "Only second" }
      ]
    };

    const html = renderViewer(content, "# Slide 1\nOnly first\n\n# Slide 2\nOnly second");

    expect(html).toContain("1 / 2");
    expect(html).toContain("Only first");
    expect(html).not.toContain("Only second");
  });
});

function renderViewer(content: CanvasContent, fallbackText: string) {
  return renderToStaticMarkup(
    createElement(
      WorkbenchI18nProvider,
      {
        language: "en",
        children: createElement(PptCanvasViewer, { content, fallbackText })
      }
    )
  );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm vitest run apps/web/components/workbench/PptCanvasViewer.test.ts
```

Expected: FAIL because the rendered first slide contains `Only second`.

- [ ] **Step 3: Fix the fallback passed to `CanvasRenderer`**

In `PptCanvasViewer.tsx`, pass slide-local markdown, not the whole deck text:

```tsx
const activeFallbackText = active ? blocksToMarkdown(active.blocks) : "";

{active ? (
  <CanvasRenderer
    content={{ format: "block_ast_v1", blocks: active.blocks }}
    fallbackText={activeFallbackText}
  />
) : null}
```

Add local helpers:

```ts
function blocksToMarkdown(blocks: CanvasBlock[]): string {
  return blocks.map(blockToMarkdown).filter(Boolean).join("\n\n");
}

function blockToMarkdown(block: CanvasBlock): string {
  if (block.type === "heading") return `${"#".repeat(Number(block.attrs?.level ?? 2))} ${block.text ?? ""}`;
  if (block.type === "list" || block.type === "taskList") {
    return (block.content ?? []).map((item) => `- ${blockText(item)}`).join("\n");
  }
  if (block.type === "divider") return "---";
  return blockText(block);
}

function blockText(block: CanvasBlock): string {
  return block.text ?? block.content?.map(blockText).join("\n") ?? "";
}
```

- [ ] **Step 4: Expand e2e regression coverage**

In `apps/web/tests/e2e/workbench.spec.ts`, after asserting `1 / 2`, add:

```ts
await expect(page.getByTestId("ppt-slide")).toContainText("Goal");
await expect(page.getByTestId("ppt-slide")).not.toContainText("Delivery");
await page.getByRole("button", { name: "Next slide" }).click();
await expect(page.getByTestId("ppt-page-indicator")).toHaveText("2 / 2");
await expect(page.getByTestId("ppt-slide")).toContainText("Delivery");
await expect(page.getByTestId("ppt-slide")).not.toContainText("Goal");
```

- [ ] **Step 5: Run tests**

Run:

```powershell
corepack pnpm vitest run apps/web/components/workbench/PptCanvasViewer.test.ts
corepack pnpm --filter @pinocchio/web e2e apps/web/tests/e2e/workbench.spec.ts --grep "opens an existing Canvas"
```

Expected: both pass.

---

### Task 2: Deck Content Schema And Generator

**Files:**
- Modify: `packages/shared/src/canvas.ts`
- Create: `packages/core/src/canvas/canvasDeck.ts`
- Modify: `packages/core/src/canvas/canvasText.ts`
- Test: `packages/core/src/tests/canvasService.test.ts`

- [ ] **Step 1: Write failing core tests**

Append to `packages/core/src/tests/canvasService.test.ts`:

```ts
it("normalizes ppt text into a deck spec without assistant planning preamble", () => {
  const content = textToCanvasContent([
    "我会先整理结构，再生成 PPT。",
    "",
    "# 封面",
    "桑启辅助机制讲解",
    "",
    "# 技能机制",
    "- 位移",
    "- 控制"
  ].join("\n"), "ppt");

  expect(content.deck?.slides).toHaveLength(2);
  expect(content.deck?.slides[0]?.title).toBe("封面");
  expect(content.deck?.html).toContain('class="deck"');
  expect(content.deck?.html).toContain('<section class="slide');
  expect(content.deck?.html).toContain('<aside class="notes">');
  expect(content.deck?.html).not.toContain("我会先整理结构");
});

it("flags duplicate visible slide bodies in generated deck validation", () => {
  const content = textToCanvasContent("# A\nsame\n\n# B\nsame", "ppt");

  expect(content.deck?.validation.warnings).toContain("duplicate-visible-slide-text");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm vitest run packages/core/src/tests/canvasService.test.ts
```

Expected: FAIL because `CanvasContent` has no `deck`.

- [ ] **Step 3: Add shared deck schemas**

In `packages/shared/src/canvas.ts`, add before `CanvasContentSchema`:

```ts
export const DeckSlideSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  layoutId: z.string(),
  html: z.string(),
  notes: z.string().optional(),
  visibleText: z.string(),
  animation: z.string().optional()
});
export type DeckSlideSpec = z.infer<typeof DeckSlideSpecSchema>;

export const DeckSpecSchema = z.object({
  title: z.string(),
  themeId: z.string(),
  format: z.enum(["screen16x9", "portrait3x4"]),
  slides: z.array(DeckSlideSpecSchema),
  html: z.string(),
  validation: z.object({
    warnings: z.array(z.string())
  })
});
export type DeckSpec = z.infer<typeof DeckSpecSchema>;
```

Then change `CanvasContentSchema` to:

```ts
export const CanvasContentSchema = z.object({
  format: z.literal("block_ast_v1"),
  blocks: z.array(CanvasBlockSchema),
  deck: DeckSpecSchema.optional()
});
```

- [ ] **Step 4: Implement `canvasDeck.ts`**

Create `packages/core/src/canvas/canvasDeck.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CanvasBlock, DeckSlideSpec, DeckSpec } from "@pinocchio/shared";
import { createId } from "../utils/id";

const defaultSkillRoot = "O:\\any_skills\\html-ppt-skill-main";
const processPreamble = /(我会|接下来|先.*再|步骤如下|计划如下|先做|再做)/i;

export function buildDeckSpec(input: { title: string; blocks: CanvasBlock[] }): DeckSpec {
  const slides = blocksToSlides(stripProcessPreamble(input.blocks));
  const validation = validateSlides(slides);
  const specWithoutHtml = {
    title: input.title || slides[0]?.title || "Deck",
    themeId: "minimal-white",
    format: "screen16x9" as const,
    slides,
    validation
  };
  return { ...specWithoutHtml, html: renderDeckHtml(specWithoutHtml) };
}

function stripProcessPreamble(blocks: CanvasBlock[]): CanvasBlock[] {
  const firstHeading = blocks.findIndex((block) => block.type === "heading");
  if (firstHeading <= 0) return blocks;
  const preamble = blocks.slice(0, firstHeading).map(blockText).join("\n");
  return processPreamble.test(preamble) ? blocks.slice(firstHeading) : blocks;
}

function blocksToSlides(blocks: CanvasBlock[]): DeckSlideSpec[] {
  const groups: CanvasBlock[][] = [];
  let current: CanvasBlock[] = [];
  for (const block of blocks) {
    if (block.type === "divider") {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    if (block.type === "heading" && current.length) {
      groups.push(current);
      current = [block];
      continue;
    }
    current.push(block);
  }
  if (current.length) groups.push(current);

  return groups.map((group, index) => slideFromBlocks(group, index)).filter((slide) => slide.visibleText.trim());
}

function slideFromBlocks(blocks: CanvasBlock[], index: number): DeckSlideSpec {
  const first = blocks[0];
  const title = first?.type === "heading" ? blockText(first) : `Slide ${index + 1}`;
  const body = first?.type === "heading" ? blocks.slice(1) : blocks;
  const layoutId = pickLayout(title, body, index);
  const visibleText = [title, ...body.map(blockText)].join("\n").trim();
  return {
    id: createId("slide"),
    title,
    layoutId,
    html: renderSlideBody(title, body, layoutId),
    notes: `讲这一页时围绕“${title}”展开，补充背景、例子和过渡，不把执行计划暴露给观众。`,
    visibleText,
    animation: index === 0 ? "fade-up" : "rise-in"
  };
}

function pickLayout(title: string, body: CanvasBlock[], index: number): string {
  const text = [title, ...body.map(blockText)].join("\n");
  if (index === 0) return "cover";
  if (/对比|比较|vs|versus/i.test(text)) return "comparison";
  if (/时间|阶段|路线|roadmap|timeline/i.test(text)) return "timeline";
  if (/数据|指标|KPI|%|¥|\\d{2,}/i.test(text)) return "kpi-grid";
  if (/流程|机制|步骤|process/i.test(text)) return "process-steps";
  if (/总结|结论|takeaway/i.test(text)) return "thanks";
  return body.some((block) => block.type === "list") ? "bullets" : "two-column";
}

function renderSlideBody(title: string, body: CanvasBlock[], layoutId: string): string {
  const bodyHtml = body.map(renderBlock).join("\\n");
  if (layoutId === "cover") {
    return `<div class="deck-header"><span>Canvas PPT</span><span>${escapeHtml(layoutId)}</span></div><h1 class="h1 anim-fade-up" data-anim="fade-up">${escapeHtml(title)}</h1><div class="mt-m">${bodyHtml}</div>`;
  }
  return `<div class="deck-header"><span>${escapeHtml(layoutId)}</span><span>${escapeHtml(title)}</span></div><h2 class="h2">${escapeHtml(title)}</h2><div class="mt-m">${bodyHtml}</div>`;
}

function renderBlock(block: CanvasBlock): string {
  if (block.type === "list" || block.type === "taskList") {
    return `<ul class="list">${(block.content ?? []).map((item) => `<li>${escapeHtml(blockText(item))}</li>`).join("")}</ul>`;
  }
  if (block.type === "quote") return `<blockquote>${escapeHtml(blockText(block))}</blockquote>`;
  if (block.type === "table") return `<pre>${escapeHtml(blockText(block))}</pre>`;
  return `<p class="lede">${escapeHtml(blockText(block))}</p>`;
}

function renderDeckHtml(spec: Omit<DeckSpec, "html">): string {
  const slides = spec.slides.map((slide, index) => [
    `<section class="slide" data-title="${escapeHtml(slide.title)}" data-layout="${escapeHtml(slide.layoutId)}">`,
    slide.html,
    `<div class="deck-footer"><span>${escapeHtml(spec.title)}</span><span class="slide-number" data-current="${index + 1}" data-total="${spec.slides.length}"></span></div>`,
    `<aside class="notes">${escapeHtml(slide.notes ?? "")}</aside>`,
    `</section>`
  ].join("\\n")).join("\\n");
  return [
    "<!doctype html>",
    `<html lang="zh-CN" data-themes="minimal-white,corporate-clean,swiss-grid,tokyo-night" data-theme-base="assets/themes/">`,
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    `<title>${escapeHtml(spec.title)}</title>`,
    `<style>${assetText("assets/base.css")}${assetText("assets/themes/minimal-white.css")}${fallbackDeckCss()}</style>`,
    "</head>",
    `<body data-theme="${escapeHtml(spec.themeId)}">`,
    "<div class=\"deck\">",
    slides,
    "</div>",
    `<script>${scriptText("assets/runtime.js")}</script>`,
    "</body></html>"
  ].join("\\n");
}

function validateSlides(slides: DeckSlideSpec[]) {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const slide of slides) {
    const normalized = slide.visibleText.replace(/\\s+/g, " ").trim().toLowerCase();
    if (normalized && seen.has(normalized)) warnings.push("duplicate-visible-slide-text");
    seen.add(normalized);
    if (processPreamble.test(slide.visibleText)) warnings.push("visible-process-text");
  }
  return { warnings: [...new Set(warnings)] };
}

function skillRoot() {
  return process.env.HTML_PPT_SKILL_ROOT || defaultSkillRoot;
}

function assetText(relativePath: string): string {
  const file = path.join(skillRoot(), relativePath);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function scriptText(relativePath: string): string {
  return assetText(relativePath).replace(/<\\/script/gi, "<\\\\/script");
}

function fallbackDeckCss(): string {
  return ".deck{position:relative;width:100vw;height:100vh;overflow:hidden}.slide{position:absolute;inset:0;opacity:0;pointer-events:none;padding:7vh 7vw}.slide.is-active{opacity:1;pointer-events:auto}.notes{display:none!important}.h1{font-size:72px}.h2{font-size:48px}.lede{font-size:26px;line-height:1.35}.list{font-size:28px;line-height:1.5}";
}

function blockText(block: CanvasBlock): string {
  if (block.type === "table") {
    const rows = Array.isArray(block.attrs?.rows) ? block.attrs.rows : [];
    return rows.map((row) => Array.isArray(row) ? row.map(String).join(" | ") : "").join("\\n");
  }
  return block.text ?? block.content?.map(blockText).join("\\n") ?? "";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- [ ] **Step 5: Attach deck content for PPT kind**

In `packages/core/src/canvas/canvasText.ts`, import:

```ts
import { buildDeckSpec } from "./canvasDeck";
```

Change `textToCanvasContent` to:

```ts
export function textToCanvasContent(text: string, kind: CanvasKind = inferCanvasKind(text)): CanvasContent {
  const blocks = kind === "code" || kind === "app" ? codeBlocks(text, kind) : documentBlocks(text);
  const normalizedBlocks = blocks.length ? blocks : [paragraph(text)];
  return {
    format: "block_ast_v1",
    blocks: normalizedBlocks,
    ...(kind === "ppt" ? { deck: buildDeckSpec({ title: firstHeading(normalizedBlocks) ?? "Deck", blocks: normalizedBlocks }) } : {})
  };
}
```

Add:

```ts
function firstHeading(blocks: CanvasBlock[]): string | undefined {
  return blocks.find((block) => block.type === "heading" && block.text)?.text;
}
```

- [ ] **Step 6: Run core tests**

Run:

```powershell
corepack pnpm vitest run packages/core/src/tests/canvasService.test.ts packages/shared/src/canvasProject.test.ts
```

Expected: pass.

---

### Task 3: Deck Iframe Viewer

**Files:**
- Modify: `apps/web/components/workbench/PptCanvasViewer.tsx`
- Test: `apps/web/components/workbench/PptCanvasViewer.test.ts`
- Test: `apps/web/tests/e2e/workbench.spec.ts`

- [ ] **Step 1: Add failing iframe SSR test**

Append to `PptCanvasViewer.test.ts`:

```ts
it("renders generated deck html in a sandboxed iframe", () => {
  const content: CanvasContent = {
    format: "block_ast_v1",
    blocks: [],
    deck: {
      title: "Deck",
      themeId: "minimal-white",
      format: "screen16x9",
      slides: [
        { id: "s1", title: "One", layoutId: "cover", html: "<h1>One</h1>", visibleText: "One" },
        { id: "s2", title: "Two", layoutId: "bullets", html: "<h1>Two</h1>", visibleText: "Two" }
      ],
      html: "<!doctype html><html><body><div class=\"deck\"><section class=\"slide is-active\">One</section></div></body></html>",
      validation: { warnings: [] }
    }
  };

  const html = renderViewer(content, "");

  expect(html).toContain("1 / 2");
  expect(html).toContain("<iframe");
  expect(html).toContain("allow-scripts");
  expect(html).toContain("allow-popups");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm vitest run apps/web/components/workbench/PptCanvasViewer.test.ts
```

Expected: FAIL because no iframe is rendered for `content.deck`.

- [ ] **Step 3: Render deck iframe with controls**

In `PptCanvasViewer.tsx`:

```tsx
const iframeRef = useRef<HTMLIFrameElement | null>(null);
const deck = content.deck;
const totalSlides = deck?.slides.length || slides.length;
const active = deck ? undefined : slides[Math.min(index, slides.length - 1)] ?? slides[0];

useEffect(() => {
  if (!deck || !iframeRef.current?.contentWindow) return;
  iframeRef.current.contentWindow.location.hash = `#/${index + 1}`;
}, [deck, index]);
```

Render:

```tsx
{deck ? (
  <iframe
    ref={iframeRef}
    title={deck.title}
    data-testid="ppt-deck-frame"
    className="h-full min-h-[420px] w-full border-0 bg-white"
    sandbox="allow-scripts allow-popups allow-same-origin"
    srcDoc={deck.html}
    onLoad={() => {
      if (iframeRef.current?.contentWindow) iframeRef.current.contentWindow.location.hash = `#/${index + 1}`;
    }}
  />
) : active ? (
  <CanvasRenderer content={{ format: "block_ast_v1", blocks: active.blocks }} fallbackText={blocksToMarkdown(active.blocks)} />
) : null}
```

Use `totalSlides` for the indicator and next button bounds.

- [ ] **Step 4: Add e2e iframe assertion**

In `workbench.spec.ts`, after opening the PPT Canvas, add:

```ts
await expect(page.getByTestId("ppt-deck-frame")).toBeVisible();
```

- [ ] **Step 5: Run viewer tests**

Run:

```powershell
corepack pnpm vitest run apps/web/components/workbench/PptCanvasViewer.test.ts
corepack pnpm --filter @pinocchio/web e2e apps/web/tests/e2e/workbench.spec.ts --grep "opens an existing Canvas"
```

Expected: pass.

---

### Task 4: PPT Prompt Contract And Export Path

**Files:**
- Modify: `packages/core/src/core/promptManager.ts`
- Modify: `packages/core/src/canvas/canvasPptx.ts`
- Test: `packages/core/src/tests/canvasService.test.ts`
- Test: `packages/core/src/tests/chatEngine.test.ts`

- [ ] **Step 1: Write failing prompt-contract test**

Add to `packages/core/src/tests/chatEngine.test.ts`:

```ts
it("adds a deck-only contract for ppt canvas requests", async () => {
  const seenPrompts: string[] = [];
  const llm: LLMClient = {
    async complete() {
      throw new Error("unused");
    },
    async *stream(input) {
      seenPrompts.push(input.messages.map((message) => message.content ?? "").join("\n"));
      yield { content: "# 封面\n桑启机制讲解" };
    }
  };

  await collect(engine({ showRawReasoning: false, llm }).stream({
    ...request,
    id: "ppt-contract",
    messages: [{ id: "u", role: "user", content: "帮我做一份桑启讲解 PPT，3页", createdAt: "2026-05-08T00:00:00.000Z" }]
  }));

  expect(seenPrompts.join("\n")).toContain("Plan card");
  expect(seenPrompts.join("\n")).toContain("audience-facing slide content only");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm vitest run packages/core/src/tests/chatEngine.test.ts
```

Expected: FAIL because prompt has no deck-only contract.

- [ ] **Step 3: Add PPT dynamic prompt rule**

In `PromptManager.getDynamicSystemPrompt`, add a part when `ctx.flags.canvas` and `primaryGoal` or user text implies PPT. If `CapabilityContext` does not carry the raw text, use `ctx.primaryGoal`.

```ts
deckPrompt(ctx)
```

Add:

```ts
function deckPrompt(ctx: CapabilityContext): string {
  if (!/(ppt|slides?|deck|幻灯片|演示文稿)/i.test(ctx.primaryGoal)) return "";
  return [
    "PPT/Deck Canvas contract:",
    "Canvas must contain audience-facing slide content only.",
    "Do not put execution plans, process narration, or phrases like 'first I will' / 'next I will' into visible slides.",
    "The Plan card is the dedicated place for plan/process content.",
    "Use varied slide structures based on content; do not force every page into title plus three bullets.",
    "Speaker-only notes belong in hidden notes, not visible slide text."
  ].join(" ");
}
```

- [ ] **Step 4: Make PPTX export prefer deck slides**

In `canvasPptx.ts`, change `slidesFor`:

```ts
function slidesFor(content: CanvasContent, title: string): Slide[] {
  if (content.deck?.slides.length) {
    return content.deck.slides.map((slide) => ({
      title: slide.title || title,
      lines: slide.visibleText.split(/\n+/).slice(1, 11)
    }));
  }
  // existing fallback
}
```

- [ ] **Step 5: Run core tests**

Run:

```powershell
corepack pnpm vitest run packages/core/src/tests/chatEngine.test.ts packages/core/src/tests/canvasService.test.ts
```

Expected: pass.

---

### Task 5: Verification Sweep

**Files:**
- No source changes unless tests reveal a defect.

- [ ] **Step 1: Typecheck shared/core/web**

Run:

```powershell
corepack pnpm typecheck
```

Expected: all packages typecheck.

- [ ] **Step 2: Run targeted tests**

Run:

```powershell
corepack pnpm vitest run apps/web/components/workbench/PptCanvasViewer.test.ts packages/core/src/tests/canvasService.test.ts packages/core/src/tests/chatEngine.test.ts
```

Expected: pass.

- [ ] **Step 3: Run lint guard**

Run:

```powershell
corepack pnpm lint
```

Expected: exact dependency and file-size checks pass.

- [ ] **Step 4: Run focused e2e**

Run:

```powershell
corepack pnpm --filter @pinocchio/web e2e apps/web/tests/e2e/workbench.spec.ts --grep "opens an existing Canvas"
```

Expected: pass and show one visible deck iframe with isolated slide content.

---

## Self-Review

- Spec coverage: repeated slide bug is covered by Task 1; DeckSpec/deckHtml/runtime/notes by Task 2; iframe preview by Task 3; Plan-card separation and prompt contract by Task 4; verification by Task 5.
- Placeholder scan: no TBD/TODO/fill-later steps remain.
- Type consistency: `CanvasContent.deck`, `DeckSpec`, `DeckSlideSpec`, and `validation.warnings` are named consistently across tasks.
