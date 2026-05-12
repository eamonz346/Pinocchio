"use client";

export type AvatarSource = { kind: "default" } | { kind: "url"; value: string } | { kind: "data"; value: string };

export interface AvatarPreferences {
  user: AvatarSource;
  assistant: AvatarSource;
}

export const defaultAssistantAvatarSrc = "/avatars/ai-default.png";
const storageKey = "pinocchio.avatar-preferences.v1";
const legacyStorageKey = "deepseek-workbench.avatar-preferences.v1";

export const defaultAvatarPreferences: AvatarPreferences = {
  user: { kind: "default" },
  assistant: { kind: "default" }
};

export function loadAvatarPreferences(): AvatarPreferences {
  if (typeof window === "undefined") return defaultAvatarPreferences;
  try {
    const value = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
    const preferences = normalizeAvatarPreferences(JSON.parse(value ?? ""));
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
    return preferences;
  } catch {
    return defaultAvatarPreferences;
  }
}

export function saveAvatarPreferences(preferences: AvatarPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(normalizeAvatarPreferences(preferences)));
}

export async function uploadAvatarSource(file: File, fetchAvatar: typeof fetch = fetch): Promise<AvatarSource> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetchAvatar("/api/settings/avatar", { method: "POST", body: form });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(errorMessage(payload, "Avatar upload failed"));
  const avatar = (payload as { data?: { avatar?: unknown } } | undefined)?.data?.avatar;
  if (isUrlAvatarSource(avatar)) return avatar;
  throw new Error("Avatar upload returned an invalid response");
}

export async function fileToAvatarSource(file: File): Promise<AvatarSource> {
  const value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { kind: "data", value };
}

function normalizeAvatarPreferences(value: unknown): AvatarPreferences {
  if (!value || typeof value !== "object") return defaultAvatarPreferences;
  const row = value as Partial<Record<keyof AvatarPreferences, unknown>>;
  return {
    user: normalizeAvatarSource(row.user),
    assistant: normalizeAvatarSource(row.assistant)
  };
}

function normalizeAvatarSource(value: unknown): AvatarSource {
  if (!value || typeof value !== "object") return { kind: "default" };
  const row = value as { kind?: unknown; value?: unknown };
  if ((row.kind === "url" || row.kind === "data") && typeof row.value === "string" && row.value.trim()) {
    return { kind: row.kind, value: row.value };
  }
  return { kind: "default" };
}

function isUrlAvatarSource(value: unknown): value is AvatarSource {
  if (!value || typeof value !== "object") return false;
  const row = value as { kind?: unknown; value?: unknown };
  return row.kind === "url" && typeof row.value === "string" && row.value.trim().length > 0;
}

function errorMessage(payload: unknown, fallback: string): string {
  const message = (payload as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}
