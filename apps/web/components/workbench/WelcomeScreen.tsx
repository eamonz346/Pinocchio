"use client";

import { defaultAssistantAvatarSrc } from "./avatarPreferences";
import { useWorkbenchI18n } from "./workbenchI18n";

export function WelcomeScreen() {
  const { t } = useWorkbenchI18n();
  return (
    <section data-testid="welcome-screen" className="px-4 py-8 text-center">
      <img
        src={defaultAssistantAvatarSrc}
        alt={t("welcome.avatarAlt")}
        className="mx-auto size-12 rounded-[1rem] bg-background object-cover ring-1 ring-border/80"
      />
      <h1 className="mt-5 text-xl font-semibold">{t("welcome.title")}</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {t("welcome.subtitle")}
      </p>
    </section>
  );
}
