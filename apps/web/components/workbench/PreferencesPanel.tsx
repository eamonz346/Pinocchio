"use client";

import type { ApiKeySettings, AppSettings, PricingCurrency } from "@pinocchio/shared";
import { ImageIcon, KeyRoundIcon, RotateCcwIcon, UploadIcon, UserIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSettings, saveApiKey, saveBudget } from "../../lib/apiClient";
import type { AvatarPreferences, AvatarSource } from "./avatarPreferences";
import { defaultAssistantAvatarSrc, uploadAvatarSource } from "./avatarPreferences";
import { IntegrationSettingsSection } from "./IntegrationSettingsSection";
import { useWorkbenchI18n } from "./workbenchI18n";

export function PreferencesPanel({
  open,
  conversationId,
  avatarPreferences,
  onAvatarPreferences,
  currency = "CNY",
  onClose
}: {
  open: boolean;
  conversationId?: string | undefined;
  avatarPreferences: AvatarPreferences;
  onAvatarPreferences: (preferences: AvatarPreferences) => void;
  currency?: PricingCurrency | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-dock-root]")) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="fixed bottom-32 left-1/2 z-[120] w-[min(92vw,420px)] -translate-x-1/2 rounded-[1.2rem] border border-border bg-popover p-4 text-popover-foreground shadow-[var(--shadow-dock)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{t("settings.title")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("settings.subtitle")}</div>
        </div>
        <button type="button" onClick={onClose} className="icon-chip" aria-label={t("center.close", { title: t("settings.title") })}>
          <XIcon className="size-4" />
        </button>
      </div>
      <SettingsPanelContent conversationId={conversationId} avatarPreferences={avatarPreferences} onAvatarPreferences={onAvatarPreferences} currency={currency} />
    </div>
  );
}

export function SettingsPanelContent({
  conversationId,
  avatarPreferences,
  onAvatarPreferences,
  currency = "CNY"
}: {
  conversationId?: string | undefined;
  avatarPreferences: AvatarPreferences;
  onAvatarPreferences: (preferences: AvatarPreferences) => void;
  currency?: PricingCurrency | undefined;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [deepSeekKey, setDeepSeekKey] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [notice, setNotice] = useState("");
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    let active = true;
    void getSettings(conversationId, currency)
      .then((next) => {
        if (!active) return;
        setSettings(next);
        if (next.budget) setBudgetLimit(String(next.budget.limit));
      })
      .catch((cause) => {
        if (active) setNotice(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [conversationId, currency]);

  return (
    <div className="space-y-3 p-4 text-sm">
      <ApiKeySection
        title={t("settings.apiKeyTitle")}
        description={t("settings.deepSeekApiKeyDescription")}
        saved={settings?.deepSeek}
        value={deepSeekKey}
        saving={savingKey}
        notice={notice}
        placeholder={t("settings.apiKeyPlaceholder")}
        onValue={setDeepSeekKey}
        onSave={() => void saveKey()}
      />
      <PricingBudgetSection
        settings={settings}
        currency={currency}
        budgetLimit={budgetLimit}
        saving={savingBudget}
        onBudgetLimit={setBudgetLimit}
        onSaveBudget={() => void saveBudgetLimit()}
      />
      <IntegrationSettingsSection settings={settings} conversationId={conversationId} currency={currency} onSettings={setSettings} />
      <AvatarEditor
        role="assistant"
        label={t("settings.assistantAvatar")}
        source={avatarPreferences.assistant}
        onChange={(assistant) => onAvatarPreferences({ ...avatarPreferences, assistant })}
      />
      <AvatarEditor
        role="user"
        label={t("settings.userAvatar")}
        source={avatarPreferences.user}
        onChange={(user) => onAvatarPreferences({ ...avatarPreferences, user })}
      />
    </div>
  );

  async function saveKey() {
    setSavingKey(true);
    setNotice("");
    try {
      const next = await saveApiKey(deepSeekKey, conversationId, currency);
      setSettings(next);
      if (next.budget) setBudgetLimit(String(next.budget.limit));
      setDeepSeekKey("");
      setNotice(t("settings.savedNotice"));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingKey(false);
    }
  }

  async function saveBudgetLimit() {
    const parsed = Number(budgetLimit);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setSavingBudget(true);
    try {
      const next = await saveBudget(parsed, currency, conversationId);
      setSettings(next);
      if (next.budget) setBudgetLimit(String(next.budget.limit));
    } finally {
      setSavingBudget(false);
    }
  }
}

function ApiKeySection({
  title,
  description,
  saved,
  value,
  saving,
  notice,
  placeholder,
  onValue,
  onSave
}: {
  title: string;
  description: string;
  saved: ApiKeySettings | undefined;
  value: string;
  saving: boolean;
  notice: string | undefined;
  placeholder: string;
  onValue: (value: string) => void;
  onSave: () => void;
}) {
  const { t } = useWorkbenchI18n();
  return (
    <section className="grid gap-2 rounded-[0.9rem] border border-border bg-card p-3">
      <div className="flex items-center gap-2 font-semibold">
        <KeyRoundIcon className="size-4" />
        {title}
      </div>
      <div className="text-xs leading-5 text-muted-foreground">{description}</div>
      <div className="text-xs text-muted-foreground">
        {saved?.hasApiKey && saved.maskedApiKey ? t("settings.apiKeySaved", { key: saved.maskedApiKey }) : t("settings.apiKeyMissing")}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className="min-w-0 flex-1 rounded-[0.75rem] border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring/35"
        />
        <button type="submit" disabled={saving || !value.trim()} className="rounded-[0.75rem] bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-45">
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
      </form>
      {notice ? <div className="text-xs text-muted-foreground">{notice}</div> : null}
    </section>
  );
}

function PricingBudgetSection({
  settings,
  currency,
  budgetLimit,
  saving,
  onBudgetLimit,
  onSaveBudget
}: {
  settings: AppSettings | null;
  currency: PricingCurrency;
  budgetLimit: string;
  saving: boolean;
  onBudgetLimit: (value: string) => void;
  onSaveBudget: () => void;
}) {
  const { t } = useWorkbenchI18n();
  const pricing = settings?.pricing;
  const budget = settings?.budget;
  return (
    <section className="grid gap-2 rounded-[0.9rem] border border-border bg-card p-3">
      <div className="font-semibold">{t("settings.pricingTitle")}</div>
      <div className="text-xs leading-5 text-muted-foreground">
        {pricing ? t("settings.pricingStatus", { source: pricing.source, stale: pricing.stale ? t("settings.staleYes") : t("settings.staleNo") }) : t("settings.pricingLoading")}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {pricing?.models.map((model) => (
          <div key={model.model} className="flex flex-wrap justify-between gap-2">
            <span>{model.model}</span>
            <span>{formatMoney(model.inputCacheHitPerMillion, currency)} / {formatMoney(model.inputCacheMissPerMillion, currency)} / {formatMoney(model.outputPerMillion, currency)}</span>
          </div>
        ))}
        {budget ? (
          <div className="mt-1 flex flex-wrap justify-between gap-2 font-semibold text-foreground">
            <span>{t("settings.budgetTitle")}</span>
            <span>{formatMoney(budget.sessionCost, currency)} / {formatMoney(budget.limit, currency)} · {budget.state}</span>
          </div>
        ) : null}
        {pricing?.error ? <div>{pricing.error}</div> : null}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveBudget();
        }}
      >
        <input
          type="number"
          min="0"
          step="0.01"
          value={budgetLimit}
          onChange={(event) => onBudgetLimit(event.target.value)}
          aria-label={t("settings.budgetTitle")}
          className="min-w-0 flex-1 rounded-[0.75rem] border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring/35"
        />
        <button type="submit" disabled={saving || !Number.isFinite(Number(budgetLimit)) || Number(budgetLimit) <= 0} className="rounded-[0.75rem] bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-45">
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
      </form>
    </section>
  );
}

export function formatMoney(value: number, currency: PricingCurrency) {
  return `${currency === "CNY" ? "¥" : "$"}${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function AvatarEditor({ role, label, source, onChange }: { role: "assistant" | "user"; label: string; source: AvatarSource; onChange: (source: AvatarSource) => void }) {
  const [url, setUrl] = useState(source.kind === "url" ? source.value : "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
  const { t } = useWorkbenchI18n();

  useEffect(() => {
    setUrl(source.kind === "url" ? source.value : "");
  }, [source]);

  return (
    <section className="rounded-[0.9rem] border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <ImageIcon className="size-4" />
        {label}
      </div>
      <div className="flex items-center gap-3">
        <AvatarPreview role={role} label={label} source={source} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://..."
              aria-label={t("settings.avatarUrl", { label })}
              className="min-w-0 flex-1 rounded-[0.75rem] border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring/35"
            />
            <button type="button" onClick={() => onChange(url.trim() ? { kind: "url", value: url.trim() } : { kind: "default" })} className="rounded-[0.75rem] border border-border px-3 text-xs font-semibold">
              {t("settings.apply")}
            </button>
          </div>
          <div className="flex gap-2">
            <button ref={uploadButtonRef} type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-[0.75rem] border border-border px-3 py-1.5 text-xs font-semibold">
              <UploadIcon className="size-3.5" />
              {t("settings.upload")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label={`${label} ${t("settings.upload")}`}
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                void handleFile(input.files?.[0]).finally(() => {
                  input.value = "";
                  uploadButtonRef.current?.focus({ preventScroll: true });
                });
              }}
            />
            <button
              type="button"
              onClick={() => {
                setUrl("");
                onChange({ kind: "default" });
              }}
              className="inline-flex items-center gap-1.5 rounded-[0.75rem] border border-border px-3 py-1.5 text-xs font-semibold"
            >
              <RotateCcwIcon className="size-3.5" />
              {t("settings.default")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onChange(await uploadAvatarSource(file));
  }
}

function AvatarPreview({ role, label, source }: { role: "assistant" | "user"; label: string; source: AvatarSource }) {
  const { t } = useWorkbenchI18n();
  if (source.kind === "default" && role === "assistant") {
    return <img src={defaultAssistantAvatarSrc} alt={t("settings.avatarPreview", { label })} className="size-11 shrink-0 rounded-full bg-white object-cover ring-1 ring-border" />;
  }
  if (source.kind === "default") {
    return (
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-label={t("settings.avatarPreview", { label })}>
        <UserIcon className="size-4" />
      </div>
    );
  }
  return <img src={source.value} alt={t("settings.avatarPreview", { label })} className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border" />;
}
