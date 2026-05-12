import { z } from "zod";


// model.ts
export const ModelNameSchema = z.enum(["deepseek-v4-pro", "deepseek-v4-flash"]);
export type ModelName = z.infer<typeof ModelNameSchema>;

export const ThinkingTypeSchema = z.enum(["enabled", "disabled"]);
export type ThinkingType = z.infer<typeof ThinkingTypeSchema>;

export const ReasoningEffortSchema = z.enum(["high", "max"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ThinkingConfigSchema = z.object({
  type: ThinkingTypeSchema,
  reasoningEffort: ReasoningEffortSchema.optional()
});
export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;

export const AppModeSchema = z.enum([
  "chat",
  "thinking",
  "writing",
  "teaching",
  "planning",
  "coding",
  "multi-agent"
]);
export type AppMode = z.infer<typeof AppModeSchema>;


// usage.ts
export const PricingCurrencySchema = z.enum(["CNY", "USD"]);
export type PricingCurrency = z.infer<typeof PricingCurrencySchema>;

export const DeepSeekRawUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().default(0),
  completion_tokens: z.number().int().nonnegative().default(0),
  total_tokens: z.number().int().nonnegative().default(0),
  prompt_cache_hit_tokens: z.number().int().nonnegative().default(0),
  prompt_cache_miss_tokens: z.number().int().nonnegative().default(0),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().int().nonnegative().default(0)
  }).default({ reasoning_tokens: 0 })
});
export type DeepSeekRawUsage = z.infer<typeof DeepSeekRawUsageSchema>;

export const ModelUsageSummarySchema = z.object({
  model: ModelNameSchema,
  currency: PricingCurrencySchema,
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  promptCacheHitTokens: z.number().int().nonnegative(),
  promptCacheMissTokens: z.number().int().nonnegative(),
  cacheHitRatio: z.number().min(0).max(1),
  cost: z.number().nonnegative(),
  cacheSavings: z.number().nonnegative(),
  pricingSource: z.enum(["official", "cache", "fallback"])
});
export type ModelUsageSummary = z.infer<typeof ModelUsageSummarySchema>;

export const BudgetStateSchema = z.enum(["ok", "warning", "blocked"]);
export type BudgetState = z.infer<typeof BudgetStateSchema>;

export const BudgetStatusSchema = z.object({
  currency: PricingCurrencySchema,
  limit: z.number().positive(),
  sessionCost: z.number().nonnegative(),
  ratio: z.number().nonnegative(),
  state: BudgetStateSchema,
  message: z.string().optional()
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const UsageSummarySchema = z.object({
  turn: ModelUsageSummarySchema,
  session: ModelUsageSummarySchema,
  budget: BudgetStatusSchema
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const DeepSeekModelPricingSchema = z.object({
  model: ModelNameSchema,
  currency: PricingCurrencySchema,
  inputCacheHitPerMillion: z.number().nonnegative(),
  inputCacheMissPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative()
});
export type DeepSeekModelPricing = z.infer<typeof DeepSeekModelPricingSchema>;

export const DeepSeekPricingStatusSchema = z.object({
  currency: PricingCurrencySchema,
  sourceUrl: z.string().url(),
  source: z.enum(["official", "cache", "fallback"]),
  stale: z.boolean(),
  fetchedAt: z.string().nullable(),
  updatedAt: z.string(),
  error: z.string().optional(),
  models: z.array(DeepSeekModelPricingSchema)
});
export type DeepSeekPricingStatus = z.infer<typeof DeepSeekPricingStatusSchema>;


// tool.ts
export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string()
  })
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolCallStatusSchema = z.enum(["pending", "running", "success", "error"]);
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;

export const ToolCallStateSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  inputSummary: z.string(),
  status: ToolCallStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  resultSummary: z.string().optional(),
  error: z.string().optional()
});
export type ToolCallState = z.infer<typeof ToolCallStateSchema>;

export const ToolResultSchema = z.object({
  ok: z.boolean(),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.string(),
  summary: z.string(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean()
    })
    .optional()
});
export type ToolResult = z.infer<typeof ToolResultSchema>;


// message.ts
export const ContextKindSchema = z.enum(["work", "affect", "humor", "meta"]);
export type ContextKind = z.infer<typeof ContextKindSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable(),
  contextKind: ContextKindSchema.optional(),
  reasoning_content: z.string().nullable().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
  createdAt: z.string()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;


// token.ts
export const TokenUsageSchema = z.object({
  tokenizer: z.string(),
  source: z.literal("deepseek_v3_official"),
  draftTokens: z.number().int().nonnegative(),
  contextTokens: z.number().int().nonnegative(),
  contextBudgetTokens: z.number().int().positive(),
  contextRemainingTokens: z.number().int(),
  messageTokens: z.number().int().nonnegative()
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const TokenCountRequestSchema = z.object({
  draft: z.string().optional(),
  messages: z.array(ChatMessageSchema).optional()
}).strict();
export type TokenCountRequest = z.infer<typeof TokenCountRequestSchema>;


// task.ts
export const TaskTypeSchema = z.enum(["research.deep", "plan.execute"]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const AiTaskStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type AiTaskStatus = z.infer<typeof AiTaskStatusSchema>;

export const AiTaskSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  status: AiTaskStatusSchema,
  title: z.string(),
  input: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional()
});
export type AiTask = z.infer<typeof AiTaskSchema>;

export const AiTaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  eventType: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string()
});
export type AiTaskEvent = z.infer<typeof AiTaskEventSchema>;
export type TaskEvent = AiTaskEvent;

export const CreateTaskRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  type: TaskTypeSchema,
  title: z.string().min(1).max(160).optional(),
  input: z.record(z.string(), z.unknown()).optional()
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;


// artifact.ts
export const ArtifactTypeSchema = z.enum(["markdown", "html", "code", "report", "newspaper"]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  type: ArtifactTypeSchema,
  title: z.string(),
  content: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const CreateArtifactRequestSchema = z.object({
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type CreateArtifactRequest = z.infer<typeof CreateArtifactRequestSchema>;

export const UpdateArtifactRequestSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type UpdateArtifactRequest = z.infer<typeof UpdateArtifactRequestSchema>;


// canvas.ts
export const CanvasKindSchema = z.enum(["document", "code", "app", "diagram", "chart", "ppt"]);
export type CanvasKind = z.infer<typeof CanvasKindSchema>;

export const CanvasStatusSchema = z.enum(["streaming", "ready", "failed"]);
export type CanvasStatus = z.infer<typeof CanvasStatusSchema>;

export const CanvasBlockTypeSchema = z.enum([
  "section",
  "heading",
  "paragraph",
  "list",
  "taskList",
  "table",
  "quote",
  "callout",
  "code",
  "codeProject",
  "math",
  "mermaid",
  "vegaLite",
  "image",
  "divider",
  "embedHtml"
]);
export type CanvasBlockType = z.infer<typeof CanvasBlockTypeSchema>;

export type CanvasBlock = {
  id: string;
  type: CanvasBlockType;
  text?: string | undefined;
  attrs?: Record<string, unknown> | undefined;
  content?: CanvasBlock[] | undefined;
};

export const CanvasBlockSchema: z.ZodType<CanvasBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: CanvasBlockTypeSchema,
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(CanvasBlockSchema).optional()
  })
);

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

export const CanvasContentSchema = z.object({
  format: z.literal("block_ast_v1"),
  blocks: z.array(CanvasBlockSchema),
  deck: DeckSpecSchema.optional()
});
export type CanvasContent = z.infer<typeof CanvasContentSchema>;

export const CanvasSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  title: z.string(),
  kind: CanvasKindSchema,
  status: CanvasStatusSchema,
  contentJson: CanvasContentSchema,
  contentText: z.string(),
  summary: z.string().optional(),
  sourceMessageId: z.string().optional(),
  taskId: z.string().optional(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type Canvas = z.infer<typeof CanvasSchema>;
export type CanvasDocument = Canvas;

export const CanvasRevisionSchema = z.object({
  id: z.string(),
  canvasId: z.string(),
  version: z.number(),
  title: z.string(),
  contentJson: CanvasContentSchema,
  contentText: z.string(),
  reason: z.string(),
  createdAt: z.string()
});
export type CanvasRevision = z.infer<typeof CanvasRevisionSchema>;

export const CreateCanvasRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  title: z.string().min(1),
  kind: CanvasKindSchema,
  status: CanvasStatusSchema.optional(),
  contentJson: CanvasContentSchema.optional(),
  contentText: z.string().optional(),
  sourceMessageId: z.string().optional(),
  taskId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type CreateCanvasRequest = z.infer<typeof CreateCanvasRequestSchema>;

export const UpdateCanvasRequestSchema = z.object({
  title: z.string().min(1).optional(),
  status: CanvasStatusSchema.optional(),
  contentJson: CanvasContentSchema.optional(),
  contentText: z.string().optional(),
  summary: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type UpdateCanvasRequest = z.infer<typeof UpdateCanvasRequestSchema>;

export const CanvasActionSchema = z.enum([
  "auto_layout",
  "rewrite",
  "expand",
  "shorten",
  "tone",
  "translate",
  "outline",
  "extract_table",
  "to_chart",
  "to_diagram",
  "fix_code",
  "explain_code"
]);
export type CanvasAction = z.infer<typeof CanvasActionSchema>;

export const CanvasAiEditRequestSchema = z.object({
  action: CanvasActionSchema,
  instruction: z.string().optional(),
  selection: z.string().optional()
});
export type CanvasAiEditRequest = z.infer<typeof CanvasAiEditRequestSchema>;

export const CanvasExportFormatSchema = z.enum(["json", "markdown", "html", "pdf", "png", "docx", "pptx"]);
export type CanvasExportFormat = z.infer<typeof CanvasExportFormatSchema>;


// plan.ts
export const WorkflowTypeSchema = z.enum(["new_project", "troubleshooting", "iteration"]);
export type WorkflowType = z.infer<typeof WorkflowTypeSchema>;

export const PlanPhaseSchema = z.enum(["explore", "focus", "expand"]);
export type PlanPhase = z.infer<typeof PlanPhaseSchema>;

export const PlanStatusSchema = z.enum(["draft", "running", "done", "cancelled"]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanStepStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  planId: z.string(),
  stepOrder: z.number().int().nonnegative(),
  title: z.string(),
  status: PlanStepStatusSchema,
  result: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  workflowType: WorkflowTypeSchema,
  phase: PlanPhaseSchema,
  primaryGoal: z.string(),
  content: z.string(),
  status: PlanStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Plan = z.infer<typeof PlanSchema>;


// capability.ts
export const CapabilityFlagsSchema = z.object({
  multiAgent: z.boolean(),
  coding: z.boolean(),
  webSearch: z.boolean(),
  deepResearch: z.boolean(),
  canvas: z.boolean(),
  thinking: z.boolean(),
  teaching: z.boolean()
});
export type CapabilityFlags = z.infer<typeof CapabilityFlagsSchema>;

export const emptyCapabilityFlags: CapabilityFlags = {
  multiAgent: false,
  coding: false,
  webSearch: false,
  deepResearch: false,
  canvas: false,
  thinking: false,
  teaching: false
};

export const EmotionLabelSchema = z.object({
  state: z.enum(["frustrated", "anxious", "urgent"]),
  intensity: z.enum(["low", "medium", "high"]),
  sourcePhrase: z.string()
});
export type EmotionLabel = z.infer<typeof EmotionLabelSchema>;

export const RouteRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type RouteRiskLevel = z.infer<typeof RouteRiskLevelSchema>;

export const RouteSafetyMetadataSchema = z.object({
  requiresApproval: z.boolean(),
  approvalReasons: z.array(z.string()),
  riskLevel: RouteRiskLevelSchema
});
export type RouteSafetyMetadata = z.infer<typeof RouteSafetyMetadataSchema>;

export const RouteMetadataSchema = z.object({
  intent: z.string(),
  executionAllowed: z.boolean(),
  requiresClarification: z.boolean(),
  clarificationQuestions: z.array(z.string()),
  safety: RouteSafetyMetadataSchema
});
export type RouteMetadata = z.infer<typeof RouteMetadataSchema>;

const MethodologyLabelSchema = <T extends z.ZodTypeAny>(type: T) =>
  z.object({
    type,
    label: z.string(),
    reason: z.string()
  });

export const CapabilityContextSchema = z.object({
  workflow: MethodologyLabelSchema(WorkflowTypeSchema),
  phase: MethodologyLabelSchema(PlanPhaseSchema),
  flags: CapabilityFlagsSchema,
  emotion: EmotionLabelSchema.nullable(),
  primaryGoal: z.string(),
  reasons: z.array(z.string()),
  modePreference: AppModeSchema,
  route: RouteMetadataSchema.optional()
});
export type CapabilityContext = z.infer<typeof CapabilityContextSchema>;

export const CapabilitySourceModeSchema = z.enum([
  "methodology",
  "prototype",
  "deck",
  "image",
  "video",
  "tool",
  "design",
  "engineering",
  "writing"
]);
export type CapabilitySourceMode = z.infer<typeof CapabilitySourceModeSchema>;

export const CapabilitySourceLayerSchema = z.enum([
  "methodology",
  "artifact",
  "tool-runtime",
  "design-system",
  "engineering",
  "writing",
  "reference"
]);
export type CapabilitySourceLayer = z.infer<typeof CapabilitySourceLayerSchema>;

export const CapabilityDuplicateGroupSchema = z.object({
  id: z.string(),
  hash: z.string(),
  paths: z.array(z.string())
});
export type CapabilityDuplicateGroup = z.infer<typeof CapabilityDuplicateGroupSchema>;

export const CapabilitySourceSummarySchema = z.object({
  suite: z.string(),
  name: z.string(),
  path: z.string(),
  hash: z.string(),
  lineCount: z.number().int().nonnegative(),
  mode: CapabilitySourceModeSchema,
  layer: CapabilitySourceLayerSchema,
  duplicateGroup: z.string().nullable()
});
export type CapabilitySourceSummary = z.infer<typeof CapabilitySourceSummarySchema>;

export const CapabilitySourceManifestSchema = z.object({
  rootPath: z.string(),
  totalFiles: z.number().int().nonnegative(),
  sources: z.array(CapabilitySourceSummarySchema),
  duplicateGroups: z.array(CapabilityDuplicateGroupSchema)
});
export type CapabilitySourceManifest = z.infer<typeof CapabilitySourceManifestSchema>;

export type ChatRouteAction = "chat" | "deep_research" | "plan";

export type RouteToolMode = "chat" | "web" | "research" | "plan";

export interface RouteDecisionOptions {
  manualToolMode?: RouteToolMode | undefined;
  artifactMode?: boolean | undefined;
  canvasMode?: boolean | undefined;
  filesPresent?: boolean | undefined;
}

export interface RouteDecision {
  action: ChatRouteAction;
  flags: CapabilityFlags;
  canvasKind: CanvasKind;
  suppressed: {
    canvas: boolean;
    webSearch: boolean;
    multiAgent: boolean;
  };
  route: RouteMetadata;
  safety: RouteSafetyMetadata;
  reasons: string[];
}

const negativeRules = {
  canvas: /(不要|不用|别|无需).{0,8}(canvas|画布|右侧|右边|侧边)|只在聊天|直接在聊天|don.{0,8}(use|put).{0,8}canvas|no\s+canvas|just\s+chat/i,
  webSearch: /(不要|不用|别|无需).{0,8}(联网|搜索|web|查网|上网)/i,
  multiAgent: /(不要|不用|别|无需).{0,8}(多角度|multi-agent|多 agent|多智能体)/i,
  chatOnly: /(不要|不用|别|无需).{0,8}(canvas|画布|计划|plan)|只在聊天|直接在聊天|就在聊天/i
};

const taskRules = {
  deckBuild: /(?:(?:帮我|给我|请).{0,8})?(做|重做|重作|重新做|重新制作|重新生成|再做|改做|创建|生成|设计|制作|写|产出|输出).{0,24}(PPT|幻灯片|演示文稿|deck|slides?)/i,
  build: /(帮我|给我|请|做|重做|重作|重新做|重新制作|重新生成|再做|改做|创建|生成|设计|实现|开发|搭一个|写一个).{0,24}(登录页面|页面|网页|网站|原型|demo|组件|功能|系统|应用|app|界面|技术方案|实施方案|项目方案|PPT|幻灯片|演示文稿|deck|slides?)/i,
  plan: /(生成|制定|创建|做|给我|帮我).{0,16}(执行计划|计划|任务拆解|步骤拆解|实施路线|roadmap)|\bplan\b/i,
  deepResearch: /(深度研究|深入研究|系统研究|深度调研|深入调研|系统调研|全面调研|研究一下|调研一下|research)/i,
  longForm: /(申论|作文|论文|稿件|演讲稿|材料|公文|评论|读后感|文章|报告|方案|文档|计划书|小说|长文|html|网页|页面|demo|PPT|幻灯片|演示文稿|原型)/i,
  longAction: /(写|撰写|生成|创建|做|重做|重作|重新做|重新制作|重新生成|再做|改做|整理|输出|起草|制作|产出).{0,36}(申论|作文|论文|稿件|演讲稿|材料|公文|评论|读后感|文章|报告|方案|文档|计划书|小说|长文|html|网页|页面|demo|PPT|幻灯片|演示文稿|原型|图表|流程图|表格|代码)/i,
  wordCount: /(\d{3,5}\s*字|[一二三四五六七八九十百千万]+字|千字|长一点|详细展开|完整写)/i
};

const assistiveRules = {
  teaching: /(教我|讲一下|讲解|解释|怎么用|如何理解|学习|入门|teach|explain|how to|想了解|介绍.*(流程|架构|框架|体系)|请问.*(流程|架构|怎么|如何))/i
};

const toolRules = {
  webSearch: /(最新|当前|今天|现在的|联网|搜索|查一下|查找|资料来源|官方文档|官网|新闻|公告|latest|current|search|web)/i,
  casualTime: /(今天|现在|当前).{0,6}(天气|怎么样|如何|好吗|如何呢|几点|日期|北京时间|time|date|周末|星期)/i,
  currentTime: /(现在|当前|今天|北京|几点|日期|time|date|today|now)/i,
  deepSeekNews: /deepseek/i,
  fileRead: /(文件|附件|图片|图像|识别|读取|总结|分析|看一下|看图|ocr|image|file|attachment)/i
};

const routeSafetyRules = {
  discussionOnly: /(discuss|talk through|walk through).{0,48}(first|before|instead)|do not .{0,32}(edit|execute|start|run|launch|modify)|don't .{0,32}(edit|execute|start|run|launch|modify)|no\s+(agents?|tools?|edits?|execution)|先.{0,12}(商量|讨论|确认)|不要.{0,12}(动手|执行|修改|派发)/i,
  writeOrExecute: /(modify|edit|write|delete|overwrite|run tests?|execute|deploy|launch|start agents?|apply patch|commit|push|rm\s+-rf|remove-item|执行|运行|修改|写入|删除|覆盖|部署|启动|派发)/i,
  agentLaunch: /(start|launch|dispatch|run).{0,20}(agent|claude|subagent)|agent\s+(run|execution|launch|dispatch)|派发|启动.*agent/i
};

const capabilityRules = {
  coding: /(代码|编程|函数|脚本|调试|运行|报错|bug|修复|单元测试|typescript|javascript|tsx|jsx|python|```|terminal|终端|验证)/i,
  multiAgent: /(多角度|多方案|对比|权衡|取舍|多角色|多智能体|multi-agent|综合分析|架构评审|评估.*方案|风险.*收益|跨领域)/i,
  thinking: /(复杂|推理|逻辑|证明|数学|分析|根因|为什么|权衡|取舍|矛盾|系统性|架构|设计决策)/i
};

export function inferRouteDecision(text: string, options: RouteDecisionOptions = {}): RouteDecision {
  const suppressed = {
    canvas: negativeRules.canvas.test(text),
    webSearch: negativeRules.webSearch.test(text),
    multiAgent: negativeRules.multiAgent.test(text)
  };
  const chatOnly = negativeRules.chatOnly.test(text);
  const manualCanvas = Boolean(options.canvasMode || options.artifactMode);
  const manualToolMode = options.manualToolMode ?? "chat";
  const canvasKind = inferRouteCanvasKind(text);
  const deckTeachingQuestion = /(教我|怎么|如何|how to).{0,12}(做|重做|重作|重新做|重新制作|重新生成|再做|改做|制作|生成|设计|写).{0,12}(PPT|幻灯片|演示文稿|deck|slides?)/i.test(text);
  const deckBuildTask = taskRules.deckBuild.test(text) && !deckTeachingQuestion;
  const buildTask = taskRules.build.test(text) && !deckTeachingQuestion;
  const durableOutput = !suppressed.canvas && !deckTeachingQuestion && (
    taskRules.longAction.test(text)
    || taskRules.wordCount.test(text)
    || (taskRules.longForm.test(text) && /(写|生成|创建|输出|整理|做|重做|重作|重新做|重新制作|重新生成|再做|改做|制作|产出)/i.test(text))
  );
  const flags: CapabilityFlags = { ...emptyCapabilityFlags };
  const reasons: string[] = [];

  let action: ChatRouteAction = "chat";
  if (manualToolMode === "research") {
    action = "deep_research";
    flags.deepResearch = true;
    reasons.push("手动选择深度研究");
  } else if (manualToolMode === "plan") {
    action = "plan";
    reasons.push("手动选择计划模式");
  } else if (manualToolMode === "web") {
    flags.webSearch = true;
    reasons.push("手动选择联网模式");
  } else if (!chatOnly && taskRules.deepResearch.test(text)) {
    action = "deep_research";
    flags.deepResearch = true;
    reasons.push("检测到深度研究/调研任务");
  } else if (!chatOnly && (taskRules.plan.test(text) || buildTask || deckBuildTask)) {
    action = "plan";
    reasons.push(deckBuildTask ? "检测到 PPT/Deck 制作任务" : "检测到任务计划或产出型任务");
  }

  flags.teaching = assistiveRules.teaching.test(text) && !deckBuildTask && !manualCanvas && !durableOutput && action !== "plan";
  const hasCodeBlocks = /```|`[^`]+`/.test(text);
  flags.coding = (!flags.teaching || hasCodeBlocks) && capabilityRules.coding.test(text);
  flags.multiAgent = !suppressed.multiAgent && (capabilityRules.multiAgent.test(text) || (flags.coding && /(多角度|多方|多方案|评估.*方案|审查.*代码|架构评审|综合分析|review.*code|audit)/i.test(text)));
  flags.webSearch = flags.webSearch || (!suppressed.webSearch && toolRules.webSearch.test(text) && !toolRules.casualTime.test(text));
  flags.canvas = manualCanvas || (!suppressed.canvas && (durableOutput || (action === "plan" && (deckBuildTask || buildTask))));
  flags.thinking = capabilityRules.thinking.test(text) || flags.multiAgent;

  if (flags.coding) reasons.push("检测到代码、调试或验证意图");
  if (flags.multiAgent) reasons.push("检测到多角度/综合分析意图");
  if (flags.webSearch) reasons.push("检测到联网或最新信息需求");
  if (flags.canvas) reasons.push(manualCanvas ? "手动选择 Canvas/Artifact 输出" : "检测到长文或可持久化输出");
  if (flags.thinking) reasons.push("检测到复杂推理或分析需求");
  if (flags.teaching) reasons.push("检测到教学/解释意图");
  if (suppressed.canvas) reasons.push("用户文本抑制自动 Canvas");
  if (suppressed.webSearch) reasons.push("用户文本抑制自动联网");
  if (suppressed.multiAgent) reasons.push("用户文本抑制多角度分析");
  if (toolRules.currentTime.test(text)) reasons.push("检测到时间查询");
  if (options.filesPresent && toolRules.fileRead.test(text)) reasons.push("检测到文件读取需求");
  if (toolRules.deepSeekNews.test(text) && /(官方|新闻|公告|news|announcement|latest|最新|今天)/i.test(text)) reasons.push("检测到 DeepSeek 官方信息需求");

  const route = inferRouteMetadata(text, action, flags);
  return { action, flags, canvasKind, suppressed, route, safety: route.safety, reasons: unique(reasons) };
}

export function inferChatRouteAction(text: string): ChatRouteAction {
  return inferRouteDecision(text).action;
}

function inferRouteMetadata(text: string, action: ChatRouteAction, flags: CapabilityFlags): RouteMetadata {
  const discussionOnly = routeSafetyRules.discussionOnly.test(text);
  if (discussionOnly) {
    return {
      intent: "discussion_only",
      executionAllowed: false,
      requiresClarification: true,
      clarificationQuestions: ["Confirm task boundaries, allowed file changes, and approval conditions before execution."],
      safety: {
        requiresApproval: true,
        approvalReasons: ["The user asked to discuss or clarify before taking execution actions."],
        riskLevel: "low"
      }
    };
  }

  const writeOrExecute = routeSafetyRules.writeOrExecute.test(text);
  const agentLaunch = routeSafetyRules.agentLaunch.test(text);
  const approvalReasons: string[] = [];
  if (flags.webSearch) approvalReasons.push("Web access may leave the local workspace and needs explicit authorization.");
  if (flags.deepResearch) approvalReasons.push("Deep research can be long running or source-dependent.");
  if (writeOrExecute) approvalReasons.push("The request appears to involve writes, command execution, or tests.");
  if (agentLaunch) approvalReasons.push("The request appears to involve starting or dispatching agents.");

  const riskLevel: RouteRiskLevel = writeOrExecute || agentLaunch
    ? "high"
    : flags.webSearch || flags.deepResearch
      ? "medium"
      : "low";

  return {
    intent: inferRouteIntent(action, flags, writeOrExecute),
    executionAllowed: true,
    requiresClarification: false,
    clarificationQuestions: [],
    safety: {
      requiresApproval: approvalReasons.length > 0,
      approvalReasons: unique(approvalReasons),
      riskLevel
    }
  };
}

function inferRouteIntent(action: ChatRouteAction, flags: CapabilityFlags, writeOrExecute: boolean): string {
  if (action === "deep_research") return "deep_research";
  if (action === "plan") return "plan";
  if (writeOrExecute || flags.coding) return "work_execution";
  if (flags.webSearch) return "fresh_information";
  if (flags.teaching) return "teaching";
  return "general_chat";
}

function inferRouteCanvasKind(text: string): CanvasKind {
  if (/\b(ppt|slides?|deck)\b|幻灯片|演示文稿/i.test(text)) return "ppt";
  if (/mermaid|流程图|flowchart|sequenceDiagram|graph\s+(TD|LR)/i.test(text)) return "diagram";
  if (/vega|图表|chart|柱状图|折线图|饼图|可视化/i.test(text)) return "chart";
  if (/<html|<!doctype|React|组件|页面|网页|app|demo/i.test(text)) return "app";
  if (/```|代码|function|class|interface|const\s+\w+|def\s+\w+/i.test(text)) return "code";
  return "document";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}


// memory.ts
export const MemoryTierSchema = z.enum(["daily", "weekly", "longterm", "fact"]);
export type MemoryTier = z.infer<typeof MemoryTierSchema>;

export const MemoryItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  confidence: z.number(),
  tier: MemoryTierSchema.optional(),
  tags: z.array(z.string()),
  expiresAt: z.string().optional()
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type ResolvedMemoryItem = MemoryItem & { tier: MemoryTier };
export type MemoryGroupedByTier = Record<MemoryTier, ResolvedMemoryItem[]>;

export const MemoryCandidateSchema = z.object({
  id: z.string(),
  content: z.string(),
  source: z.string(),
  confidence: z.number(),
  tags: z.array(z.string()),
  reason: z.string()
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export const ConfirmMemoryRequestSchema = z.object({
  candidateId: z.string(),
  conversationId: z.string().min(1)
});
export type ConfirmMemoryRequest = z.infer<typeof ConfirmMemoryRequestSchema>;

export const memoryTiers = MemoryTierSchema.options;

export function resolveMemoryTier(item: Pick<MemoryItem, "tags"> & { tier?: MemoryTier | undefined }): MemoryTier {
  if (item.tier && MemoryTierSchema.safeParse(item.tier).success) return item.tier;
  const tierTag = item.tags.find((tag) => tag.startsWith("tier:"));
  const parsed = MemoryTierSchema.safeParse(tierTag?.slice("tier:".length));
  return parsed.success ? parsed.data : "fact";
}

export function withResolvedMemoryTier(item: MemoryItem): ResolvedMemoryItem {
  return { ...item, tier: resolveMemoryTier(item) };
}

export function groupMemoryByTier(items: MemoryItem[]): MemoryGroupedByTier {
  const grouped: MemoryGroupedByTier = {
    daily: [],
    weekly: [],
    longterm: [],
    fact: []
  };
  for (const item of items) {
    const resolved = withResolvedMemoryTier(item);
    grouped[resolved.tier].push(resolved);
  }
  return grouped;
}

export function filterMemoryItems(
  items: MemoryItem[],
  filter: {
    tier?: MemoryTier | undefined;
    query?: string | undefined;
  } = {}
): ResolvedMemoryItem[] {
  const query = filter.query?.trim().toLocaleLowerCase();
  return items
    .map(withResolvedMemoryTier)
    .filter((item) => !filter.tier || item.tier === filter.tier)
    .filter((item) => {
      if (!query) return true;
      return [item.content, item.source, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query));
    });
}


// stream.ts
export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("capability.hints"), flags: CapabilityFlagsSchema, reasons: z.array(z.string()).optional() }),
  z.object({ type: z.literal("message.delta"), content: z.string() }),
  z.object({ type: z.literal("message.done"), messageId: z.string(), content: z.string(), usageSummary: UsageSummarySchema.optional() }),
  z.object({ type: z.literal("usage.updated"), summary: UsageSummarySchema }),
  z.object({ type: z.literal("reasoning.raw"), messageId: z.string(), content: z.string() }),
  z.object({ type: z.literal("reasoning.summary"), summary: z.string() }),
  z.object({ type: z.literal("tool.status"), state: ToolCallStateSchema }),
  z.object({ type: z.literal("artifact.created"), artifact: ArtifactSchema }),
  z.object({ type: z.literal("canvas.started"), canvas: CanvasSchema }),
  z.object({ type: z.literal("canvas.text_delta"), canvasId: z.string(), content: z.string() }),
  z.object({ type: z.literal("canvas.patch"), canvasId: z.string(), contentJson: CanvasContentSchema }),
  z.object({ type: z.literal("canvas.done"), canvas: CanvasSchema }),
  z.object({ type: z.literal("canvas.error"), canvasId: z.string().optional(), message: z.string() }),
  z.object({ type: z.literal("memory.candidate"), candidate: MemoryCandidateSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() })
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;


// storage.ts
export const StorageErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean()
});
export type StorageError = z.infer<typeof StorageErrorSchema>;

export type Result<T, E = StorageError> =
  | { ok: true; value: T }
  | { ok: false; error: E };


// settings.ts
export const ApiKeySettingsSchema = z.object({
  hasApiKey: z.boolean(),
  maskedApiKey: z.string().nullable()
});
export type ApiKeySettings = z.infer<typeof ApiKeySettingsSchema>;

export const IntegrationPathSettingsSchema = z.object({
  configured: z.boolean(),
  path: z.string().nullable()
});
export type IntegrationPathSettings = z.infer<typeof IntegrationPathSettingsSchema>;

export const ObsidianIntegrationSettingsSchema = z.object({
  configured: z.boolean(),
  vaultPath: z.string().nullable(),
  exportFolder: z.string()
});
export type ObsidianIntegrationSettings = z.infer<typeof ObsidianIntegrationSettingsSchema>;

export const PluginLoadStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["loaded", "skipped", "failed"]),
  tools: z.array(z.string()),
  errors: z.array(z.string()).default([])
});
export type PluginLoadStatus = z.infer<typeof PluginLoadStatusSchema>;

export const IntegrationSettingsSchema = z.object({
  pluginDir: IntegrationPathSettingsSchema,
  obsidian: ObsidianIntegrationSettingsSchema,
  plugins: z.array(PluginLoadStatusSchema).default([])
});
export type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>;

export const AppSettingsSchema = z.object({
  deepSeek: ApiKeySettingsSchema,
  integrations: IntegrationSettingsSchema.optional(),
  pricing: DeepSeekPricingStatusSchema.optional(),
  budget: BudgetStatusSchema.optional()
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SaveApiKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required").max(500)
});
export type SaveApiKeyRequest = z.infer<typeof SaveApiKeyRequestSchema>;

export const SaveBudgetRequestSchema = z.object({
  currency: PricingCurrencySchema,
  limit: z.number().positive().max(100000)
});
export type SaveBudgetRequest = z.infer<typeof SaveBudgetRequestSchema>;

export const SaveIntegrationsRequestSchema = z.object({
  pluginDir: z.string().trim().max(1000).optional().nullable(),
  obsidianVaultPath: z.string().trim().max(1000).optional().nullable(),
  obsidianExportFolder: z.string().trim().min(1).max(200).optional().nullable()
});
export type SaveIntegrationsRequest = z.infer<typeof SaveIntegrationsRequestSchema>;


// file.ts
export const FileChunkSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  index: z.number(),
  content: z.string(),
  tokenEstimate: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type FileChunk = z.infer<typeof FileChunkSchema>;

export const UploadedFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  status: z.enum(["parsed", "error"]),
  chunkCount: z.number(),
  createdAt: z.string(),
  error: z.string().optional()
});
export type UploadedFile = z.infer<typeof UploadedFileSchema>;


// conversation.ts
export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(ChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationRequestSchema = z.object({
  title: z.string().min(1).max(160).optional()
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const UpdateConversationRequestSchema = z.object({
  title: z.string().min(1).max(160).optional()
});
export type UpdateConversationRequest = z.infer<typeof UpdateConversationRequestSchema>;

export const AppendMessagesRequestSchema = z.object({
  messages: z.array(ChatMessageSchema)
});
export type AppendMessagesRequest = z.infer<typeof AppendMessagesRequestSchema>;


// context.ts
export const ContextBlockSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable().optional(),
  sourceType: z.enum(["manual", "user_memory", "research_result", "plan", "task_result"]),
  channel: z.string(),
  title: z.string(),
  content: z.string(),
  enabled: z.boolean(),
  weight: z.number(),
  messageId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ContextBlock = z.infer<typeof ContextBlockSchema>;
export type ContextItem = ContextBlock;

export const GeneratePlanRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  prompt: z.string().min(1).max(12000)
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;

export const ExecutePlanRequestSchema = z.object({
  content: z.string().min(1).max(40000).optional(),
  currency: PricingCurrencySchema.default("CNY")
});
export type ExecutePlanRequest = z.infer<typeof ExecutePlanRequestSchema>;

export const UpdatePlanRequestSchema = z.object({
  content: z.string().min(1).max(40000).optional(),
  primaryGoal: z.string().min(1).max(500).optional()
});
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;


// code.ts
export const CodeExecutionResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  durationMs: z.number(),
  timedOut: z.boolean()
});
export type CodeExecutionResult = z.infer<typeof CodeExecutionResultSchema>;

export const CodeExecutionRequestSchema = z.object({
  language: z.enum(["javascript", "typescript"]),
  code: z.string().min(1)
});
export type CodeExecutionRequest = z.infer<typeof CodeExecutionRequestSchema>;


// card.ts
export const CardTypeSchema = z.enum(["chat", "plan", "canvas"]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardSchema = z.object({
  id: z.string(),
  type: CardTypeSchema,
  sourceId: z.string(),
  title: z.string(),
  summary: z.string(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Card = z.infer<typeof CardSchema>;

export const CardListFilterSchema = z.object({
  type: CardTypeSchema.optional(),
  archived: z.boolean().optional(),
  search: z.string().optional(),
  conversationId: z.string().optional()
});
export type CardListFilter = z.infer<typeof CardListFilterSchema>;


// canvasProject.ts
export const CanvasProjectKindSchema = z.enum([
  "document",
  "prototype",
  "deck",
  "app",
  "diagram",
  "chart",
  "image",
  "image_set",
  "video",
  "tool",
  "data"
]);
export type CanvasProjectKind = z.infer<typeof CanvasProjectKindSchema>;

export const CanvasProjectEngineSchema = z.enum([
  "document",
  "prototype",
  "deck",
  "image",
  "video",
  "tool",
  "legacy_artifact"
]);
export type CanvasProjectEngine = z.infer<typeof CanvasProjectEngineSchema>;

export const CanvasProjectStatusSchema = z.enum(["active", "archived", "failed"]);
export type CanvasProjectStatus = z.infer<typeof CanvasProjectStatusSchema>;

export const CanvasStudioJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type CanvasStudioJobStatus = z.infer<typeof CanvasStudioJobStatusSchema>;

export const CanvasExportJobFormatSchema = z.enum(["markdown", "html", "pdf", "png", "docx", "pptx", "mp4", "webm", "zip", "json"]);
export type CanvasExportJobFormat = z.infer<typeof CanvasExportJobFormatSchema>;

export const AssetHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const CanvasProjectSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  title: z.string(),
  kind: CanvasProjectKindSchema,
  engine: CanvasProjectEngineSchema,
  status: CanvasProjectStatusSchema,
  currentVersionId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CanvasProject = z.infer<typeof CanvasProjectSchema>;

export const CanvasProjectFileSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  role: z.string(),
  contentHash: AssetHashSchema.optional(),
  textContent: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CanvasProjectFile = z.infer<typeof CanvasProjectFileSchema>;

export const CanvasNodeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().optional(),
  nodeType: z.string(),
  orderIndex: z.number(),
  contentJson: z.record(z.string(), z.unknown()),
  text: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasProjectVersionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionNumber: z.number(),
  reason: z.string(),
  snapshotJson: z.record(z.string(), z.unknown()),
  createdBy: z.string().optional(),
  createdAt: z.string()
});
export type CanvasProjectVersion = z.infer<typeof CanvasProjectVersionSchema>;

export const AssetBlobSchema = z.object({
  hash: AssetHashSchema,
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  storageUri: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string()
});
export type AssetBlob = z.infer<typeof AssetBlobSchema>;

export const CanvasAssetLinkSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  assetHash: AssetHashSchema,
  role: z.string(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string()
});
export type CanvasAssetLink = z.infer<typeof CanvasAssetLinkSchema>;

export const CanvasRenderJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionId: z.string().optional(),
  engine: CanvasProjectEngineSchema,
  status: CanvasStudioJobStatusSchema,
  inputJson: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CanvasRenderJob = z.infer<typeof CanvasRenderJobSchema>;

export const CanvasExportJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionId: z.string().optional(),
  format: CanvasExportJobFormatSchema,
  status: CanvasStudioJobStatusSchema,
  optionsJson: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CanvasExportJob = z.infer<typeof CanvasExportJobSchema>;
export type CanvasStudioJob = CanvasRenderJob | CanvasExportJob;

export const CanvasOutputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  jobId: z.string().optional(),
  outputType: z.string(),
  assetHash: AssetHashSchema.optional(),
  storageUri: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string()
});
export type CanvasOutput = z.infer<typeof CanvasOutputSchema>;

export const CanvasReviewReportSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionId: z.string().optional(),
  scope: z.string(),
  scoreJson: z.record(z.string(), z.unknown()),
  findingsJson: z.array(z.unknown()),
  createdAt: z.string()
});
export type CanvasReviewReport = z.infer<typeof CanvasReviewReportSchema>;

export const MethodologyStateSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  projectId: z.string().optional(),
  workflowType: z.string(),
  phase: z.string(),
  primaryFocus: z.string(),
  stateJson: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type MethodologyState = z.infer<typeof MethodologyStateSchema>;

export const UpsertCanvasProjectFileRequestSchema = z.object({
  path: z.string().min(1),
  role: z.string().min(1).optional(),
  contentHash: AssetHashSchema.optional(),
  textContent: z.string().optional()
}).strict();
export type UpsertCanvasProjectFileRequest = z.infer<typeof UpsertCanvasProjectFileRequestSchema>;

export const UpsertCanvasNodeRequestSchema = z.object({
  id: z.string().optional(),
  parentId: z.string().optional(),
  nodeType: z.string().min(1),
  orderIndex: z.number().int().nonnegative().optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  text: z.string().optional()
}).strict();
export type UpsertCanvasNodeRequest = z.infer<typeof UpsertCanvasNodeRequestSchema>;

export const CreateCanvasProjectVersionRequestSchema = z.object({
  reason: z.string().min(1),
  snapshotJson: z.record(z.string(), z.unknown()),
  createdBy: z.string().optional()
}).strict();
export type CreateCanvasProjectVersionRequest = z.infer<typeof CreateCanvasProjectVersionRequestSchema>;

export const CreateCanvasProjectRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  title: z.string().min(1),
  kind: CanvasProjectKindSchema,
  engine: CanvasProjectEngineSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  files: z.array(UpsertCanvasProjectFileRequestSchema).optional(),
  nodes: z.array(UpsertCanvasNodeRequestSchema).optional(),
  initialVersion: CreateCanvasProjectVersionRequestSchema.optional()
}).strict();
export type CreateCanvasProjectRequest = z.infer<typeof CreateCanvasProjectRequestSchema>;

export const UploadCanvasAssetRequestSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  dataBase64: z.string().min(1),
  mime: z.string().min(1),
  extension: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();
export type UploadCanvasAssetRequest = z.infer<typeof UploadCanvasAssetRequestSchema>;

export const LinkCanvasAssetRequestSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  assetHash: AssetHashSchema,
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();
export type LinkCanvasAssetRequest = z.infer<typeof LinkCanvasAssetRequestSchema>;

export const CreateCanvasOutputRequestSchema = z.object({
  jobId: z.string().optional(),
  outputType: z.string().min(1),
  assetHash: AssetHashSchema.optional(),
  storageUri: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();
export type CreateCanvasOutputRequest = z.infer<typeof CreateCanvasOutputRequestSchema>;

export const CreateCanvasRenderJobRequestSchema = z.object({
  type: z.literal("render"),
  versionId: z.string().optional(),
  engine: CanvasProjectEngineSchema.optional(),
  inputJson: z.record(z.string(), z.unknown()).optional()
}).strict();
export type CreateCanvasRenderJobRequest = z.infer<typeof CreateCanvasRenderJobRequestSchema>;

export const CreateCanvasExportJobRequestSchema = z.object({
  type: z.literal("export"),
  versionId: z.string().optional(),
  format: CanvasExportJobFormatSchema,
  optionsJson: z.record(z.string(), z.unknown()).optional()
}).strict();
export type CreateCanvasExportJobRequest = z.infer<typeof CreateCanvasExportJobRequestSchema>;

export const CreateCanvasStudioJobRequestSchema = z.discriminatedUnion("type", [
  CreateCanvasRenderJobRequestSchema,
  CreateCanvasExportJobRequestSchema
]);
export type CreateCanvasStudioJobRequest = z.infer<typeof CreateCanvasStudioJobRequestSchema>;

export const CreateCanvasReviewReportRequestSchema = z.object({
  versionId: z.string().optional(),
  scope: z.string().min(1),
  scoreJson: z.record(z.string(), z.unknown()).optional(),
  findingsJson: z.array(z.unknown()).optional()
}).strict();
export type CreateCanvasReviewReportRequest = z.infer<typeof CreateCanvasReviewReportRequestSchema>;

export const UpsertMethodologyStateRequestSchema = z.object({
  workflowType: z.string().min(1),
  phase: z.string().min(1),
  primaryFocus: z.string().min(1),
  stateJson: z.record(z.string(), z.unknown()).optional()
}).strict();
export type UpsertMethodologyStateRequest = z.infer<typeof UpsertMethodologyStateRequestSchema>;

export const CreateEvidenceItemRequestSchema = z.object({
  type: z.literal("evidence"),
  sourceType: z.string().min(1),
  claim: z.string().min(1),
  confidence: z.number().min(0).max(1),
  citation: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

export const CreateContradictionItemRequestSchema = z.object({
  type: z.literal("contradiction"),
  subjectA: z.string().min(1),
  subjectB: z.string().min(1),
  nature: z.string().min(1),
  rank: z.string().min(1),
  dominantSide: z.string().min(1),
  risk: z.string().optional()
}).strict();

export const UpsertFocusLockRequestSchema = z.object({
  type: z.literal("focus_lock"),
  target: z.string().min(1),
  doneSignal: z.string().optional(),
  pausedItems: z.array(z.string()).optional()
}).strict();

export const CreateValidationCycleRequestSchema = z.object({
  type: z.literal("validation_cycle"),
  hypothesis: z.string().min(1),
  action: z.string().min(1),
  expected: z.string().optional(),
  actual: z.string().optional(),
  learning: z.string().optional()
}).strict();

export const CreateFeedbackSynthesisRequestSchema = z.object({
  type: z.literal("feedback_synthesis"),
  sources: z.array(z.string()),
  agreements: z.array(z.string()),
  conflicts: z.array(z.string()),
  gaps: z.array(z.string())
}).strict();

export const CreateMethodologyItemRequestSchema = z.discriminatedUnion("type", [
  CreateEvidenceItemRequestSchema,
  CreateContradictionItemRequestSchema,
  UpsertFocusLockRequestSchema,
  CreateValidationCycleRequestSchema,
  CreateFeedbackSynthesisRequestSchema
]);
export type CreateMethodologyItemRequest = z.infer<typeof CreateMethodologyItemRequestSchema>;

export const CanvasProjectBundleSchema = z.object({
  project: CanvasProjectSchema,
  nodes: z.array(CanvasNodeSchema),
  files: z.array(CanvasProjectFileSchema),
  versions: z.array(CanvasProjectVersionSchema),
  assets: z.array(CanvasAssetLinkSchema),
  renderJobs: z.array(CanvasRenderJobSchema),
  exportJobs: z.array(CanvasExportJobSchema),
  outputs: z.array(CanvasOutputSchema),
  reviews: z.array(CanvasReviewReportSchema),
  methodologyState: MethodologyStateSchema.optional()
});
export type CanvasProjectBundle = z.infer<typeof CanvasProjectBundleSchema>;


// api.ts
export const ChatRequestSchema = z.object({
  id: z.string(),
  mode: AppModeSchema,
  model: ModelNameSchema,
  thinking: ThinkingConfigSchema,
  messages: z.array(ChatMessageSchema),
  conversationId: z.string().optional(),
  files: z.array(UploadedFileSchema).optional(),
  artifactMode: z.boolean().optional(),
  canvasMode: z.boolean().optional(),
  canvasKind: CanvasKindSchema.optional(),
  currency: PricingCurrencySchema.default("CNY"),
  stream: z.boolean().optional()
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  id: z.string(),
  message: ChatMessageSchema,
  artifacts: z.array(ArtifactSchema),
  canvases: z.array(CanvasSchema).optional(),
  toolCalls: z.array(ToolCallStateSchema),
  reasoningSummary: z.string().optional(),
  rawReasoning: z.string().optional(),
  usageSummary: UsageSummarySchema.optional()
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema })
  ]);


// agent.ts
export const AgentNameSchema = z.enum([
  "coordinator",
  "researcher",
  "writer",
  "teacher",
  "coder"
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const AgentLimitsSchema = z.object({
  maxRounds: z.number(),
  maxTokens: z.number()
});
export type AgentLimits = z.infer<typeof AgentLimitsSchema>;
