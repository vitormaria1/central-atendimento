"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };
type AiMsg = { role: "user" | "model"; text: string };

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
  const [aiInput, setAiInput] = useState("");
  const [aiMsgs, setAiMsgs] = useState<AiMsg[]>([]);
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Agent;
      setMe(data);
    })();
  }, []);

  async function sendToAi() {
    const prompt = aiInput.trim();
    if (!prompt || aiSending) return;

    setAiError(null);
    setAiSending(true);
    setAiInput("");
    const nextHistory = [...aiMsgs, { role: "user", text: prompt } satisfies AiMsg];
    setAiMsgs(nextHistory);

    try {
      const res = await fetch("/api/ai/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, history: aiMsgs }),
      });
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Falha ao chamar IA");
      const text = (data?.text ?? "").trim();
      if (!text) throw new Error("IA retornou vazio");
      setAiMsgs((prev) => [...prev, { role: "model", text }]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Falha ao chamar IA");
    } finally {
      setAiSending(false);
    }
  }

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

            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
            >
              Sair
            </button>
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

                <button
                  className={itemClass(false)}
                  onClick={() => {
                    router.push("/team-chat");
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Chat Interno</div>
                    <div className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-2 py-1">
                      Time
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Comunicação rápida entre atendentes</div>
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
                <button
                  className={itemClass(false)}
                  onClick={() => {
                    router.push("/tasks");
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Tarefas</div>
                    <div className="text-[10px] rounded-full bg-[var(--primary)] text-white px-2 py-1">
                      Ativo
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Gerenciar tarefas por departamento</div>
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
                  Seu “cérebro” de IA da operação. Converse com a agente para ajudar em tarefas, análises e automações.
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
                          Gemini 2.5 Flash
                          {me ? ` • Logado como ${me.agentName}` : ""}
                        </div>
                      </div>
                      <div className="ml-auto text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                        IA
                      </div>
                    </div>

                    {aiMsgs.length > 0 ? (
                      <div className="mt-4 max-h-[240px] overflow-y-auto space-y-2">
                        {aiMsgs.slice(-12).map((m, idx) => (
                          <div
                            key={`${m.role}:${idx}`}
                            className={[
                              "rounded-2xl px-3 py-2 ring-1 text-sm whitespace-pre-wrap",
                              m.role === "user"
                                ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]"
                                : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
                            ].join(" ")}
                          >
                            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                              {m.role === "user" ? "Você" : "J.U.S.S.A.R.A."}
                            </div>
                            <div className="mt-1">{m.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {aiError ? <div className="mt-3 text-xs text-[color-mix(in_srgb,var(--warning)_80%,white)]">{aiError}</div> : null}

                    <div className="mt-4 flex items-end gap-3">
                      <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                        <textarea
                          rows={2}
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder="Escreva aqui para conversar com a J.U.S.S.A.R.A..."
                          className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendToAi();
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendToAi()}
                        disabled={aiSending || !aiInput.trim()}
                        className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {aiSending ? "Enviando..." : "Enviar"}
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
