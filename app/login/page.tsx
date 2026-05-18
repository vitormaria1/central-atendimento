"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AgentId = "vanderlei" | "gustavo";

const AGENTS: Array<{ id: AgentId; name: string }> = [
  { id: "vanderlei", name: "Vanderlei" },
  { id: "gustavo", name: "Gustavo" },
];

export default function LoginPage() {
  const router = useRouter();
  const [agentId, setAgentId] = useState<AgentId>("vanderlei");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, pin }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Falha no login");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6">
        <div className="w-full rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-6 shadow-2xl">
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Logo"
              className="h-36 w-36 md:h-44 md:w-44 object-contain"
            />
            <div className="mt-4 text-xl font-semibold text-center">
              Central de Atendimento e Inteligência
            </div>
          </div>

          <div className="mt-8">
            <h1 className="text-lg font-semibold">Login</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Selecione o atendente e digite o PIN.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-[var(--muted)]">Atendente</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setAgentId(agent.id)}
                      className={[
                        "rounded-2xl px-3 py-3 text-sm ring-1 transition",
                        agentId === agent.id
                          ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                          : "bg-white/5 ring-white/10 hover:bg-white/8",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 justify-center">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>{agent.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-[var(--muted)]">PIN</label>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-3 text-sm outline-none focus:ring-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
                  placeholder="••••"
                />
              </div>

              {error ? (
                <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/25 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                disabled={loading || pin.length === 0}
                className="w-full rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-3 text-sm font-medium shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
