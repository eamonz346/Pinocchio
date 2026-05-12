"use client";

import type { AppSettings, PricingCurrency } from "@pinocchio/shared";
import { BookOpenIcon, PlugIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { saveIntegrations } from "../../lib/apiClient";
import { useWorkbenchI18n } from "./workbenchI18n";

export function IntegrationSettingsSection({
  settings,
  conversationId,
  currency,
  onSettings
}: {
  settings: AppSettings | null;
  conversationId?: string | undefined;
  currency: PricingCurrency;
  onSettings: (settings: AppSettings) => void;
}) {
  const { t } = useWorkbenchI18n();
  const integrations = settings?.integrations;
  const [pluginDir, setPluginDir] = useState("");
  const [obsidianVaultPath, setObsidianVaultPath] = useState("");
  const [obsidianExportFolder, setObsidianExportFolder] = useState("AI Workbench");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!integrations) return;
    setPluginDir(integrations.pluginDir.path ?? "");
    setObsidianVaultPath(integrations.obsidian.vaultPath ?? "");
    setObsidianExportFolder(integrations.obsidian.exportFolder || "AI Workbench");
  }, [integrations]);

  return (
    <section className="grid gap-3 rounded-[0.9rem] border border-border bg-card p-3">
      <div className="flex items-center gap-2 font-semibold">
        <PlugIcon className="size-4" />
        {t("settings.integrationsTitle")}
      </div>
      <PathField label={t("settings.pluginDir")} value={pluginDir} placeholder="O:/any_apps/plugins" onValue={setPluginDir} />
      <PathField label={t("settings.obsidianVault")} value={obsidianVaultPath} placeholder="O:/Obsidian/Vault" onValue={setObsidianVaultPath} />
      <PathField label={t("settings.obsidianFolder")} value={obsidianExportFolder} placeholder="AI Workbench" onValue={setObsidianExportFolder} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {integrations?.obsidian.configured ? t("settings.obsidianConfigured") : t("settings.obsidianMissing")}
        </div>
        <button type="button" onClick={() => void save()} disabled={saving || !obsidianExportFolder.trim()} className="rounded-[0.75rem] bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45">
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
      {notice ? <div className="text-xs text-muted-foreground">{notice}</div> : null}
      <PluginStatusList settings={settings} />
    </section>
  );

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      const next = await saveIntegrations(
        {
          pluginDir: pluginDir.trim() || null,
          obsidianVaultPath: obsidianVaultPath.trim() || null,
          obsidianExportFolder: obsidianExportFolder.trim() || "AI Workbench"
        },
        conversationId,
        currency
      );
      onSettings(next);
      setNotice(t("settings.integrationsSaved"));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
}

function PathField({ label, value, placeholder, onValue }: { label: string; value: string; placeholder: string; onValue: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onValue(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-[0.75rem] border border-border bg-background px-3 py-2 text-xs font-normal outline-none focus:ring-2 focus:ring-ring/35"
      />
    </label>
  );
}

function PluginStatusList({ settings }: { settings: AppSettings | null }) {
  const { t } = useWorkbenchI18n();
  const plugins = settings?.integrations?.plugins ?? [];
  return (
    <div className="rounded-[0.75rem] border border-border bg-background/65 p-2">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
        <BookOpenIcon className="size-3.5" />
        {t("settings.pluginStatus")}
      </div>
      {plugins.length ? (
        <div className="space-y-1">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="grid gap-1 border-t border-border py-2 text-xs first:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{plugin.id}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{plugin.status}</span>
              </div>
              <div className="text-muted-foreground">{plugin.tools.length ? plugin.tools.join(", ") : t("settings.pluginNoTools")}</div>
              {plugin.errors.length ? <div className="text-red-600">{plugin.errors.join("; ")}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{t("settings.pluginStatusEmpty")}</div>
      )}
    </div>
  );
}
