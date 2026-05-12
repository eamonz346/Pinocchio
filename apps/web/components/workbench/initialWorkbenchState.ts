import type { WorkbenchState } from "./types";
import { emptyCapabilityFlags } from "@pinocchio/shared";
import { defaultAvatarPreferences } from "./avatarPreferences";

export const initialWorkbenchState: WorkbenchState = {
  conversations: [],
  conversationId: undefined,
  messages: [],
  artifacts: [],
  activeArtifactId: undefined,
  canvases: [],
  activeCanvasId: undefined,
  plans: [],
  activePlanId: undefined,
  tasks: [],
  taskEvents: {},
  files: [],
  memoryItems: [],
  memoryCandidates: [],
  toolCalls: [],
  capabilityFlags: emptyCapabilityFlags,
  lastUsageSummary: undefined,
  plan: undefined,
  planDraft: "",
  planDraftById: {},
  status: "Ready",
  model: "deepseek-v4-flash",
  thinking: "disabled",
  reasoningEffort: "high",
  mode: "chat",
  toolMode: "chat",
  workspaceTab: "tasks",
  mobileSheet: null,
  messageStatusById: {},
  avatarPreferences: defaultAvatarPreferences,
  streaming: false,
  busy: false
};
