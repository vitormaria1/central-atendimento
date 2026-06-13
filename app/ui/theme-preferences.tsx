"use client";

import { useEffect, useMemo, useState } from "react";

type ThemeMode = "auto" | "day" | "night";
type ResolvedTheme = "day" | "night";

const STORAGE_KEY = "theme:mode:v1";

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "day" || raw === "night" || raw === "auto") return raw;
  } catch {
    // ignore
  }
  return "auto";
}

function resolveAutoTheme(now = new Date()): ResolvedTheme {
  const hour = now.getHours();
  return hour >= 7 && hour < 19 ? "day" : "night";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "auto" ? resolveAutoTheme() : mode;
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
}

function cycleMode(mode: ThemeMode): ThemeMode {
  if (mode === "auto") return "day";
  if (mode === "day") return "night";
  return "auto";
}

export default function ThemePreferences() {
  const initial = useMemo(() => readMode(), []);
  const [mode, setMode] = useState<ThemeMode>(initial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    const sync = () => {
      if (mode === "auto") applyTheme(mode);
    };

    sync();
    const timer = window.setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [mode]);

  const label = mode === "auto" ? "Auto" : mode === "day" ? "Dia" : "Noite";
  const resolved = resolveTheme(mode);

  return (
    <button
      type="button"
      onClick={() => setMode((current) => cycleMode(current))}
      className="fixed bottom-3 left-3 z-50 inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/92 px-3 text-xs font-medium shadow-lg shadow-black/10 backdrop-blur transition hover:bg-[color-mix(in_srgb,var(--card)_96%,white)]"
      aria-label="Alternar tema"
      title="Tema"
    >
      <span className="text-[var(--muted)]">Tema</span>
      <span className="font-semibold">{label}</span>
      <span className="text-[10px] text-[var(--muted)]">{resolved === "day" ? "claro" : "escuro"}</span>
    </button>
  );
}
