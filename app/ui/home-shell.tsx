"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [aiAnnounce, setAiAnnounce] = useState<string>("");
  const [aiAttachments, setAiAttachments] = useState<AiAttachment[]>([]);
  const [templates, setTemplates] = useState<Array<{ slug: string; name: string }>>([]);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.getAttribute("contenteditable") === "true";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        composerRef.current?.focus();
        setAiAnnounce("Foco no campo de mensagem.");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setTemplatePickerOpen(true);
        setAiAnnounce("Seletor de modelos aberto.");
        queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-template-search="1"]')?.focus());
        return;
      }

      if (e.key === "Escape" && !isTypingTarget) {
        if (templatePickerOpen) setTemplatePickerOpen(false);
        if (aiAttachments.length) setAiAttachments([]);
        if (aiError) setAiError(null);
        if (templatePickerOpen || aiAttachments.length || aiError) setAiAnnounce("Limpo.");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [aiAttachments.length, aiError, selectedTemplateSlug, templatePickerOpen]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/docs/templates", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Array<{ slug: string; name: string }> };
      setTemplates(data.items ?? []);
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

  const attachmentsSummary = (() => {
    if (!aiAttachments.length) return null;
    const bytes = aiAttachments.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
    const mb = bytes / (1024 * 1024);
    return `${aiAttachments.length} anexo(s) • ${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  })();

  const filteredTemplates = (() => {
    const q = templateQuery.trim().toLowerCase();
    const list = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
    return list;
  })();

  async function sendToAi() {
    const prompt = aiInput.trim();
    if (!prompt || aiSending) return;

    setAiError(null);
    setAiSending(true);
    setAiInput("");
    setAiAnnounce("Enviando para a J.U.S.S.A.R.A...");
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
        body: JSON.stringify({
          prompt,
          history: aiMsgs,
          templateSlug: selectedTemplateSlug ?? undefined,
          attachments: aiAttachments.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { text?: string; files?: AiFile[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Falha ao chamar IA");
      const text = (data?.text ?? "").trim();
      if (!text) throw new Error("IA retornou vazio");
      setAiMsgs((prev) => [...prev, { role: "model", text, files: data?.files ?? [] }]);
      setAiAnnounce("Resposta recebida.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao chamar IA";
      setAiError(msg);
      setAiAnnounce(msg);
    } finally {
      setAiSending(false);
      setAiAttachments([]);
      queueMicrotask(() => composerRef.current?.focus());
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {aiAnnounce}
      </div>
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

          <div className="relative h-full overflow-y-auto px-6 md:px-10 py-10">
            <div className="w-full max-w-3xl mx-auto">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-[48px] bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] blur-2xl" />
                  <div className="relative rounded-[48px] bg-white/5 ring-1 ring-white/10 p-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo-mark.png"
                      alt="J.U.S.S.A.R.A."
                      className="h-36 w-36 md:h-52 md:w-52 object-contain"
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
                  <div className="rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-4 md:p-5 text-left">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-sm">
                        AI
                      </div>
                      <div className="text-left min-w-0">
                        <div className="text-sm font-medium">Chat da J.U.S.S.A.R.A.</div>
                      </div>
                    </div>

                    {aiSending ? (
                      <div className="mt-3 text-xs rounded-full inline-flex bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-1">
                        Aguardando resposta…
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-col min-h-0">
                      {aiMsgs.length > 0 ? (
                        <div
                          className="max-h-[320px] md:max-h-[420px] overflow-y-auto space-y-2 pr-1"
                          role="log"
                          aria-live="polite"
                          aria-relevant="additions text"
                          aria-busy={aiSending}
                        >
                          {aiMsgs.map((m, idx) => (
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
                      ) : (
                        <div className="text-sm text-[var(--muted)] mt-2">
                          Escreva uma mensagem abaixo para começar.
                        </div>
                      )}

                      {aiError ? (
                        <div
                          className="mt-3 text-xs text-[color-mix(in_srgb,var(--warning)_80%,white)]"
                          role="alert"
                          aria-live="assertive"
                        >
                          {aiError}
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            multiple
                            onChange={onPickFiles}
                            aria-label="Selecionar arquivos para anexar"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8"
                              title="Anexar arquivos"
                            >
                              📎 Anexar
                            </button>

                            <button
                              type="button"
                              onClick={() => setTemplatePickerOpen(true)}
                              className="text-xs rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-1 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                              aria-haspopup="dialog"
                            >
                              Modelos
                            </button>
                          </div>

                          <div className="flex items-center gap-3">
                            {attachmentsSummary ? (
                              <div className="text-xs text-[var(--muted)]">{attachmentsSummary}</div>
                            ) : null}
                            {selectedTemplateSlug ? (
                              <button
                                type="button"
                                onClick={() => setSelectedTemplateSlug(null)}
                                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                                title="Remover modelo"
                              >
                                Modelo: {templates.find((t) => t.slug === selectedTemplateSlug)?.name ?? selectedTemplateSlug} ✕
                              </button>
                            ) : null}
                            {aiAttachments.length ? (
                              <button
                                type="button"
                                onClick={() => setAiAttachments([])}
                                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                                aria-label="Limpar anexos"
                              >
                                Limpar
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {aiAttachments.length ? (
                          <div className="pb-2 flex flex-wrap gap-2">
                            {aiAttachments.map((a, j) => (
                              <button
                                key={`${a.name}:${j}`}
                                type="button"
                                onClick={() => setAiAttachments((prev) => prev.filter((_, i) => i !== j))}
                                className="min-h-[40px] text-[11px] md:text-xs rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                                title="Remover"
                              >
                                📎 {a.name} ✕
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="flex items-end gap-3">
                          <textarea
                            ref={composerRef}
                            rows={2}
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            placeholder="Escreva aqui para conversar com a J.U.S.S.A.R.A..."
                            aria-label="Mensagem para a J.U.S.S.A.R.A."
                            className="flex-1 resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void sendToAi();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void sendToAi()}
                            disabled={aiSending || !aiInput.trim()}
                            aria-disabled={aiSending || !aiInput.trim()}
                            className="h-12 min-w-[110px] rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
                          >
                            {aiSending ? "Enviando..." : "Enviar"}
                          </button>
                        </div>
                      </div>
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

      {templatePickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar"
            onClick={() => setTemplatePickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar modelo"
            className="relative w-full max-w-2xl rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Modelos de documentos</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Escolha um modelo para a J.U.S.S.A.R.A preencher.</div>
              </div>
              <button
                type="button"
                onClick={() => setTemplatePickerOpen(false)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                data-template-search="1"
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                placeholder="Buscar modelo…"
                aria-label="Buscar modelo de documento"
                className="h-11 w-full rounded-2xl bg-[color-mix(in_srgb,var(--background)_55%,black)] ring-1 ring-white/10 px-4 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
              />
              {selectedTemplateSlug ? (
                <button
                  type="button"
                  onClick={() => setSelectedTemplateSlug(null)}
                  className="h-11 shrink-0 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 text-sm hover:bg-white/8"
                  title="Remover modelo selecionado"
                >
                  Remover
                </button>
              ) : null}
            </div>

            <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTemplates.map((t) => {
                  const selected = t.slug === selectedTemplateSlug;
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateSlug(t.slug);
                        setTemplatePickerOpen(false);
                        setAiAnnounce(`Modelo selecionado: ${t.name}`);
                        queueMicrotask(() => composerRef.current?.focus());
                      }}
                      className={[
                        "min-h-[52px] text-left rounded-2xl px-4 py-3 ring-1 transition",
                        selected
                          ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          : "bg-white/5 ring-white/10 hover:bg-white/8",
                      ].join(" ")}
                    >
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-xs text-[var(--muted)]">{t.slug}</div>
                    </button>
                  );
                })}
                {filteredTemplates.length === 0 ? (
                  <div className="text-sm text-[var(--muted)]">Nenhum modelo encontrado.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
