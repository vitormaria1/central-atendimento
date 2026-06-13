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
      className="fixed bottom-4 left-4 z-50 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 px-4 py-3 text-left shadow-lg shadow-black/10 backdrop-blur transition hover:bg-[color-mix(in_srgb,var(--card)_92%,white)]"
      aria-label="Alternar tema"
      title="Tema"
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Tema</div>
      <div className="mt-0.5 text-sm font-semibold leading-tight">{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
        {resolved === "day" ? "Modo claro" : "Modo escuro"}
      </div>
    </button>
  );
}
