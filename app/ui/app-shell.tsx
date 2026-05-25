"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type ChatListItem = {
  chatId: string;
  name: string;
  avatarUrl?: string;
  isGroup: boolean;
  unreadCount: number;
  lastMsgTimestamp: number | null;
  lastMessageText: string;
  state: {
    status: "pendente" | "resolvido";
    assignedAgentId: "vanderlei" | "gustavo" | null;
    tags: string[];
    updatedAt: string;
  } | null;
};

type MessageItem = {
  id?: string;
  messageid?: string;
  chatid?: string;
  fromMe?: boolean;
  messageTimestamp?: number;
  messageType?: string;
  senderName?: string;
  text?: string;
  content?: string;
  type?: string;
  fileURL?: string;
};

const MAX_DOWNLOAD_CACHE = 300;

function formatTime(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getMessageText(m: MessageItem) {
  return m.text ?? m.content ?? "";
}

function isAudioLike(m: MessageItem, mimetype?: string) {
  if (mimetype?.startsWith("audio/")) return true;
  const mt = (m.messageType ?? "").toLowerCase();
  const t = (m.type ?? "").toLowerCase();
  return mt.includes("audio") || t === "audio" || t === "ptt" || mt.includes("ptt") || mt.includes("voice");
}

function playNotifySound() {
  try {
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => void ctx.close().catch(() => null);
  } catch {
    // Autoplay/permissions podem bloquear em alguns browsers.
  }
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (parts.length === 0) return "•";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
  const letters = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  return letters || (first[0] ?? "•").toUpperCase();
}

function capDownloadCache(next: Record<string, { fileURL: string; mimetype?: string }>, maxSize: number) {
  const keys = Object.keys(next);
  if (keys.length <= maxSize) return next;
  const toDrop = keys.length - maxSize;
  const capped: Record<string, { fileURL: string; mimetype?: string }> = {};
  for (let i = toDrop; i < keys.length; i += 1) {
    const k = keys[i]!;
    capped[k] = next[k]!;
  }
  return capped;
}

export default function AppShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);
  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "vanderlei" | "gustavo">("all");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"pendente" | "resolvido">("pendente");
  const [assignedAgentId, setAssignedAgentId] = useState<"vanderlei" | "gustavo" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [downloadByMessageId, setDownloadByMessageId] = useState<Record<string, { fileURL: string; mimetype?: string }>>(
    {},
  );

  const lastRefreshAtRef = useRef<number>(0);
  const selectedChatIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldScrollToBottomRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const last = (c.lastMessageText ?? "").toLowerCase();
      return name.includes(q) || last.includes(q) || c.chatId.toLowerCase().includes(q);
    });
  }, [chats, search]);

  const visibleChats = useMemo(() => {
    if (assignedFilter === "all") return filteredChats;
    return filteredChats.filter((c) => c.state?.assignedAgentId === assignedFilter);
  }, [assignedFilter, filteredChats]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  // Ao trocar de chat, queremos abrir já no final (estilo WhatsApp).
  useEffect(() => {
    if (!selectedChatId) return;
    shouldScrollToBottomRef.current = true;
  }, [selectedChatId]);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }, []);

  const loadChats = useCallback(async () => {
    const url = new URL("/api/chats", window.location.origin);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      setToast(data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao carregar chats");
      return [] as ChatListItem[];
    }
    const data = (await res.json()) as { items: ChatListItem[] };
    setChats(data.items);
    const current = selectedChatIdRef.current;
    if (data.items.length === 0) {
      setSelectedChatId(null);
      return data.items;
    }
    if (!current) {
      setSelectedChatId(data.items[0]!.chatId);
      return data.items;
    }
    if (!data.items.some((c) => c.chatId === current)) {
      setSelectedChatId(data.items[0]!.chatId);
    }
    return data.items;
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages?limit=80`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      setToast(data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao carregar mensagens");
      return;
    }
    const data = (await res.json()) as { items: MessageItem[] };
    setMessages(data.items);
  }, []);

  const loadChatState = useCallback(async (chatId: string) => {
    const res = await fetch(`/api/chat-state?chatIds=${encodeURIComponent(chatId)}`, { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setToast(data?.error ?? "Falha ao carregar status do chat");
      return;
    }
    const data = (await res.json()) as {
      items: Array<{ chatId: string; status: "pendente" | "resolvido"; assignedAgentId: "vanderlei" | "gustavo" | null }>;
    };
    const state = data.items[0];
    if (!state) return;
    setStatus(state.status);
    setAssignedAgentId(state.assignedAgentId);
  }, []);

  const refreshAll = useCallback(async (reason: string) => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 500) return;
    lastRefreshAtRef.current = now;

    const items = await loadChats();
    const chatIdToLoad = selectedChatIdRef.current ?? items[0]?.chatId ?? null;
    if (chatIdToLoad) {
      await Promise.all([loadMessages(chatIdToLoad), loadChatState(chatIdToLoad)]);
    }
    console.debug("refreshed", reason);
    if (reason === "manual") setToast("Atualizado");
  }, [loadChatState, loadChats, loadMessages]);

  const refreshChatsOnly = useCallback(
    async (reason: string) => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 500) return;
      lastRefreshAtRef.current = now;
      await loadChats();
      console.debug("refreshed(chatsOnly)", reason);
    },
    [loadChats],
  );

  async function saveState(chatId: string, patch: { status?: "pendente" | "resolvido"; assignedAgentId?: "vanderlei" | "gustavo" | null }) {
    await fetch(`/api/chat-state/${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await loadChats();
  }

  async function sendMessage() {
    if (!selectedChatId) return;
    const text = composer.trim();
    if (!text) return;

    setSending(true);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(selectedChatId)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Falha ao enviar");
      }
      setComposer("");
      await refreshAll("sent");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  const ensureDownload = useCallback(
    async (messageId: string) => {
      if (downloadByMessageId[messageId]?.fileURL) return downloadByMessageId[messageId]!;
      const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/download`, { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao baixar mídia");
      }
      const data = (await res.json()) as { fileURL?: string; mimetype?: string };
      if (!data.fileURL) throw new Error("Arquivo indisponível (sem fileURL)");
      setDownloadByMessageId((prev) =>
        capDownloadCache({ ...prev, [messageId]: { fileURL: data.fileURL!, mimetype: data.mimetype } }, MAX_DOWNLOAD_CACHE),
      );
      return { fileURL: data.fileURL, mimetype: data.mimetype };
    },
    [downloadByMessageId],
  );

  // Scroll para o final quando o chat abre/atualiza pela primeira vez após a troca.
  useLayoutEffect(() => {
    if (!shouldScrollToBottomRef.current) return;
    if (messages.length === 0) return;
    // Espera 2 frames para garantir layout estável (bolhas/mídias).
    let raf2: number | null = null;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
        shouldScrollToBottomRef.current = false;
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [messages]);

  // Áudios: pré-carrega automaticamente para já ficar pronto para dar play.
  useEffect(() => {
    if (!selectedChatId) return;
    if (messages.length === 0) return;

    const audioToPrefetch: string[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]!;
      const id = m.messageid ?? m.id ?? "";
      if (!id) continue;
      if (downloadByMessageId[id]?.fileURL) continue;
      if (!isAudioLike(m, downloadByMessageId[id]?.mimetype)) continue;
      // Só faz prefetch dos mais recentes para evitar flood.
      audioToPrefetch.push(id);
      if (audioToPrefetch.length >= 3) break;
    }

    if (audioToPrefetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const id of audioToPrefetch) {
        if (cancelled) return;
        try {
          await ensureDownload(id);
        } catch {
          // Silencioso: se falhar, o botão de "Carregar áudio" continua aparecendo.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [downloadByMessageId, ensureDownload, messages, selectedChatId]);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  useEffect(() => {
    void loadMe();
    void loadChats();
  }, [loadChats, loadMe]);

  useEffect(() => {
    if (!selectedChatId) return;
    void loadMessages(selectedChatId);
    void loadChatState(selectedChatId);
  }, [loadChatState, loadMessages, selectedChatId]);

  // SSE + fallback polling
  useEffect(() => {
    let pollTimer: number | null = null;

    function startPolling() {
      if (pollTimer) return;
      pollTimer = window.setInterval(() => void refreshAll("poll"), 15_000);
    }

    function stopPolling() {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
    }

    try {
      const es = new EventSource("/api/stream");
      eventSourceRef.current = es;
      es.onmessage = (ev) => {
        let data: { type?: string; chatId?: string } | null = null;
        try {
          data = JSON.parse(ev.data) as { type?: string; chatId?: string };
        } catch {
          return;
        }
        if (!data?.type || data.type === "ping" || data.type === "hello") return;
        const selected = selectedChatIdRef.current;
        const sameChat = Boolean(data.chatId && selected && data.chatId === selected);
        if (sameChat) {
          if (data.type === "chat_updated") void refreshAll("sse:chat_updated:selected");
          if (data.type === "message_received") {
            playNotifySound();
            void refreshAll("sse:message_received:selected");
          }
        } else {
          if (data.type === "chat_updated") void refreshChatsOnly("sse:chat_updated:chatsOnly");
          if (data.type === "message_received") {
            playNotifySound();
            void refreshChatsOnly("sse:message_received:chatsOnly");
          }
        }
      };
      es.onerror = () => {
        startPolling();
      };
      es.onopen = () => {
        stopPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      stopPolling();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [refreshAll, refreshChatsOnly]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <aside className="w-[440px] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_80%,black)]">
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center">
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

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-2xl bg-white/5 ring-1 ring-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setAssignedFilter((prev) => (prev === "vanderlei" ? "all" : "vanderlei"))}
                  className={[
                    "rounded-xl px-3 py-2 text-xs transition",
                    assignedFilter === "vanderlei"
                      ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                      : "hover:bg-white/5",
                  ].join(" ")}
                >
                  Vanderlei
                </button>
                <button
                  type="button"
                  onClick={() => setAssignedFilter((prev) => (prev === "gustavo" ? "all" : "gustavo"))}
                  className={[
                    "rounded-xl px-3 py-2 text-xs transition",
                    assignedFilter === "gustavo"
                      ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                      : "hover:bg-white/5",
                  ].join(" ")}
                >
                  Gustavo
                </button>
              </div>
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-[var(--border)]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
            />
          </div>

          <div className="overflow-y-auto h-[calc(100vh-64px-88px)]">
            {visibleChats.map((chat) => {
              const active = chat.chatId === selectedChatId;
              return (
                <button
                  key={chat.chatId}
                  onClick={() => setSelectedChatId(chat.chatId)}
                  className={[
                    "w-full text-left px-4 py-3 border-b border-[var(--border)] transition",
                    active
                      ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]"
                      : "hover:bg-white/3",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5 shrink-0 flex items-center justify-center">
                        {chat.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={chat.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-[var(--muted)]">{initialsFromName(chat.name)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{chat.name}</div>
                        <div className="text-xs text-[var(--muted)] truncate">{chat.lastMessageText}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="text-[10px] text-[var(--muted)]">{formatTime(chat.lastMsgTimestamp ?? undefined)}</div>
                      <div className="flex items-center gap-2">
                        {chat.isGroup ? (
                          <span className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-2 py-1">
                            Grupo
                          </span>
                        ) : null}
                        {chat.unreadCount > 0 ? (
                          <span className="text-[10px] rounded-full bg-[var(--primary)] text-white px-2 py-1">
                            {chat.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="h-16 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur px-5 flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5 shrink-0 flex items-center justify-center">
                {selectedChat?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedChat.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : selectedChat?.name ? (
                  <span className="text-xs font-semibold text-[var(--muted)]">{initialsFromName(selectedChat.name)}</span>
                ) : (
                  <span className="text-xs font-semibold text-[var(--muted)]">•</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{selectedChat?.name ?? "Selecione um chat"}</div>
                <div className="text-xs text-[var(--muted)] truncate">{selectedChatId ?? ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!selectedChatId}
                onClick={() => {
                  if (!selectedChatId) return;
                  const next = status === "pendente" ? "resolvido" : "pendente";
                  setStatus(next);
                  void saveState(selectedChatId, { status: next });
                }}
                className={[
                  "rounded-xl px-3 py-2 text-xs ring-1 hover:bg-white/8 disabled:opacity-60 transition",
                  status === "pendente"
                    ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] ring-[color-mix(in_srgb,var(--warning)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_18%,transparent)]",
                ].join(" ")}
              >
                {status === "pendente" ? "Marcar resolvido" : "Marcar pendente"}
              </button>
              <button
                disabled={!selectedChatId}
                onClick={() => {
                  if (!selectedChatId) return;
                  const next = assignedAgentId === "vanderlei" ? "gustavo" : "vanderlei";
                  setAssignedAgentId(next);
                  void saveState(selectedChatId, { assignedAgentId: next });
                }}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60"
              >
                Atribuir: {assignedAgentId === "vanderlei" ? "Vanderlei" : assignedAgentId === "gustavo" ? "Gustavo" : "—"}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.map((m, idx) => {
              const mine = Boolean(m.fromMe);
              const text = getMessageText(m);
              const id = m.messageid ?? m.id ?? "";
              const cached = id ? downloadByMessageId[id] : undefined;
              const mediaUrl = (id && cached?.fileURL) || m.fileURL || null;
              const mimetype = cached?.mimetype;
              const showMedia = Boolean(mediaUrl) || (m.messageType && m.messageType !== "Conversation" && text.trim().length === 0);
              const showAudioPlayer = showMedia && isAudioLike(m, mimetype);
              const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
              return (
                <div key={stableKey} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={[
                      showAudioPlayer ? "max-w-[92%]" : "max-w-[78%]",
                      "rounded-3xl px-4 py-3 ring-1",
                      mine
                        ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]"
                        : "bg-white/5 ring-white/10",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold">
                      {mine ? (me?.agentName ?? "Você") : (m.senderName ?? "Cliente")}
                      {":"}
                    </div>

                    {text.trim().length > 0 ? (
                      <div className="mt-1 text-sm whitespace-pre-wrap break-words">{text}</div>
                    ) : null}

                    {showMedia ? (
                      <div className="mt-2">
                        {showAudioPlayer ? (
                          mediaUrl ? (
                            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                              <audio
                                controls
                                preload="metadata"
                                src={mediaUrl}
                                className="w-[520px] max-w-full h-16 scale-110 origin-left"
                              />
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="text-sm text-[var(--muted)] truncate">Áudio</div>
                                <a
                                  href={mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                                >
                                  Baixar
                                </a>
                              </div>
                            </div>
                          ) : id ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm hover:bg-white/8"
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await ensureDownload(id);
                                  } catch (err) {
                                    setToast(err instanceof Error ? err.message : "Falha ao baixar áudio");
                                  }
                                })();
                              }}
                            >
                              Carregar áudio
                            </button>
                          ) : (
                            <div className="text-xs text-[var(--muted)]">Áudio sem ID</div>
                          )
                        ) : mediaUrl ? (
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
                          >
                            Abrir documento/arquivo
                          </a>
                        ) : id ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
                            onClick={() => {
                              void (async () => {
                                try {
                                  const d = await ensureDownload(id);
                                  window.open(d.fileURL, "_blank", "noopener,noreferrer");
                                } catch (err) {
                                  setToast(err instanceof Error ? err.message : "Falha ao baixar mídia");
                                }
                              })();
                            }}
                          >
                            Baixar/abrir documento
                          </button>
                        ) : (
                          <div className="text-xs text-[var(--muted)]">Mídia sem ID</div>
                        )}
                      </div>
                    ) : null}

                    <div className="mt-2 text-[10px] text-[var(--muted)] text-right">
                      {formatTime(m.messageTimestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <footer className="border-t border-[var(--border)] p-4 bg-[var(--background)]/80 backdrop-blur">
            <div className="flex items-end gap-3">
              <div className="flex-1 rounded-3xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={1}
                  placeholder="Escreva sua mensagem..."
                  className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <div className="mt-1 text-[10px] text-[var(--muted)]">
                  Enviado como <span className="text-[var(--foreground)]">{me?.agentName ?? "—"}</span> com assinatura automática.
                </div>
              </div>

              <button
                disabled={!selectedChatId || sending || composer.trim().length === 0}
                onClick={() => void sendMessage()}
                className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </footer>
        </main>
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 rounded-2xl bg-[var(--card)] ring-1 ring-[var(--border)] px-4 py-3 text-sm shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
