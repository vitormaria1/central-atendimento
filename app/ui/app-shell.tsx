"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type ChatListItem = {
  chatId: string;
  name: string;
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
  senderName?: string;
  text?: string;
  content?: string;
  type?: string;
};

function formatTime(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getMessageText(m: MessageItem) {
  return m.text ?? m.content ?? "";
}

function chipClass(active: boolean) {
  return [
    "rounded-full px-3 py-1 text-xs ring-1 transition",
    active
      ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
      : "bg-white/5 ring-white/10 hover:bg-white/8",
  ].join(" ");
}

export default function AppShell() {
  const [me, setMe] = useState<Agent | null>(null);
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"pendente" | "resolvido">("pendente");
  const [assignedAgentId, setAssignedAgentId] = useState<"vanderlei" | "gustavo" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const lastRefreshAtRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  async function loadMe() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }

  async function loadChats() {
    const url = new URL("/api/chats", window.location.origin);
    if (search.trim()) url.searchParams.set("search", search.trim());
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      setToast(data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao carregar chats");
      return;
    }
    const data = (await res.json()) as { items: ChatListItem[] };
    setChats(data.items);
    if (!selectedChatId && data.items.length > 0) setSelectedChatId(data.items[0]!.chatId);
  }

  async function loadMessages(chatId: string) {
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
  }

  async function loadChatState(chatId: string) {
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
  }

  async function refreshAll(reason: string) {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 500) return;
    lastRefreshAtRef.current = now;

    await loadChats();
    if (selectedChatId) {
      await Promise.all([loadMessages(selectedChatId), loadChatState(selectedChatId)]);
    }
    // eslint-disable-next-line no-console
    console.debug("refreshed", reason);
  }

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    void loadMe();
    void loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    void loadMessages(selectedChatId);
    void loadChatState(selectedChatId);
  }, [selectedChatId]);

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
        const data = JSON.parse(ev.data) as { type: string; chatId?: string };
        if (data.type === "ping" || data.type === "hello") return;
        if (data.type === "chat_updated") void refreshAll("sse:chat_updated");
        if (data.type === "message_received") void refreshAll("sse:message_received");
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
  }, [selectedChatId, search]);

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

            <button
              onClick={logout}
              className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
            >
              Sair
            </button>
          </div>

          <div className="p-4 border-b border-[var(--border)]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-3 text-sm outline-none focus:ring-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
            />
            <div className="mt-3 flex gap-2">
              <button
                className={chipClass(true)}
                onClick={() => void refreshAll("manual")}
                type="button"
              >
                Atualizar
              </button>
              <span className="text-xs text-[var(--muted)] self-center">Tempo real via webhook</span>
            </div>
          </div>

          <div className="overflow-y-auto h-[calc(100vh-64px-88px)]">
            {chats.map((chat) => {
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
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{chat.name}</div>
                      <div className="text-xs text-[var(--muted)] truncate">{chat.lastMessageText}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="text-[10px] text-[var(--muted)]">{formatTime(chat.lastMsgTimestamp ?? undefined)}</div>
                      <div className="flex items-center gap-2">
                        {chat.isGroup ? (
                          <span className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
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
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{selectedChat?.name ?? "Selecione um chat"}</div>
              <div className="text-xs text-[var(--muted)] truncate">{selectedChatId ?? ""}</div>
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
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60"
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
            {messages.map((m) => {
              const mine = Boolean(m.fromMe);
              const text = getMessageText(m);
              return (
                <div key={m.messageid ?? m.id ?? Math.random()} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={[
                      "max-w-[78%] rounded-3xl px-4 py-3 ring-1",
                      mine
                        ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]"
                        : "bg-white/5 ring-white/10",
                    ].join(" ")}
                  >
                    <div className="text-xs text-[var(--muted)] mb-1 flex items-center justify-between gap-2">
                      <span className="truncate">{mine ? "Você" : (m.senderName ?? "Cliente")}</span>
                      <span className="shrink-0">{formatTime(m.messageTimestamp)}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{text}</div>
                  </div>
                </div>
              );
            })}
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
