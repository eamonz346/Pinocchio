"use client";

import type { MouseEvent } from "react";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

const points = 72;

export function getInitialDarkTheme() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem("theme");
  return stored === "dark" || (!stored && document.documentElement.classList.contains("dark"));
}

export function runThemeTransition(event: MouseEvent<HTMLElement>, apply: () => void) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transitionDocument = document as ViewTransitionDocument;
  if (!transitionDocument.startViewTransition || reduceMotion) {
    apply();
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const profile = createProfile(radius);
  const transition = transitionDocument.startViewTransition(apply);

  transition.ready
    .then(() => {
      showWave(x, y, radius, profile.duration);
      document.documentElement.animate(
        [
          { clipPath: buildClipPath(x, y, 0, profile, 0), offset: 0, easing: "cubic-bezier(0.32,0,0.67,0)" },
          { clipPath: buildClipPath(x, y, radius * 0.24, profile, 1), offset: 0.22, easing: "cubic-bezier(0.22,0.72,0.18,1)" },
          { clipPath: buildClipPath(x, y, radius * 0.56, profile, 0.9), offset: 0.56, easing: "cubic-bezier(0.16,1,0.3,1)" },
          { clipPath: buildClipPath(x, y, radius * 1.18, profile, 0.1), offset: 1 }
        ],
        {
          duration: profile.duration,
          easing: "linear",
          pseudoElement: "::view-transition-new(root)"
        } as KeyframeAnimationOptions & { pseudoElement: string }
      );
    })
    .catch(apply);
}

function createProfile(radius: number) {
  return {
    duration: 3800,
    amplitude: Math.min(64, Math.max(28, radius * 0.04)),
    phase: Math.random() * Math.PI * 2,
    primary: randomInt(4, 7),
    secondary: randomInt(9, 13),
    skew: Math.random() * Math.PI * 2
  };
}

function buildClipPath(x: number, y: number, radius: number, profile: ReturnType<typeof createProfile>, intensity: number) {
  const list = Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    const skew = 1 + Math.cos(angle - profile.skew) * 0.06;
    const wave =
      Math.sin(angle * profile.primary + profile.phase) * profile.amplitude * intensity +
      Math.sin(angle * profile.secondary - profile.phase * 0.6) * profile.amplitude * 0.4 * intensity;
    const distance = Math.max(0, radius * skew + wave);
    return `${x + Math.cos(angle) * distance}px ${y + Math.sin(angle) * distance}px`;
  });
  return `polygon(${list.join(", ")})`;
}

function showWave(x: number, y: number, radius: number, duration: number) {
  const wave = document.createElement("span");
  wave.className = "theme-transition-wave";
  wave.style.setProperty("--theme-transition-x", `${x}px`);
  wave.style.setProperty("--theme-transition-y", `${y}px`);
  wave.style.setProperty("--theme-transition-size", `${radius * 2}px`);
  wave.style.setProperty("--theme-transition-duration", `${duration}ms`);
  document.body.appendChild(wave);
  window.setTimeout(() => wave.remove(), duration + 300);
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
