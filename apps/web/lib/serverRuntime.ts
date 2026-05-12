import { createRuntime } from "@pinocchio/core/runtime";
import { getEnv, type AppEnv } from "@pinocchio/core/config/env";

type RuntimeState = ReturnType<typeof createRuntime>;

const globalRuntime = globalThis as typeof globalThis & {
  __deepseekWorkbenchRuntime?: RuntimeState;
  __deepseekWorkbenchRuntimeKey?: string;
};

const runtimeCacheSchemaVersion = 3;
const requiredRuntimeKeys: (keyof RuntimeState)[] = [
  "chatEngine",
  "workspace",
  "conversationStore",
  "cardStore",
  "canvasStore",
  "canvasRevisionStore",
  "canvasService",
  "canvasStudioStore",
  "canvasAssetStore",
  "canvasAssetRegistry",
  "methodologyRepository",
  "artifactManager",
  "budgetService",
  "usageTracker",
  "planStore",
  "taskStore",
  "tokenCounter",
  "memoryStore",
  "fileStore",
  "toolRouter"
];

export function getRuntime() {
  const env = getEnv();
  const key = runtimeKey(env);
  if (
    !globalRuntime.__deepseekWorkbenchRuntime ||
    globalRuntime.__deepseekWorkbenchRuntimeKey !== key ||
    !isRuntimeCompatible(globalRuntime.__deepseekWorkbenchRuntime)
  ) {
    closeRuntime(globalRuntime.__deepseekWorkbenchRuntime);
    globalRuntime.__deepseekWorkbenchRuntime = createRuntime(env);
    globalRuntime.__deepseekWorkbenchRuntimeKey = key;
  }
  return globalRuntime.__deepseekWorkbenchRuntime;
}

export function resetRuntime() {
  const env = getEnv();
  closeRuntime(globalRuntime.__deepseekWorkbenchRuntime);
  globalRuntime.__deepseekWorkbenchRuntime = createRuntime(env);
  globalRuntime.__deepseekWorkbenchRuntimeKey = runtimeKey(env);
  return globalRuntime.__deepseekWorkbenchRuntime;
}

export function isRuntimeCompatible(runtime: unknown): runtime is RuntimeState {
  if (!runtime || typeof runtime !== "object") return false;
  const candidate = runtime as Partial<Record<keyof RuntimeState, unknown>>;
  return requiredRuntimeKeys.every((key) => candidate[key] != null);
}

function runtimeKey(env: AppEnv) {
  return JSON.stringify({
    runtimeCacheSchemaVersion,
    deepSeekConfigured: Boolean(env.DEEPSEEK_API_KEY),
    model: env.DEFAULT_MODEL,
    thinking: env.DEFAULT_THINKING,
    reasoning: env.DEFAULT_REASONING_EFFORT,
    budgetCny: env.DEEPSEEK_SESSION_BUDGET_CNY,
    budgetUsd: env.DEEPSEEK_SESSION_BUDGET_USD,
    pluginDir: env.WORKBENCH_PLUGIN_DIR,
    dataDir: env.WORKBENCH_DATA_DIR,
    obsidianVaultPath: env.OBSIDIAN_VAULT_PATH,
    obsidianExportFolder: env.OBSIDIAN_EXPORT_FOLDER,
    showRawReasoning: env.SHOW_RAW_REASONING,
    mockLlm: env.E2E_MOCK_LLM,
    mockLlmAllowed: env.E2E_MOCK_LLM_ALLOWED
  });
}

function closeRuntime(runtime: RuntimeState | undefined): void {
  runtime?.database?.close();
}
