import type { ReactNode } from "react";

export function FullscreenChatSurface({ children }: { children: ReactNode }) {
  return (
    <main data-testid="chat-workspace" data-layout-mode="a" className="relative h-dvh overflow-hidden bg-background text-foreground">
      <section className="relative flex h-full min-h-0 flex-col">
        {children}
      </section>
    </main>
  );
}
