# 项目结构说明

这份文档用中文注释梳理当前 monorepo 的职责边界。原则是：共享类型只放 `shared`，业务编排放 `core`，Web 只做 UI 和薄 BFF，MCP server 只挂载外部工具入口。

## 顶层结构

```text
R:\pinocchio
├─ apps/                         # 应用入口，当前只有 Web 客户端
│  └─ web/                       # Next App Router 三栏 AI 工作台
├─ packages/                     # 可复用 TypeScript 包
│  ├─ shared/                    # 前后端共享类型、Zod schemas、SSE 协议
│  ├─ core/                      # LLM、Agent runtime、工具、存储、记忆、Artifact
│  └─ mcp-server/                # 独立 MCP stdio server，复用 core tools
├─ scripts/                      # 工程约束检查脚本
├─ .env.example                  # 环境变量模板，不保存真实密钥
├─ ACCEPTANCE_CHECKLIST.md       # 人工验收清单
├─ README.md                     # 安装、启动、测试和验收说明
├─ package.json                  # 根脚本和 exact pinned devDependencies
├─ pnpm-workspace.yaml           # pnpm workspace 包声明
├─ pnpm-lock.yaml                # 锁定依赖版本
├─ tsconfig.base.json            # 全仓 TypeScript 基础配置
└─ vitest.config.ts              # Vitest 单元测试配置
```

## Web 应用

```text
apps/web
├─ app/
│  ├─ api/                       # Next App Router Route Handlers
│  │  ├─ chat/route.ts           # POST /api/chat，自定义 ChatStreamEvent SSE
│  │  ├─ files/upload/route.ts   # POST /api/files/upload，文件解析和 chunk 生成
│  │  ├─ artifacts/route.ts      # POST /api/artifacts，创建 Artifact
│  │  ├─ artifacts/[id]/route.ts # GET/PATCH /api/artifacts/[id]
│  │  ├─ code/execute/route.ts   # POST /api/code/execute，本地受限运行器入口
│  │  ├─ memory/route.ts         # GET /api/memory，读取记忆和候选记忆
│  │  ├─ memory/confirm/route.ts # POST /api/memory/confirm，用户确认保存
│  │  └─ memory/[id]/route.ts    # DELETE /api/memory/[id]
│  ├─ globals.css                # Tailwind 和工作台视觉 tokens
│  ├─ layout.tsx                 # App Router 根布局
│  └─ page.tsx                   # 首页，挂载 ChatWindow
├─ components/
│  ├─ ChatWindow.tsx             # 三栏工作台组合层，避免业务逻辑下沉到 UI
│  ├─ appState.ts                # React Context/useReducer 风格的状态 reducer
│  ├─ Controls.tsx               # model/thinking/effort/mode 顶部控制区
│  ├─ MessageList.tsx            # 消息列表，Markdown/LaTeX/表格渲染
│  ├─ MessageInput.tsx           # 用户输入和 Canvas 开关
│  ├─ ArtifactCanvas.tsx         # 右侧 Canvas，支持 Markdown/HTML sandbox 预览
│  ├─ ToolCallPanel.tsx          # 工具调用状态展示
│  ├─ FileUpload.tsx             # 文件上传 UI
│  ├─ LongTextPanel.tsx          # 长文本粘贴、chunk/topic 展示
│  ├─ CodeExecutionPanel.tsx     # 本地受限运行器 UI
│  ├─ MemoryPanel.tsx            # 候选记忆确认、已保存记忆删除
│  └─ FileUpload.tsx             # 文件/图片上传与预览，不调用外部视觉模型
├─ lib/
│  ├─ serverRuntime.ts           # 服务端单例 runtime，供 Route Handlers 使用
│  ├─ streamClient.ts            # 浏览器端自定义 SSE 解析，不暴露 DeepSeek 原始流
│  ├─ apiClient.ts               # 文件、代码、记忆 API 客户端
│  └─ artifactClient.ts          # Artifact API 客户端
└─ tests/e2e/                    # Playwright E2E，默认 mock LLM，不消耗 API 配额
```

## Shared 包

```text
packages/shared/src
├─ model.ts                      # ModelName、ThinkingConfig、AppMode
├─ message.ts                    # ChatMessage，保留 reasoning_content/tool_calls 字段
├─ tool.ts                       # ToolCall、ToolCallState、ToolResult
├─ stream.ts                     # ChatStreamEvent，自定义 SSE 协议
├─ api.ts                        # ChatRequest、ChatResponse、ApiError
├─ artifact.ts                   # Artifact 类型和 create/update schemas
├─ memory.ts                     # MemoryItem、MemoryCandidate、确认请求
├─ file.ts                       # UploadedFile、FileChunk
├─ code.ts                       # CodeExecutionRequest、CodeExecutionResult
├─ storage.ts                    # Result、StorageError
├─ agent.ts                      # AgentName、AgentLimits
└─ index.ts                      # 统一导出，避免前后端重复定义类型
```

## Core 包

```text
packages/core/src
├─ config/
│  ├─ env.ts                     # 环境变量读取和默认值，CODE_EXECUTION_ENABLED 默认 false
│  └─ models.ts                  # thinking/reasoning_effort 归一化
├─ core/
│  ├─ llmClient.ts               # DeepSeek Chat Completion 封装，外部调用可 mock
│  ├─ mockLLMClient.ts           # 测试/E2E deterministic mock LLM
│  ├─ chatEngine.ts              # 主编排器：prompt/context/llm/tool/artifact/memory
│  ├─ thinkingMode.ts            # 位于 modes/，处理 reasoning_content 与 tool loop
│  ├─ contextManager.ts          # 上下文预算、压缩、完整 thinking + tool_calls 链路保留
│  ├─ promptManager.ts           # 按 mode 组合 system prompt，不调用 LLM
│  ├─ toolRouter.ts              # 工具注册、model/runtime schema、执行和结构化错误
│  └─ artifactManager.ts         # Artifact create/update/version，HTML sanitize
├─ tools/
│  ├─ fileReaderTool.ts          # 只能读取已上传文件，不读任意系统路径
│  ├─ longTextTool.ts            # chunk、摘要、主题、QA、引用
│  ├─ codeExecutionTool.ts       # local_restricted_runner，本地受限运行器
│  ├─ currentTimeTool.ts         # 当前日期/时间工具，默认支持北京时间
│  ├─ webFetchTool.ts            # URL 抓取和 Web 搜索工具，受 WEB_ACCESS_ENABLED 控制
│  ├─ memoryTool.ts              # 查询记忆和候选记忆，永久写入必须走 UI 确认
│  ├─ artifactTool.ts            # 让模型创建 Artifact
│  └─ investigationTool.ts       # 任务拆解、优先级和复盘类本地辅助工具
├─ storage/
│  ├─ storageAdapter.ts          # StorageAdapter 抽象
│  └─ localJsonStorageAdapter.ts # `.data/` JSON 原子写入实现
├─ files/fileStore.ts            # 上传文件校验、解析、chunk、TTL 清理
├─ memory/
│  ├─ memoryStore.ts             # candidate、confirm、list、delete、expire
│  └─ memoryPolicy.ts            # 禁止自动保存敏感记忆
├─ modes/                        # chat/writing/teaching/planning/coding/multi-agent 策略入口
├─ agents/                       # Phase 3 agent stubs，保留轮数/token 边界
├─ artifacts/                    # markdown/html/newspaper renderer 边界
├─ safety/                       # limits、permissions、本地受限运行器安全提示
├─ tests/                        # Vitest 单元测试
├─ runtime.ts                    # 组装 storage、tools、managers、chatEngine
└─ index.ts                      # core 包统一导出
```

## MCP Server

```text
packages/mcp-server/src
├─ server.ts                     # 独立 stdio MCP server 入口
└─ registerTools.ts              # 将 core toolRouter 注册为 MCP tools
```

MCP server 不包含核心业务，也不依赖 React UI；它只把 core tools 暴露给 MCP 客户端。

## 关键数据流

```text
用户输入
  ↓
apps/web/components/MessageInput
  ↓
apps/web/lib/streamClient.ts
  ↓
POST /api/chat Route Handler
  ↓
packages/core/chatEngine
  ↓
promptManager + contextManager
  ↓
llmClient 或 mockLLMClient
  ↓
thinkingMode 检测 tool_calls
  ↓
toolRouter 校验 runtimeInputSchema 并执行 tool
  ↓
artifactManager / memoryStore / fileStore
  ↓
ChatStreamEvent SSE 返回 UI
```

## 扩展建议

- 新增共享字段：先改 `packages/shared/src` 的类型和 schema，再改 core 与 UI。
- 新增工具：实现 `ToolDefinition`，同时提供 `modelInputSchema` 和 `runtimeInputSchema`，最后在 `runtime.ts` 注册。
- 新增存储后端：实现 `StorageAdapter`，替换 `LocalJsonStorageAdapter`，不要让业务模块直接写文件。
- 模型路线只保留 DeepSeek：扩展时只能围绕 DeepSeek `LLMClient`、`reasoning_content` 和 tool call 链路语义进行。
- 新增 Artifact renderer：放在 `packages/core/src/artifacts`，renderer 不依赖 LLM client。
- 新增联网能力：优先作为 core tool 实现，并通过 `WEB_ACCESS_ENABLED` 等环境变量控制范围和超时。
