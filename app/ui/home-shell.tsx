"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };
type AiMsg = { role: "user" | "model"; text: string };
type AiAttachment = { name: string; mimeType: string; dataBase64: string; sizeBytes: number };
type AiFile = { filename: string; mimeType: string; base64: string };
type AiMsgWithFiles = AiMsg & { files?: AiFile[]; attachments?: Array<{ name: string; mimeType: string; sizeBytes: number }> };

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
  const [aiMsgs, setAiMsgs] = useState<AiMsgWithFiles[]>([]);
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAttachments, setAiAttachments] = useState<AiAttachment[]>([]);

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

  function base64ToBlob(base64: string, mimeType: string) {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  }

  function downloadFile(f: AiFile) {
    const blob = base64ToBlob(f.base64, f.mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.filename || "arquivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const MAX_FILES = 6;
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB each

    const next: AiAttachment[] = [];
    for (const f of files.slice(0, MAX_FILES)) {
      if (f.size > MAX_BYTES) {
        setAiError(`Arquivo muito grande: ${f.name} (máx 10MB)`);
        continue;
      }
      const buf = new Uint8Array(await f.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const dataBase64 = btoa(binary);
      next.push({ name: f.name, mimeType: f.type || "application/octet-stream", dataBase64, sizeBytes: f.size });
    }

    setAiAttachments((prev) => [...prev, ...next].slice(0, MAX_FILES));
  }

  async function sendToAi() {
    const prompt = aiInput.trim();
    if (!prompt || aiSending) return;

    setAiError(null);
    setAiSending(true);
    setAiInput("");
    const nextHistory = [
      ...aiMsgs,
      {
        role: "user",
        text: prompt,
        attachments: aiAttachments.map((a) => ({ name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
      } satisfies AiMsgWithFiles,
    ];
    setAiMsgs(nextHistory);

    try {
      const res = await fetch("/api/ai/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, history: aiMsgs, attachments: aiAttachments.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })) }),
      });
      const data = (await res.json().catch(() => null)) as { text?: string; files?: AiFile[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Falha ao chamar IA");
      const text = (data?.text ?? "").trim();
      if (!text) throw new Error("IA retornou vazio");
      setAiMsgs((prev) => [...prev, { role: "model", text, files: data?.files ?? [] }]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Falha ao chamar IA");
    } finally {
      setAiSending(false);
      setAiAttachments([]);
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
                            {m.attachments && m.attachments.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {m.attachments.map((a, j) => (
                                  <div
                                    key={`${a.name}:${j}`}
                                    className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1"
                                  >
                                    📎 {a.name}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {m.files && m.files.length ? (
                              <div className="mt-2 space-y-2">
                                {m.files.slice(0, 3).map((f, j) => (
                                  <button
                                    key={`${f.filename}:${j}`}
                                    type="button"
                                    onClick={() => downloadFile(f)}
                                    className="w-full text-left rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold truncate">⬇ {f.filename}</div>
                                      <div className="text-[10px] text-[var(--muted)] shrink-0">{f.mimeType}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {aiError ? <div className="mt-3 text-xs text-[color-mix(in_srgb,var(--warning)_80%,white)]">{aiError}</div> : null}

                    <div className="mt-4 flex items-end gap-3">
                      <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-3 pb-2">
                          <label className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)]">
                            <input type="file" className="hidden" multiple onChange={onPickFiles} />
                            📎 Anexar
                          </label>
                          {aiAttachments.length ? (
                            <button
                              type="button"
                              onClick={() => setAiAttachments([])}
                              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                            >
                              Limpar anexos
                            </button>
                          ) : null}
                        </div>
                        {aiAttachments.length ? (
                          <div className="pb-2 flex flex-wrap gap-2">
                            {aiAttachments.map((a, j) => (
                              <button
                                key={`${a.name}:${j}`}
                                type="button"
                                onClick={() => setAiAttachments((prev) => prev.filter((_, i) => i !== j))}
                                className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1 hover:bg-white/8"
                                title="Remover"
                              >
                                📎 {a.name} ✕
                              </button>
                            ))}
                          </div>
                        ) : null}
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
