# Pinocchio Module Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the stronger Pinocchio module implementations into the current product while preserving existing DeepSeek-provider behavior and all passing tests.

**Architecture:** Keep the product runtime intact and replace or extend narrow capability modules behind existing contracts. Pinocchio becomes the product brand; DeepSeek remains the model/provider name for API keys, model IDs, tokenizer, pricing, and official-news tools.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Vitest, Next.js, zod, Node fetch, jsdom for HTML extraction.

---

### Task 1: Web Search And Fetch

**Files:**
- Create: `packages/core/src/tools/web/types.ts`
- Create: `packages/core/src/tools/web/errors.ts`
- Create: `packages/core/src/tools/web/defaults.ts`
- Create: `packages/core/src/tools/web/extract/html.ts`
- Create: `packages/core/src/tools/web/extract/jsdom.ts`
- Create: `packages/core/src/tools/web/fetcher/security.ts`
- Create: `packages/core/src/tools/web/fetcher/http.ts`
- Create: `packages/core/src/tools/web/providers/duckduckgo.ts`
- Create: `packages/core/src/tools/web/providers/registry.ts`
- Modify: `packages/core/src/tools/webFetchTool.ts`
- Modify: `packages/core/src/tests/webTools.test.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Write failing tests**
  - Add tests for DuckDuckGo parsing, provider failures, SSRF/private-address rejection, redirect-to-private rejection, HTML selector extraction, JSON fetch formatting, `WEB_ACCESS_ENABLED=false`, and wrapper response compatibility.

- [ ] **Step 2: Verify tests fail**
  - Run: `corepack pnpm vitest run packages/core/src/tests/webTools.test.ts`
  - Expected: failures because the provider/fetcher stack does not exist yet.

- [ ] **Step 3: Port Pinocchio implementation**
  - Copy the Pinocchio provider/fetcher/extraction stack into `packages/core/src/tools/web`.
  - Keep browser-backed provider out of the default path.
  - Add `jsdom` and `@types/jsdom` as exact dependencies where needed.

- [ ] **Step 4: Preserve current tool contracts**
  - `web_fetch` must still return `{ url, text }` because `runtime.ts` reads `text`.
  - `web_search` must still return `{ query, source, results }`, and may add `attemptedProviders` and `failures`.
  - Keep `WEB_ACCESS_ENABLED` as the top-level kill switch.

- [ ] **Step 5: Verify**
  - Run: `corepack pnpm vitest run packages/core/src/tests/webTools.test.ts packages/core/src/tests/currentTimeTool.test.ts`
  - Expected: pass.

### Task 2: Workspace File Reader

**Files:**
- Create: `packages/core/src/files/fileReaderTypes.ts`
- Create: `packages/core/src/files/fileReaderErrors.ts`
- Create: `packages/core/src/files/fileMime.ts`
- Create: `packages/core/src/files/pathSecurity.ts`
- Create: `packages/core/src/files/workspaceFileReader.ts`
- Modify: `packages/core/src/tools/fileReaderTool.ts`
- Modify: `packages/core/src/runtime.ts`
- Create: `packages/core/src/tests/workspaceFileReader.test.ts`
- Create or modify: `packages/core/src/tests/fileReaderTool.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add tests for traversal rejection, symlink escape rejection, allowlist reads, line/page reads, byte truncation, file type detection, dependency filtering, text search, and uploaded-file `{ fileId }` compatibility.

- [ ] **Step 2: Verify tests fail**
  - Run: `corepack pnpm vitest run packages/core/src/tests/workspaceFileReader.test.ts packages/core/src/tests/fileReaderTool.test.ts`
  - Expected: failures because the workspace reader does not exist yet.

- [ ] **Step 3: Port reader as additive capability**
  - Add a read-only sandboxed workspace reader beside `FileStore`; do not replace upload storage.
  - Realpath-check root and allowlist; reject traversal and symlink escapes.

- [ ] **Step 4: Extend the tool**
  - Preserve existing `file_reader` input `{ fileId }`.
  - Add operation modes for `read`, `list`, `search`, and `type`.
  - Default workspace root should be the process workspace unless a stricter env setting is added later.

- [ ] **Step 5: Verify**
  - Run: `corepack pnpm vitest run packages/core/src/tests/workspaceFileReader.test.ts packages/core/src/tests/fileReaderTool.test.ts packages/core/src/tests/fileStore.test.ts`
  - Expected: pass.

### Task 3: Deep Research

**Files:**
- Create: `packages/core/src/research/types.ts`
- Create: `packages/core/src/research/sourceProvider.ts`
- Create: `packages/core/src/research/synthesis.ts`
- Create: `packages/core/src/research/critique.ts`
- Modify: `packages/core/src/research/deepResearchService.ts`
- Modify: `packages/core/src/tests/researchAndPlan.test.ts`
- Modify: `packages/core/src/tests/taskProcessor.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add tests asserting evidence IDs, material IDs, findings, gaps, critique, source metadata, fetch-failure fallback, and no leaked old module-stage strings.

- [ ] **Step 2: Verify tests fail**
  - Run: `corepack pnpm vitest run packages/core/src/tests/researchAndPlan.test.ts packages/core/src/tests/taskProcessor.test.ts`
  - Expected: failures because current service only renders source excerpts.

- [ ] **Step 3: Port deterministic research synthesis**
  - Adapt Pinocchio schemas and algorithms, but rewrite old hardcoded project-stage wording into neutral Pinocchio product wording.
  - Keep `DeepResearchService.run({ query, limit })` output shape unchanged.

- [ ] **Step 4: Render richer Markdown**
  - Include sources, evidence, findings, contradictions/gaps, critique, and excerpts.
  - Preserve Canvas, Artifact, and Context persistence expectations.

- [ ] **Step 5: Verify**
  - Run: `corepack pnpm vitest run packages/core/src/tests/researchAndPlan.test.ts packages/core/src/tests/taskProcessor.test.ts`
  - Expected: pass.

### Task 4: Context, Prompt, And Routing Metadata

**Files:**
- Create: `packages/core/src/context/assembler.ts`
- Create: `packages/core/src/context/fingerprint.ts`
- Create: `packages/core/src/core/promptSections.ts`
- Create: `packages/core/src/agents/agentPolicy.ts`
- Modify: `packages/core/src/core/promptManager.ts`
- Modify: `packages/core/src/core/intentRouter.ts`
- Modify: `packages/shared/src/capability.ts`
- Modify: `packages/core/src/tests/contextManager.test.ts`
- Modify: `packages/core/src/tests/methodology.test.ts`
- Modify: `packages/core/src/tests/intentRouterEdge.test.ts`
- Create: `packages/core/src/tests/agentPolicy.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add tests for prompt section ordering, hidden sections, stable snapshot hashing, route safety metadata, discussion-only routing, and command/path policy classifiers.

- [ ] **Step 2: Verify tests fail**
  - Run: `corepack pnpm vitest run packages/core/src/tests/contextManager.test.ts packages/core/src/tests/methodology.test.ts packages/core/src/tests/intentRouterEdge.test.ts packages/core/src/tests/agentPolicy.test.ts`
  - Expected: new tests fail.

- [ ] **Step 3: Add pure helpers**
  - Add context assembler/fingerprint and prompt composer helpers without replacing `ContextManager.prepareMessages`.
  - Add agent policy classifiers without wiring shell or patch execution into ChatEngine.

- [ ] **Step 4: Add route metadata**
  - Extend capability context with optional route/safety metadata.
  - Keep existing flags and preflight behavior compatible.

- [ ] **Step 5: Verify**
  - Run the focused test command from Step 2.
  - Expected: pass.

### Task 5: Pinocchio Brand Cleanup

**Files:**
- Modify: workspace package manifests and imports from `@pinocchio/*` to `@pinocchio/*`
- Modify: product/UI strings in `README.md`, `PROJECT_STRUCTURE.md`, `docs/**/*.md`, `apps/web/app/layout.tsx`, `BrandMark.tsx`, and `workbenchI18n.tsx`
- Modify: MCP server display name
- Modify: localStorage/data-dir identity keys with backward-compatible migration aliases
- Do not rename DeepSeek provider/API/model/tokenizer/pricing/news symbols.

- [ ] **Step 1: Write failing tests or update expected UI names**
  - Update brand expectations in E2E/unit tests and add migration tests for persisted browser/storage keys when practical.

- [ ] **Step 2: Perform targeted replacements**
  - Replace package scope `@pinocchio` with `@pinocchio`.
  - Replace product brand strings with `Pinocchio`.
  - Keep `DEEPSEEK_*`, `DeepSeekLLMClient`, model IDs, tokenizer paths, pricing, and official news names unchanged.

- [ ] **Step 3: Refresh lockfile**
  - Run: `corepack pnpm install --lockfile-only`
  - Expected: lockfile reflects package-name changes without dependency drift.

- [ ] **Step 4: Verify**
  - Run: `corepack pnpm test`
  - Run: `corepack pnpm typecheck`
  - Expected: pass.

### Task 6: Final Regression

**Files:** all touched files.

- [ ] **Step 1: Lint**
  - Run: `corepack pnpm lint`
  - Expected: pass.

- [ ] **Step 2: Full test**
  - Run: `corepack pnpm test`
  - Expected: all previous tests pass plus new tests.

- [ ] **Step 3: Typecheck**
  - Run: `corepack pnpm typecheck`
  - Expected: pass.

- [ ] **Step 4: Build**
  - Run: `corepack pnpm build`
  - Expected: pass, or report any pre-existing/dependency build issue with exact output.
