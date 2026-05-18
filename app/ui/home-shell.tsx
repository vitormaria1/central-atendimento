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
                <img src="/logo.png" alt="Logo" className="h-7 w-7" />
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

        <main className="flex-1 flex items-center justify-center">
          <div className="max-w-lg px-8">
            <div className="text-2xl font-semibold">Bem-vindo{me ? `, ${me.agentName}` : ""}</div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              Escolha uma opção no menu à esquerda para continuar.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

