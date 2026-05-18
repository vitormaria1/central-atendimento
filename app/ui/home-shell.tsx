"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

function itemClass(disabled: boolean) {
  return [
    "w-full rounded-2xl px-4 py-3 text-left ring-1 transition",
    disabled
      ? "bg-white/3 ring-white/10 opacity-60 cursor-not-allowed"
      : "bg-white/5 ring-white/10 hover:bg-white/8",
  ].join(" ");
}

export default function HomeShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Agent;
      setMe(data);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <aside className="w-[360px] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_80%,black)]">
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.png" alt="Logo" className="h-7 w-7" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">Central</div>
                <div className="text-xs text-[var(--muted)] leading-tight">
                  {me ? me.agentName : "Carregando..."}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-6">
            <div>
              <div className="text-xs font-semibold text-[var(--muted)] mb-3 tracking-wide uppercase">
                Central de Atendimento
              </div>
              <div className="space-y-2">
                <button
                  className={itemClass(false)}
                  onClick={() => {
                    router.push("/whatsapp");
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">WhatsApp</div>
                    <div className="text-[10px] rounded-full bg-[var(--primary)] text-white px-2 py-1">
                      Ativo
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Atender conversas e enviar documentos</div>
                </button>

                <button className={itemClass(true)} disabled>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Instagram</div>
                    <div className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                      Bloqueado
                    </div>
                  </div>
                </button>

                <button className={itemClass(true)} disabled>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">E-mail</div>
                    <div className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                      Bloqueado
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[var(--muted)] mb-3 tracking-wide uppercase">
                Central de Inteligência
              </div>
              <div className="space-y-2">
                <button className={itemClass(true)} disabled>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">ClickUp</div>
                    <div className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                      Bloqueado
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] blur-3xl" />
          </div>

          <div className="relative h-full flex items-center justify-center px-8">
            <div className="w-full max-w-2xl">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-[48px] bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] blur-2xl" />
                  <div className="relative rounded-[48px] bg-white/5 ring-1 ring-white/10 p-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo-mark.png"
                      alt="J.U.S.S.A.R.A."
                      className="h-44 w-44 md:h-56 md:w-56 object-contain"
                    />
                  </div>
                </div>

                <div className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">
                  J.U.S.S.A.R.A.
                </div>
                <div className="mt-2 text-sm text-[var(--muted)] max-w-xl">
                  Seu “cérebro” de IA da operação. Em breve você poderá conversar com a agente para ajudar em tarefas,
                  análises e automações.
                </div>

                <div className="mt-8 w-full">
                  <div className="rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-4 md:p-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-sm">
                        AI
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium">Input da agente</div>
                        <div className="text-xs text-[var(--muted)]">
                          Bloqueado por enquanto
                          {me ? ` • Logado como ${me.agentName}` : ""}
                        </div>
                      </div>
                      <div className="ml-auto text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                        🔒
                      </div>
                    </div>

                    <div className="mt-4 flex items-end gap-3">
                      <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                        <textarea
                          rows={2}
                          disabled
                          placeholder="Em breve: escreva aqui para conversar com a J.U.S.S.A.R.A..."
                          className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)] opacity-70"
                        />
                      </div>
                      <button
                        type="button"
                        disabled
                        className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white opacity-60 cursor-not-allowed"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-10 text-xs text-[var(--muted)]">
                  Use o menu à esquerda para abrir o <span className="text-[var(--foreground)]">WhatsApp</span>.
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
