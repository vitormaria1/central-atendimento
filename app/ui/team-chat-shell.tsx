"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type TeamMessage = {
  id: string;
  channel: string;
  senderName: string;
  body: string;
  createdAt: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamChatShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);
  const [channel] = useState("geral");
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);
  const [streamSinceId, setStreamSinceId] = useState<number | null>(null);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  async function loadMe() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }

  async function loadInitial() {
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
  }

  async function pollNew() {
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
      setComposer("");
      await pollNew();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [channel, streamSinceId]);

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
              <div className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.png" alt="Logo" className="h-7 w-7" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold leading-tight">Chat Interno</div>
                <div className="text-xs text-[var(--muted)] leading-tight">{me ? me.agentName : "Carregando..."}</div>
              </div>
            </button>

            <button
              onClick={logout}
              className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
            >
              Sair
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="text-xs font-semibold text-[var(--muted)] tracking-wide uppercase">Canais</div>
            <button
              type="button"
              className="w-full rounded-2xl px-4 py-3 text-left ring-1 transition bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium"># geral</div>
                <div className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">Time</div>
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Comunicação interna rápida</div>
            </button>

            <div className="pt-3 text-xs text-[var(--muted)]">Dica: Enter envia • Shift+Enter quebra linha</div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="h-16 border-b border-[var(--border)] px-6 flex items-center justify-between bg-[var(--background)]/80 backdrop-blur">
            <div>
              <div className="text-sm font-semibold"># {channel}</div>
              <div className="text-xs text-[var(--muted)]">Somente para o time</div>
            </div>

            <button
              type="button"
              onClick={() => void pollNew()}
              className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
            >
              Atualizar
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
            {messages.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">Sem mensagens ainda. Escreva a primeira.</div>
            ) : null}

            {messages.map((m) => {
              const mine = m.senderName === me?.agentName;
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[70%]">
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
                    </div>
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
                  rows={2}
                  placeholder="Escreva uma mensagem para o time..."
                  className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
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
              <div className="mt-3 text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3">{toast}</div>
            ) : null}
          </footer>
        </main>
      </div>
    </div>
  );
}
