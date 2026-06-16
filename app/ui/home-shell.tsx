"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clearWhatsappBadge, useWhatsappNotifyStore } from "./whatsapp-notify-store";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };
type AiMsg = { role: "user" | "model"; text: string };
type AiAttachment = { name: string; mimeType: string; dataBase64: string; sizeBytes: number };
type AiFile = { filename: string; mimeType: string; base64: string };
type AiThread = {
  id: string;
  title: string;
  summary: string;
  selectedTemplateSlug: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageText: string | null;
};
type AiMsgWithFiles = AiMsg & {
  id?: string;
  createdAt?: string;
  files?: AiFile[];
  attachments?: Array<{ name: string; mimeType: string; sizeBytes?: number }>;
};
type HubCard = {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeTone: "warn" | "primary" | "accent" | "muted";
  orbitClass: string;
  href?: string;
  action?: () => void;
  onClick?: () => void;
  disabled?: boolean;
};

export default function HomeShell() {
  const [me, setMe] = useState<Agent | null>(null);
  const { whatsappBadge } = useWhatsappNotifyStore();
  const [currentView, setCurrentView] = useState<"overview" | "jussara">("overview");
  const [aiInput, setAiInput] = useState("");
  const [aiThreads, setAiThreads] = useState<AiThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [aiMsgs, setAiMsgs] = useState<AiMsgWithFiles[]>([]);
  const [aiSending, setAiSending] = useState(false);
  const [aiLoadingHistory, setAiLoadingHistory] = useState(false);
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

  async function loadAiThreads(preferredThreadId?: string | null) {
    const res = await fetch("/api/ai/threads", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: AiThread[] };
    const items = data.items ?? [];
    setAiThreads(items);
    const nextThreadId =
      preferredThreadId && items.some((item) => item.id === preferredThreadId)
        ? preferredThreadId
        : selectedThreadId && items.some((item) => item.id === selectedThreadId)
          ? selectedThreadId
          : items[0]?.id ?? null;
    setSelectedThreadId(nextThreadId);
    if (!nextThreadId) {
      setAiMsgs([]);
      setSelectedTemplateSlug(null);
    }
  }

  async function loadAiThreadMessages(threadId: string) {
    setAiLoadingHistory(true);
    try {
      const res = await fetch(`/api/ai/threads/${encodeURIComponent(threadId)}/messages`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar conversa");
      const data = (await res.json()) as {
        thread: AiThread;
        items: Array<{
          id: string;
          role: "user" | "model";
          text: string;
          files?: AiFile[];
          attachments?: Array<{ name: string; mimeType: string; sizeBytes?: number }>;
          createdAt: string;
        }>;
      };
      setAiMsgs(
        (data.items ?? []).map((item) => ({
          id: item.id,
          role: item.role,
          text: item.text,
          files: item.files ?? [],
          attachments: item.attachments ?? [],
          createdAt: item.createdAt,
        })),
      );
      setSelectedTemplateSlug(data.thread.selectedTemplateSlug ?? null);
      setAiThreads((prev) => {
        const others = prev.filter((item) => item.id !== data.thread.id);
        return [{ ...data.thread, lastMessageText: data.items.at(-1)?.text ?? data.thread.lastMessageText }, ...others];
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Falha ao carregar conversa");
    } finally {
      setAiLoadingHistory(false);
    }
  }

  async function createNewAiThread() {
    setAiError(null);
    const res = await fetch("/api/ai/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setAiError("Falha ao criar conversa");
      return;
    }
    const data = (await res.json()) as { thread: AiThread };
    setAiMsgs([]);
    setAiAttachments([]);
    setAiInput("");
    setSelectedTemplateSlug(null);
    setSelectedThreadId(data.thread.id);
    setAiThreads((prev) => [data.thread, ...prev.filter((item) => item.id !== data.thread.id)]);
    queueMicrotask(() => composerRef.current?.focus());
  }

  useEffect(() => {
    void loadAiThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadAiThreadMessages(selectedThreadId);
  }, [selectedThreadId]);

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

  const hubCards: HubCard[] = [
    {
      id: "whatsapp",
      title: "WhatsApp",
      description: "Atendimento, conversas e documentos enviados ao cliente.",
      badge: whatsappBadge > 0 ? `${whatsappBadge}` : "Ativo",
      badgeTone: whatsappBadge > 0 ? "warn" : "primary",
      orbitClass: "hub-card--whatsapp",
      href: "/whatsapp",
      onClick: () => clearWhatsappBadge(),
    },
    {
      id: "chat",
      title: "Chat Interno",
      description: "Comunicação rápida entre atendentes e operação.",
      badge: "Time",
      badgeTone: "accent",
      orbitClass: "hub-card--chat",
      href: "/team-chat",
    },
    {
      id: "jussara",
      title: "J.U.S.S.A.R.A.",
      description: "IA com memória, histórico lateral e geração de documentos.",
      badge: "IA",
      badgeTone: "primary",
      orbitClass: "hub-card--jussara",
      action: () => setCurrentView("jussara"),
    },
    {
      id: "tasks",
      title: "Tarefas",
      description: "Gestão de demandas por departamento, prazo e responsável.",
      badge: "Ativo",
      badgeTone: "primary",
      orbitClass: "hub-card--tasks",
      href: "/tasks",
    },
    {
      id: "clients",
      title: "Clientes",
      description: "Cadastro completo e dados operacionais importantes.",
      badge: "Ativo",
      badgeTone: "primary",
      orbitClass: "hub-card--clients",
      href: "/clients",
    },
    {
      id: "instagram",
      title: "Instagram",
      description: "Canal em preparação para a próxima etapa da central.",
      badge: "Bloqueado",
      badgeTone: "muted",
      orbitClass: "hub-card--instagram",
      disabled: true,
    },
  ] as const;

  async function sendToAi() {
    const prompt = aiInput.trim();
    if (!prompt || aiSending) return;

    setAiError(null);
    setAiSending(true);
    setAiInput("");
    setAiAnnounce("Enviando para a J.U.S.S.A.R.A...");
    const optimisticUserMessage = {
      role: "user" as const,
      text: prompt,
      attachments: aiAttachments.map((a) => ({ name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    } satisfies AiMsgWithFiles;
    setAiMsgs((prev) => [...prev, optimisticUserMessage]);

    try {
      const res = await fetch("/api/ai/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          threadId: selectedThreadId ?? undefined,
          templateSlug: selectedTemplateSlug ?? undefined,
          attachments: aiAttachments.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        threadId?: string;
        text?: string;
        files?: AiFile[];
        error?: string;
        userMessage?: AiMsgWithFiles;
        modelMessage?: AiMsgWithFiles;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Falha ao chamar IA");
      const text = (data?.text ?? "").trim();
      if (!text) throw new Error("IA retornou vazio");
      setSelectedThreadId(data?.threadId ?? selectedThreadId);
      setAiMsgs((prev) => {
        const withoutOptimistic = prev.slice(0, -1);
        return [
          ...withoutOptimistic,
          data?.userMessage ?? optimisticUserMessage,
          data?.modelMessage ?? { role: "model", text, files: data?.files ?? [] },
        ];
      });
      await loadAiThreads(data?.threadId ?? selectedThreadId ?? undefined);
      setAiAnnounce("Resposta recebida.");
    } catch (err) {
      setAiMsgs((prev) => prev.slice(0, -1));
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
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] blur-3xl" />
          <div className="absolute bottom-[-8rem] left-[10%] h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] blur-3xl" />
          <div className="absolute right-[8%] top-[18%] h-64 w-64 rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] blur-3xl" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col px-5 py-5 md:px-8 md:py-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentView("overview")}
              className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_88%,transparent)] px-4 py-2 text-sm backdrop-blur hover:bg-[var(--surface-1)]"
            >
              Central
            </button>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_88%,transparent)] px-4 py-2 text-sm text-[var(--muted)] backdrop-blur">
                {me ? me.agentName : "Carregando..."}
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_88%,transparent)] px-4 py-2 text-sm backdrop-blur hover:bg-[var(--surface-1)]"
              >
                Sair
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            {currentView === "jussara" ? (
              <div className="grid h-full min-h-[calc(100vh-5rem)] grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--card)]">
                  <div className="border-b border-[var(--border)] px-5 py-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">J.U.S.S.A.R.A.</div>
                    <div className="mt-1 text-xl font-semibold">Conversas</div>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView("jussara");
                        void createNewAiThread();
                      }}
                      className="mt-4 w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white"
                    >
                      Nova conversa
                    </button>
                  </div>

                  <div className="max-h-[calc(100vh-13rem)] overflow-y-auto p-3">
                    {aiThreads.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-5 text-sm text-[var(--muted)]">
                        Nenhuma conversa criada ainda.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {aiThreads.map((thread) => {
                          const active = thread.id === selectedThreadId;
                          return (
                            <button
                              key={thread.id}
                              type="button"
                              onClick={() => {
                                setCurrentView("jussara");
                                setSelectedThreadId(thread.id);
                                setAiError(null);
                              }}
                              className={[
                                "w-full rounded-[24px] border px-4 py-4 text-left transition",
                                active
                                  ? "border-[color-mix(in_srgb,var(--primary)_35%,white)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                                  : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                              ].join(" ")}
                            >
                              <div className="truncate text-sm font-semibold">{thread.title}</div>
                              <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                                {thread.lastMessageText || thread.summary || "Sem mensagens ainda."}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </aside>

                <div className="overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--card)]">
                  <div className="border-b border-[var(--border)] px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Conversa ativa</div>
                        <div className="mt-1 text-lg font-semibold">
                          {aiThreads.find((item) => item.id === selectedThreadId)?.title ?? "Nova conversa"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {aiSending ? (
                          <div className="inline-flex rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-3 py-1 text-xs ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                            Aguardando resposta…
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setCurrentView("overview")}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex h-[calc(100vh-12rem)] flex-col px-5 py-4">
                    <div className="flex-1 overflow-y-auto">
                      {aiLoadingHistory ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-5 text-sm text-[var(--muted)]">
                          Carregando conversa...
                        </div>
                      ) : aiMsgs.length > 0 ? (
                        <div
                          className="space-y-2 pr-1"
                          role="log"
                          aria-live="polite"
                          aria-relevant="additions text"
                          aria-busy={aiSending}
                        >
                          {aiMsgs.map((m, idx) => (
                            <div
                              key={`${m.role}:${m.id ?? idx}`}
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
                                      className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px]"
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
                                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="truncate text-xs font-semibold">⬇ {f.filename}</div>
                                        <div className="shrink-0 text-[10px] text-[var(--muted)]">{f.mimeType}</div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-5 text-sm text-[var(--muted)]">
                          Comece uma conversa, peça análises mais longas ou gere documentos do escritório por aqui.
                        </div>
                      )}
                    </div>

                    {aiError ? (
                      <div
                        className="mt-3 text-xs text-[color-mix(in_srgb,var(--warning)_80%,white)]"
                        role="alert"
                        aria-live="assertive"
                      >
                        {aiError}
                      </div>
                    ) : null}

                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-4">
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
                              className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1 text-xs hover:bg-[var(--surface-2)]"
                              title="Anexar arquivos"
                            >
                              📎 Anexar
                            </button>

                            <button
                              type="button"
                              onClick={() => setTemplatePickerOpen(true)}
                              className="rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-3 py-1 text-xs ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                              aria-haspopup="dialog"
                            >
                              Modelos
                            </button>
                          </div>

                          <div className="flex items-center gap-3">
                            {attachmentsSummary ? <div className="text-xs text-[var(--muted)]">{attachmentsSummary}</div> : null}
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
                          <div className="flex flex-wrap gap-2 pb-2">
                            {aiAttachments.map((a, j) => (
                              <button
                                key={`${a.name}:${j}`}
                                type="button"
                                onClick={() => setAiAttachments((prev) => prev.filter((_, i) => i !== j))}
                                className="min-h-[40px] rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[11px] hover:bg-[var(--surface-1)] md:text-xs"
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
                            className="min-h-[84px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
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
              </div>
            ) : (
              <div className="central-enter mx-auto flex h-full w-full max-w-[1500px] flex-1 flex-col justify-center overflow-hidden py-2">
                <div className="mx-auto w-full max-w-3xl -translate-y-8 text-center">
                  <div className="mx-auto inline-flex rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_88%,transparent)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)] backdrop-blur">
                    Central de Atendimento
                  </div>
                  <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">Centro operacional</h1>
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--muted)]">
                    Todos os módulos ao redor do núcleo. A J.U.S.S.A.R.A. continua com workspace própria e conversas persistentes.
                  </p>
                </div>

                <div className="relative mt-6 hidden lg:block">
                  <div className="hub-orbit mx-auto">
                    <div className="orbit-ring orbit-ring--outer" />
                    <div className="orbit-ring orbit-ring--mid" />
                    <div className="orbit-ring orbit-ring--inner" />

                    <div className="hub-scene">
                      {hubCards.map((card) => {
                        const badgeClass =
                          card.badgeTone === "warn"
                            ? "bg-[var(--warning)] text-black"
                            : card.badgeTone === "accent"
                              ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)] ring-1 ring-[color-mix(in_srgb,var(--accent)_42%,transparent)]"
                              : card.badgeTone === "muted"
                                ? "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted)]"
                                : "bg-[var(--primary)] text-white";
                        const content = (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold">{card.title}</div>
                              <span className={["rounded-full px-2 py-1 text-[10px]", badgeClass].join(" ")}>{card.badge}</span>
                            </div>
                            <div className="mt-3 text-xs leading-5 text-[var(--muted)]">{card.description}</div>
                          </>
                        );

                        const commonClass = [
                          "hub-card rounded-[30px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_90%,transparent)] px-5 py-5 text-left backdrop-blur-xl",
                          card.disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                        ].join(" ");

                        return (
                          <div key={card.id} className={["hub-card-orbit", card.orbitClass].join(" ")}>
                            <div className="hub-card-orbit__slot">
                              <div className="hub-card-orbit__face">
                                {card.href ? (
                                  <Link href={card.href} onClick={card.onClick} className="block">
                                    <div className={commonClass}>{content}</div>
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={card.disabled ? undefined : card.action}
                                    disabled={card.disabled}
                                    className={commonClass}
                                  >
                                    {content}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="brain-core group relative z-10 flex h-[270px] w-[270px] items-center justify-center rounded-[44px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_86%,transparent)] shadow-[0_30px_80px_rgba(16,24,40,0.18)] backdrop-blur-xl">
                        <div className="brain-pulse absolute inset-5 rounded-[36px] border border-[color-mix(in_srgb,var(--primary)_28%,transparent)]" />
                        <div className="brain-pulse brain-pulse--alt absolute inset-0 rounded-[44px] border border-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />
                        <div className="absolute inset-0 rounded-[44px] bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_45%),radial-gradient(circle_at_70%_70%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_42%)]" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-mark.png" alt="Central" className="relative z-10 h-40 w-40 object-contain drop-shadow-[0_12px_28px_rgba(35,66,244,0.28)]" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:hidden md:grid-cols-2">
                  {hubCards.map((card) => {
                    const badgeClass =
                      card.badgeTone === "warn"
                        ? "bg-[var(--warning)] text-black"
                        : card.badgeTone === "accent"
                          ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)] ring-1 ring-[color-mix(in_srgb,var(--accent)_42%,transparent)]"
                          : card.badgeTone === "muted"
                            ? "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted)]"
                            : "bg-[var(--primary)] text-white";
                    const content = (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{card.title}</div>
                          <span className={["rounded-full px-2 py-1 text-[10px]", badgeClass].join(" ")}>{card.badge}</span>
                        </div>
                        <div className="mt-3 text-xs leading-5 text-[var(--muted)]">{card.description}</div>
                      </>
                    );
                    const commonClass = [
                      "hub-card rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_92%,transparent)] px-5 py-5 text-left backdrop-blur-xl",
                      card.disabled ? "cursor-not-allowed opacity-70" : "",
                    ].join(" ");
                    if (card.href) {
                      return (
                        <Link key={card.id} href={card.href} onClick={card.onClick} className="block">
                          <div className={commonClass}>{content}</div>
                        </Link>
                      );
                    }
                    return (
                      <button key={card.id} type="button" onClick={card.disabled ? undefined : card.action} disabled={card.disabled} className={commonClass}>
                        {content}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .central-enter {
          animation: centralReveal 680ms ease-out both;
        }

        .brain-core {
          animation: coreFloat 9s ease-in-out infinite;
        }

        .brain-pulse {
          animation: pulseRing 4.6s ease-in-out infinite;
        }

        .brain-pulse--alt {
          animation-delay: -2.2s;
        }

        .hub-orbit {
          position: relative;
          height: min(64vh, 680px);
          width: 100%;
          max-width: 1240px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hub-scene {
          position: relative;
          z-index: 2;
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .orbit-ring {
          position: absolute;
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
          animation: slowSpin 22s linear infinite;
          opacity: 0.9;
        }

        .orbit-ring--outer {
          height: 620px;
          width: 620px;
        }

        .orbit-ring--mid {
          height: 500px;
          width: 500px;
          animation-direction: reverse;
          animation-duration: 18s;
        }

        .orbit-ring--inner {
          height: 380px;
          width: 380px;
          animation-duration: 14s;
        }

        .hub-card-orbit {
          --orbit-x: 0px;
          --orbit-y: 0px;
          --orbit-duration: 26s;
          --orbit-delay: 0s;
          position: absolute;
          left: 50%;
          top: 50%;
          width: 0;
          height: 0;
          animation: orbitSpin var(--orbit-duration) linear infinite;
          animation-delay: var(--orbit-delay);
        }

        .hub-card-orbit__slot {
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(var(--orbit-x), var(--orbit-y));
        }

        .hub-card-orbit__face {
          transform: translate(-50%, -50%);
          animation: orbitCounterSpin var(--orbit-duration) linear infinite;
          animation-delay: var(--orbit-delay);
        }

        .hub-card {
          display: block;
          width: 236px;
          box-shadow: 0 18px 46px rgba(15, 23, 42, 0.12);
          transition:
            transform 220ms ease,
            box-shadow 220ms ease,
            border-color 220ms ease,
            background-color 220ms ease;
        }

        .hub-card:hover {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 26px 60px rgba(15, 23, 42, 0.18);
          border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
        }

        .hub-card--whatsapp {
          --orbit-x: -118px;
          --orbit-y: -312px;
          --orbit-duration: 30s;
          --orbit-delay: -3s;
        }

        .hub-card--whatsapp:hover .hub-card {
          transform: translateY(-10px) rotate(-3deg) scale(1.04);
        }

        .hub-card--chat {
          --orbit-x: 232px;
          --orbit-y: -192px;
          --orbit-duration: 34s;
          --orbit-delay: -11s;
        }

        .hub-card--chat:hover .hub-card {
          transform: translateY(-10px) rotate(2deg) scale(1.04);
        }

        .hub-card--jussara {
          --orbit-x: -296px;
          --orbit-y: -52px;
          --orbit-duration: 32s;
          --orbit-delay: -7s;
        }

        .hub-card--jussara:hover .hub-card {
          transform: translateY(-10px) scale(1.05);
        }

        .hub-card--tasks {
          --orbit-x: 284px;
          --orbit-y: 58px;
          --orbit-duration: 31s;
          --orbit-delay: -16s;
        }

        .hub-card--tasks:hover .hub-card {
          transform: translateY(-10px) rotate(1.5deg) scale(1.04);
        }

        .hub-card--clients {
          --orbit-x: -178px;
          --orbit-y: 252px;
          --orbit-duration: 35s;
          --orbit-delay: -20s;
        }

        .hub-card--clients:hover .hub-card {
          transform: translateY(-10px) rotate(-1.5deg) scale(1.04);
        }

        .hub-card--instagram {
          --orbit-x: 140px;
          --orbit-y: 258px;
          --orbit-duration: 33s;
          --orbit-delay: -25s;
        }

        .hub-card--instagram:hover .hub-card {
          transform: translateY(-6px) scale(1.01);
        }

        @keyframes centralReveal {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes coreFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes pulseRing {
          0%, 100% {
            opacity: 0.32;
            transform: scale(0.98);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.04);
          }
        }

        @keyframes slowSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes orbitSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes orbitCounterSpin {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(-360deg);
          }
        }

        @media (max-height: 860px) {
          .hub-orbit {
            height: min(58vh, 600px);
          }

          .hub-card {
            width: 208px;
          }

          .hub-card--whatsapp {
            --orbit-x: -104px;
            --orbit-y: -266px;
          }

          .hub-card--chat {
            --orbit-x: 194px;
            --orbit-y: -170px;
          }

          .hub-card--jussara {
            --orbit-x: -246px;
            --orbit-y: -44px;
          }

          .hub-card--tasks {
            --orbit-x: 236px;
            --orbit-y: 44px;
          }

          .hub-card--clients {
            --orbit-x: -152px;
            --orbit-y: 214px;
          }

          .hub-card--instagram {
            --orbit-x: 118px;
            --orbit-y: 224px;
          }
        }
      `}</style>

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
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
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
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
              />
              {selectedTemplateSlug ? (
                <button
                  type="button"
                  onClick={() => setSelectedTemplateSlug(null)}
                  className="h-11 shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm hover:bg-[var(--surface-2)]"
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
                          : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
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
