"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearAllNotifications,
  clearNotification,
  dismissSystemToast,
  markAllNotificationsRead,
  pushSystemNotification,
  useSystemNotificationsStore,
} from "./system-notifications-store";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type SystemNotificationStreamEvent = {
  type: "system_notification";
  kind?: "task_assigned" | "team_chat_message";
  title?: string;
  body?: string;
  href?: string;
  taskId?: string;
  channel?: string | null;
  assigneeAgentId?: string | null;
  senderAgentId?: string | null;
  actorName?: string | null;
  createdAt?: number;
};

type StreamEvent =
  | { type?: string; chatId?: string }
  | SystemNotificationStreamEvent;

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
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close().catch(() => null);
  } catch {
    // Browser pode bloquear áudio até interação.
  }
}

function BellIcon({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={open ? "h-5 w-5" : "h-5 w-5"}>
      <path
        d="M15 17H9m9-4V11a6 6 0 10-12 0v2l-1.5 2.5A1 1 0 006.36 17h11.28a1 1 0 00.86-1.5L17 13z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 20a2.25 2.25 0 002.12-1.5H9.88A2.25 2.25 0 0012 20z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function formatTime(iso: number) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SystemNotifications() {
  const router = useRouter();
  const { notifications, toasts } = useSystemNotificationsStore();
  const [me, setMe] = useState<Agent | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unread = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Agent;
      setMe(data);
    })();
  }, []);

  useEffect(() => {
    if (!me) return;

    try {
      const es = new EventSource("/api/stream");
      eventSourceRef.current = es;
      es.onmessage = (ev) => {
        let data: StreamEvent | null = null;
        try {
          data = JSON.parse(ev.data) as StreamEvent;
        } catch {
          return;
        }
        if (!data?.type || data.type === "ping" || data.type === "hello") return;

        if (data.type !== "system_notification") return;
        const notification = data as SystemNotificationStreamEvent;
        if (notification.kind === "task_assigned" && notification.assigneeAgentId && notification.assigneeAgentId !== me.agentId) return;
        if (notification.kind === "team_chat_message" && notification.senderAgentId === me.agentId) return;

        pushSystemNotification({
          kind: notification.kind ?? "team_chat_message",
          title: notification.title ?? "Nova notificação",
          body: notification.body ?? "",
          href: notification.href,
          taskId: notification.taskId,
          channel: notification.channel ?? null,
          assigneeAgentId: notification.assigneeAgentId ?? null,
          senderAgentId: notification.senderAgentId ?? null,
          actorName: notification.actorName ?? null,
          createdAt: notification.createdAt,
        });
        playNotifySound();
      };
      es.onerror = () => {
        // Mantém simples: o navegador já faz retry do EventSource.
      };
    } catch {
      // ignore
    }

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [me]);

  useEffect(() => {
    if (!panelOpen) return;
    markAllNotificationsRead();
  }, [panelOpen]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || bellButtonRef.current?.contains(target)) return;
      setPanelOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (!me) return null;

  return (
    <>
      <div className="pointer-events-auto relative z-[120]">
        <button
          ref={bellButtonRef}
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="relative flex h-10 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm shadow-[0_12px_32px_rgba(15,23,42,0.14)] hover:bg-[var(--surface-1)]"
          aria-haspopup="dialog"
          aria-expanded={panelOpen}
        >
          <span className="text-[var(--foreground)]">
            <BellIcon open={panelOpen} />
          </span>
          <span className="hidden lg:inline">Notificações</span>
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        {panelOpen ? (
          <div className="fixed inset-0 z-[130] pointer-events-none">
            <div
              ref={panelRef}
              className="pointer-events-auto absolute right-4 top-20 w-[min(390px,calc(100vw-1rem))] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Notificações</div>
                  <div className="text-[11px] text-[var(--muted)]">Tarefas e chat interno</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => clearAllNotifications()}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-1)]"
                  >
                    Limpar tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-1)]"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                    Nenhuma notificação por enquanto.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={[
                          "relative rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--surface-1)]",
                          notification.read ? "opacity-80" : "bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPanelOpen(false);
                            if (notification.href) router.push(notification.href);
                            if (!notification.read) markAllNotificationsRead();
                          }}
                          className="w-full text-left pr-10"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{notification.title}</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">{notification.body}</div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                              {notification.kind === "task_assigned" ? "Tarefa" : "Chat interno"} • {formatTime(notification.createdAt)}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                          className="absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                          aria-label="Remover notificação"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none fixed right-4 top-24 z-[135] w-[min(360px,calc(100vw-1rem))] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_94%,var(--background))] px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur animate-[toastSlide_180ms_ease-out]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{toast.title}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">{toast.body}</div>
              </div>
              <button
                type="button"
                onClick={() => dismissSystemToast(toast.id)}
                className="text-lg leading-none text-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="Fechar notificação"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes toastSlide {
          from {
            transform: translateY(-8px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
