import type {
  AiTask,
  AiTaskEvent,
  AppMode,
  CapabilityFlags,
  Artifact,
  Canvas,
  ChatMessage,
  Conversation,
  MemoryCandidate,
  MemoryItem,
  ModelName,
  Plan,
  ReasoningEffort,
  ThinkingType,
  ToolCallState,
  UsageSummary,
  UploadedFile
} from "@pinocchio/shared";
import type { AvatarPreferences } from "./avatarPreferences";

export type ToolMode = "chat" | "web" | "research" | "plan";
export type WorkspaceTab = "tasks" | "plan" | "memory";
export type MobileSheet = "history" | "workspace" | "canvas" | null;
export type MessageDeliveryStatus = "queued" | "sent" | "delivered" | "failed";

export interface WorkbenchState {
  conversations: Conversation[];
  conversationId: string | undefined;
  messages: ChatMessage[];
  artifacts: Artifact[];
  activeArtifactId: string | undefined;
  canvases: Canvas[];
  activeCanvasId: string | undefined;
  plans: Plan[];
  activePlanId: string | undefined;
  tasks: AiTask[];
  taskEvents: Record<string, AiTaskEvent[]>;
  files: UploadedFile[];
  memoryItems: MemoryItem[];
  memoryCandidates: MemoryCandidate[];
  toolCalls: ToolCallState[];
  capabilityFlags: CapabilityFlags;
  lastUsageSummary: UsageSummary | undefined;
  plan: Plan | undefined;
  planDraft: string;
  planDraftById: Record<string, string>;
  status: string;
  model: ModelName;
  thinking: ThinkingType;
  reasoningEffort: ReasoningEffort;
  mode: AppMode;
  toolMode: ToolMode;
  workspaceTab: WorkspaceTab;
  mobileSheet: MobileSheet;
  messageStatusById: Record<string, MessageDeliveryStatus>;
  avatarPreferences: AvatarPreferences;
  streaming: boolean;
  busy: boolean;
}
