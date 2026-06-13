"use client";

import { useEffect, useMemo, useState } from "react";

type A11yPrefs = {
  fontScale: 1 | 1.1 | 1.2;
  highContrast: boolean;
  reduceMotion: boolean;
};

const STORAGE_KEY = "a11y:prefs:v1";

function readPrefs(): A11yPrefs {
  if (typeof window === "undefined") return { fontScale: 1, highContrast: false, reduceMotion: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { fontScale: 1, highContrast: false, reduceMotion: false };
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    const fontScale = parsed.fontScale === 1.1 || parsed.fontScale === 1.2 ? parsed.fontScale : 1;
    return {
      fontScale,
      highContrast: Boolean(parsed.highContrast),
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return { fontScale: 1, highContrast: false, reduceMotion: false };
  }
}

function applyToDom(p: A11yPrefs) {
  const root = document.documentElement;
  root.dataset.fontScale = String(p.fontScale);
  root.dataset.highContrast = p.highContrast ? "1" : "0";
  root.dataset.reduceMotion = p.reduceMotion ? "1" : "0";
}

export default function A11yPreferences() {
  const initial = useMemo(() => readPrefs(), []);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(initial);

  useEffect(() => {
    applyToDom(prefs);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("codex:open-a11y-preferences", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("codex:open-a11y-preferences", onOpen as EventListener);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-50 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 px-4 py-3 text-sm backdrop-blur hover:bg-[color-mix(in_srgb,var(--card)_92%,white)]"
        aria-label="Abrir preferências de acessibilidade"
        title="Acessibilidade (Alt+A)"
      >
        Acessibilidade
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Preferências de acessibilidade"
            className="relative w-full max-w-lg rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Acessibilidade</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Ajustes rápidos para melhorar leitura e navegação. Atalho: <span className="text-[var(--foreground)]">Alt+A</span>.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
                aria-label="Fechar preferências"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                <div className="text-sm font-medium">Tamanho do texto</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {([1, 1.1, 1.2] as const).map((s) => (
                    <button
                      key={String(s)}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, fontScale: s }))}
                      className={[
                        "rounded-2xl px-3 py-2 text-sm ring-1",
                        prefs.fontScale === s
                          ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          : "bg-white/5 ring-white/10 hover:bg-white/8",
                      ].join(" ")}
                      aria-pressed={prefs.fontScale === s}
                    >
                      {s === 1 ? "Padrão" : s === 1.1 ? "Maior" : "Muito maior"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 space-y-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">Alto contraste</span>
                    <span className="block text-xs text-[var(--muted)]">Deixa textos e bordas mais visíveis.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.highContrast}
                    onChange={(e) => setPrefs((p) => ({ ...p, highContrast: e.target.checked }))}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">Reduzir animações</span>
                    <span className="block text-xs text-[var(--muted)]">Melhor para tontura e sensibilidade.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.reduceMotion}
                    onChange={(e) => setPrefs((p) => ({ ...p, reduceMotion: e.target.checked }))}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
