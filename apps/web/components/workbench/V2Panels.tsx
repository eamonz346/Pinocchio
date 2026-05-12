"use client";

import type { Canvas, Conversation, Plan, PricingCurrency } from "@pinocchio/shared";
import { CardsPopover } from "../cards/CardsPopover";
import { CenterPanel } from "../panels/CenterPanel";
import type { AvatarPreferences } from "./avatarPreferences";
import { ConversationRail } from "./ConversationRail";
import { SettingsPanelContent } from "./PreferencesPanel";
import { useWorkbenchI18n } from "./workbenchI18n";

export type V2Panel = "settings" | "plan" | "canvas" | "timeline" | "organize" | null;

export function V2PanelLayer({
  panel,
  conversations,
  activeConversationId,
  canvases,
  activeCanvasId,
  plans,
  activePlanId,
  busy,
  onClose,
  onSelectConversation,
  onDeleteConversation,
  onOpenCanvas,
  onOpenPlan,
  avatarPreferences,
  onAvatarPreferences,
  currency
}: {
  panel: V2Panel;
  conversations: Conversation[];
  activeConversationId: string | undefined;
  canvases: Canvas[];
  activeCanvasId: string | undefined;
  plans: Plan[];
  activePlanId: string | undefined;
  busy: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenCanvas: (id: string) => void;
  onOpenPlan: (id: string) => void;
  avatarPreferences: AvatarPreferences;
  onAvatarPreferences: (preferences: AvatarPreferences) => void;
  currency: PricingCurrency;
}) {
  const { t } = useWorkbenchI18n();
  if (panel === "organize") return <CardsPopover open onClose={onClose} conversationId={activeConversationId} />;
  if (panel === "timeline") {
    return (
      <CenterPanel open title={t("timeline.title")} subtitle={t("timeline.subtitle")} onClose={onClose}>
        <div className="h-full min-h-0">
          <ConversationRail
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={(id) => {
              onSelectConversation(id);
              onClose();
            }}
            onDelete={onDeleteConversation}
          />
        </div>
      </CenterPanel>
    );
  }
  if (panel === "canvas") {
    return (
      <CenterPanel open title={t("canvasPanel.title")} subtitle={t("canvasPanel.subtitle")} onClose={onClose}>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {canvases.length ? canvases.map((canvas) => (
            <button
              key={canvas.id}
              type="button"
              onClick={() => {
                onOpenCanvas(canvas.id);
                onClose();
              }}
              data-active={canvas.id === activeCanvasId}
              className="rounded-[1rem] border border-border bg-card p-3 text-left transition hover:bg-muted data-[active=true]:border-primary/50"
            >
              <div className="truncate text-sm font-semibold">{canvas.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{canvas.kind} / v{canvas.version}</div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{canvas.summary || canvas.contentText}</p>
            </button>
          )) : <Empty text={t("canvasPanel.empty")} />}
        </div>
      </CenterPanel>
    );
  }
  if (panel === "plan") {
    return (
      <CenterPanel open title={t("planPanel.title")} subtitle={t("planPanel.subtitle")} onClose={onClose}>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {plans.length ? plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                onOpenPlan(plan.id);
                onClose();
              }}
              data-active={plan.id === activePlanId}
              disabled={busy && plan.status === "running"}
              className="rounded-[1rem] border border-border bg-card p-3 text-left transition hover:bg-muted data-[active=true]:border-primary/50 disabled:opacity-60"
            >
              <div className="truncate text-sm font-semibold">{plan.primaryGoal}</div>
              <div className="mt-1 text-xs text-muted-foreground">{plan.workflowType} / {plan.phase} / {plan.status}</div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{plan.content}</p>
            </button>
          )) : <Empty text={t("planPanel.empty")} />}
        </div>
      </CenterPanel>
    );
  }
  if (panel === "settings") {
    return (
      <CenterPanel open title={t("settings.title")} subtitle={t("settings.subtitle")} onClose={onClose} className="w-[min(92vw,560px)]">
        <SettingsPanelContent conversationId={activeConversationId} avatarPreferences={avatarPreferences} onAvatarPreferences={onAvatarPreferences} currency={currency} />
      </CenterPanel>
    );
  }
  return null;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[1rem] border border-dashed border-border bg-card/55 p-4 text-sm leading-6 text-muted-foreground">{text}</div>;
}
