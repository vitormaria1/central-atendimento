"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SystemNotifications from "./system-notifications";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type TeamMessage = {
  id: string;
  channel: string;
  parentId?: string | null;
  senderName: string;
  body: string;
  createdAt: string;
};

type Channel = { slug: string; name: string; createdAt: string };

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamChatShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channel, setChannel] = useState("geral");
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TeamMessage[]>([]);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelSlug, setNewChannelSlug] = useState("");
  const [newChannelName, setNewChannelName] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);
  const [streamSinceId, setStreamSinceId] = useState<number | null>(null);
  const [threadRoot, setThreadRoot] = useState<TeamMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<TeamMessage[]>([]);
  const [threadComposer, setThreadComposer] = useState("");
  const [threadSending, setThreadSending] = useState(false);

  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<
    Record<string, Array<{ id: string; filename: string; mimetype?: string | null; sizeBytes: number }>>
  >({});

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }, []);

  const loadChannels = useCallback(async () => {
    const res = await fetch("/api/team-chat/channels", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: Channel[] };
    setChannels(data.items);
    if (data.items.length > 0 && !data.items.some((c) => c.slug === channel)) {
      setChannel(data.items[0]!.slug);
    }
  }, [channel]);

  const loadInitial = useCallback(async () => {
    const url = new URL("/api/team-chat/messages", window.location.origin);
    url.searchParams.set("channel", channel);
    url.searchParams.set("limit", "80");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setToast(data?.error ?? "Falha ao carregar mensagens");
      return;
    }
    const data = (await res.json()) as { items: TeamMessage[] };
    setMessages(data.items);
    const last = data.items[data.items.length - 1];
    if (last?.id) {
      const idNum = Number.parseInt(last.id, 10);
      if (Number.isFinite(idNum)) lastIdRef.current = idNum;
    }
    setStreamSinceId(lastIdRef.current);
    queueMicrotask(scrollToBottom);
  }, [channel, scrollToBottom]);

  async function loadThread(root: TeamMessage) {
    setThreadRoot(root);
    const url = new URL("/api/team-chat/messages", window.location.origin);
    url.searchParams.set("channel", channel);
    url.searchParams.set("parentId", root.id);
    url.searchParams.set("limit", "120");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: TeamMessage[] };
    setThreadMessages(data.items);
  }

  const pollNew = useCallback(async () => {
    const afterId = lastIdRef.current;
    const url = new URL("/api/team-chat/messages", window.location.origin);
    url.searchParams.set("channel", channel);
    url.searchParams.set("afterId", String(afterId));
    url.searchParams.set("limit", "200");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: TeamMessage[] };
    if (!data.items.length) return;
    setMessages((prev) => {
      const next = [...prev, ...data.items];
      const last = data.items[data.items.length - 1];
      const idNum = last?.id ? Number.parseInt(last.id, 10) : Number.NaN;
      if (Number.isFinite(idNum)) lastIdRef.current = Math.max(lastIdRef.current, idNum);
      return next;
    });
    queueMicrotask(scrollToBottom);
  }, [channel, scrollToBottom]);

  async function ensureAttachments(messageId: string) {
    if (attachmentsByMessageId[messageId]) return;
    const url = new URL("/api/team-chat/attachments", window.location.origin);
    url.searchParams.set("messageId", messageId);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      items: Array<{ id: string; filename: string; mimetype?: string | null; sizeBytes: number }>;
    };
    setAttachmentsByMessageId((prev) => ({ ...prev, [messageId]: data.items }));
  }

  async function uploadAttachments(messageId: string, files: File[]) {
    if (files.length === 0) return;
    const form = new FormData();
    form.set("messageId", messageId);
    for (const f of files) form.append("files", f);
    const res = await fetch("/api/team-chat/attachments/upload", { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Falha ao enviar arquivo");
    }
  }

  async function runSearch(q: string) {
    const query = q.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const url = new URL("/api/team-chat/search", window.location.origin);
      url.searchParams.set("channel", channel);
      url.searchParams.set("q", query);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: TeamMessage[] };
      setSearchResults(data.items);
    } finally {
      setSearching(false);
    }
  }

  async function sendMessage() {
    const body = composer.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch("/api/team-chat/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao enviar");
      }
      const data = (await res.json()) as { item: TeamMessage };
      const createdId = data.item?.id;
      if (createdId && composerFiles.length > 0) {
        await uploadAttachments(createdId, composerFiles);
      }
      setComposer("");
      setComposerFiles([]);
      await pollNew();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function sendThreadMessage() {
    const root = threadRoot;
    if (!root) return;
    const body = threadComposer.trim();
    if (!body) return;
    setThreadSending(true);
    try {
      const res = await fetch("/api/team-chat/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, parentId: root.id, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao enviar");
      }
      setThreadComposer("");
      await loadThread(root);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setThreadSending(false);
    }
  }

  async function createChannel() {
    const slug = newChannelSlug.trim().toLowerCase();
    const name = newChannelName.trim();
    if (!slug || !name) return;
    setCreatingChannel(true);
    try {
      const res = await fetch("/api/team-chat/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao criar canal");
      }
      setNewChannelSlug("");
      setNewChannelName("");
      await loadChannels();
      setChannel(slug);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar canal");
    } finally {
      setCreatingChannel(false);
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  useEffect(() => {
    void loadMe();
    void loadChannels();
  }, [loadChannels, loadMe]);

  useEffect(() => {
    void loadInitial();
    setThreadRoot(null);
    setThreadMessages([]);
    setSearch("");
    setSearchResults([]);
  }, [channel, loadInitial]);

  useEffect(() => {
    if (streamSinceId === null) return;

    let pollTimer: number | null = null;
    function startPolling() {
      if (pollTimer) return;
      pollTimer = window.setInterval(() => void pollNew(), 3000);
    }
    function stopPolling() {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
    }

    try {
      const es = new EventSource(
        `/api/team-chat/stream?channel=${encodeURIComponent(channel)}&sinceId=${encodeURIComponent(String(streamSinceId))}`,
      );
      eventSourceRef.current = es;
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data) as { type: string; item?: TeamMessage };
        if (data.type === "ping" || data.type === "hello") return;
        if (data.type === "message" && data.item) {
          setMessages((prev) => {
            if (prev.length > 0 && prev[prev.length - 1]?.id === data.item!.id) return prev;
            const idNum = Number.parseInt(data.item!.id, 10);
            if (Number.isFinite(idNum)) lastIdRef.current = Math.max(lastIdRef.current, idNum);
            return [...prev, data.item!];
          });
          queueMicrotask(scrollToBottom);
        }
      };
      es.onerror = () => startPolling();
      es.onopen = () => stopPolling();
    } catch {
      startPolling();
    }

    return () => {
      stopPolling();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [channel, pollNew, scrollToBottom, streamSinceId]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const t = window.setTimeout(() => void runSearch(search), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, channel]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <aside className="w-[360px] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_80%,black)]">
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/3"
            >
	              <div className="h-10 w-10 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center">
	                {/* eslint-disable-next-line @next/next/no-img-element */}
	                <img src="/logo-mark.png" alt="Logo" className="h-7 w-7" />
	              </div>
              <div className="text-left">
                <div className="text-sm font-semibold leading-tight">Chat Interno</div>
                <div className="text-xs text-[var(--muted)] leading-tight">{me ? me.agentName : "Carregando..."}</div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
              <SystemNotifications />
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="text-xs font-semibold text-[var(--muted)] tracking-wide uppercase">Canais</div>
            <div className="space-y-2">
              {channels.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">Carregando canais...</div>
              ) : null}
              {channels.map((c) => {
                const active = c.slug === channel;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setChannel(c.slug)}
                    className={[
                      "w-full rounded-2xl px-4 py-3 text-left ring-1 transition",
                      active
                        ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                        : "bg-white/5 ring-white/10 hover:bg-white/8",
                    ].join(" ")}
                  >
	                      <div className="flex items-center justify-between">
	                      <div className="text-sm font-medium"># {c.slug}</div>
	                      <div className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-2 py-1">
	                        Time
	                      </div>
	                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{c.name}</div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2">
	              <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_6%,var(--card))] ring-1 ring-[color-mix(in_srgb,var(--accent)_18%,var(--border))] p-3">
	                <div className="text-xs font-semibold">Criar canal</div>
	                <div className="mt-2 grid gap-2">
	                  <input
	                    value={newChannelSlug}
	                    onChange={(e) => setNewChannelSlug(e.target.value)}
	                    placeholder="slug (ex: suporte)"
	                    className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
	                  />
	                  <input
	                    value={newChannelName}
	                    onChange={(e) => setNewChannelName(e.target.value)}
	                    placeholder="nome (ex: Suporte)"
	                    className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
	                  />
                  <button
                    type="button"
                    onClick={() => void createChannel()}
                    disabled={creatingChannel || !newChannelSlug.trim() || !newChannelName.trim()}
                    className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {creatingChannel ? "Criando..." : "Criar"}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 text-xs text-[var(--muted)]">Dica: Enter envia • Shift+Enter quebra linha</div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="h-16 border-b border-[var(--border)] px-6 flex items-center justify-between bg-[var(--background)]/80 backdrop-blur">
            <div>
              <div className="text-sm font-semibold"># {channel}</div>
              <div className="text-xs text-[var(--muted)]">Somente para o time</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
              <div className="hidden md:block">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar mensagens..."
                  className="w-[320px] rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                />
              </div>
              <button
                type="button"
                onClick={() => void pollNew()}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
              >
                Atualizar
              </button>
            </div>
          </header>

          <div className="flex-1 flex min-h-0">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-3 min-w-0"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-busy={sending || searching}
            >
              {search.trim() ? (
                <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Busca</div>
                    <div className="text-xs text-[var(--muted)]">{searching ? "Procurando..." : `${searchResults.length} resultados`}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          const rootId = r.parentId ? r.parentId : r.id;
                          const root = messages.find((m) => m.id === rootId) ?? (r.parentId ? null : r);
                          if (root) void loadThread(root);
                        }}
                        className="w-full text-left rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold truncate">{r.senderName}</div>
                          <div className="text-[10px] text-[var(--muted)]">{formatTime(r.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-sm truncate">{r.body}</div>
                      </button>
                    ))}
                    {searchResults.length === 0 && !searching ? (
                      <div className="text-xs text-[var(--muted)]">Nenhum resultado.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {messages.length === 0 ? (
                <div className="text-sm text-[var(--muted)]">Sem mensagens ainda. Escreva a primeira.</div>
              ) : null}

              {messages.map((m) => {
                const mine = m.senderName === me?.agentName;
                const attachments = attachmentsByMessageId[m.id];
                return (
                  <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div className="max-w-[78%]">
                      <div
                        className={[
                          "rounded-3xl px-4 py-3 ring-1",
                          mine
                            ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] ring-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
                            : "bg-white/5 ring-white/10",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold">{m.senderName}</div>
                          <div className="text-[10px] text-[var(--muted)]">{formatTime(m.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm whitespace-pre-wrap break-words">{m.body}</div>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void loadThread(m)}
                            className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8"
                          >
                            Abrir tópico
                          </button>
                          <button
                            type="button"
                            onClick={() => void ensureAttachments(m.id)}
                            className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8"
                          >
                            {attachments ? `Anexos (${attachments.length})` : "Ver anexos"}
                          </button>
                        </div>

                        {attachments && attachments.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {attachments.map((a) => (
                              <a
                                key={a.id}
                                href={`/api/team-chat/attachments/download?id=${encodeURIComponent(a.id)}`}
                                className="block text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                              >
                                {a.filename}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {threadRoot ? (
              <div className="w-[420px] shrink-0 border-l border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,black)] flex flex-col">
                <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">Tópico</div>
                    <div className="text-xs text-[var(--muted)] truncate">{threadRoot.body}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setThreadRoot(null);
                      setThreadMessages([]);
                      setThreadComposer("");
                    }}
                    className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                  >
                    Fechar
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {threadMessages.length === 0 ? (
                    <div className="text-xs text-[var(--muted)]">Sem respostas ainda.</div>
                  ) : null}
                  {threadMessages.map((m) => {
                    const mine = m.senderName === me?.agentName;
                    return (
                      <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                        <div className="max-w-[92%]">
                          <div
                            className={[
                              "rounded-3xl px-4 py-3 ring-1",
                              mine
                                ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
                                : "bg-white/5 ring-white/10",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold">{m.senderName}</div>
                              <div className="text-[10px] text-[var(--muted)]">{formatTime(m.createdAt)}</div>
                            </div>
                            <div className="mt-2 text-sm whitespace-pre-wrap break-words">{m.body}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[var(--border)] p-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                      <textarea
                        value={threadComposer}
                        onChange={(e) => setThreadComposer(e.target.value)}
                        rows={2}
                        placeholder="Responder no tópico..."
                        className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendThreadMessage();
                          }
                        }}
                      />
                    </div>
                    <button
                      disabled={threadSending || threadComposer.trim().length === 0}
                      onClick={() => void sendThreadMessage()}
                      className="h-10 rounded-2xl bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {threadSending ? "Enviando..." : "Enviar"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="border-t border-[var(--border)] p-4 bg-[var(--background)]/80 backdrop-blur">
            <div className="flex items-end gap-3">
              <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={2}
                  placeholder="Escreva uma mensagem para o time..."
                  aria-label="Mensagem para o chat interno"
                  className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8 cursor-pointer">
                    Anexar
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      aria-label="Selecionar arquivos para anexar no chat interno"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        setComposerFiles(files.slice(0, 5));
                      }}
                    />
                  </label>
                  {composerFiles.length > 0 ? (
                    <div className="text-xs text-[var(--muted)] truncate">{composerFiles.map((f) => f.name).join(", ")}</div>
                  ) : (
                    <div className="text-xs text-[var(--muted)]">Até 5 arquivos (10MB cada)</div>
                  )}
                </div>
              </div>

              <button
                disabled={sending || composer.trim().length === 0}
                onClick={() => void sendMessage()}
                className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>

            {toast ? (
              <div
                className="mt-3 text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3"
                role="alert"
                aria-live="assertive"
              >
                {toast}
              </div>
            ) : null}
          </footer>
        </main>
      </div>
    </div>
  );
}
