"use client";

import type { ChatMessage, TokenUsage } from "@pinocchio/shared";
import { useEffect, useState } from "react";
import { countTokens } from "../../lib/apiClient";

export function useTokenUsage(draft: string, messages: ChatMessage[]) {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void countTokens({ draft, messages })
        .then((next) => {
          if (!controller.signal.aborted) {
            setUsage(next);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft, messages]);

  return { usage, failed };
}
