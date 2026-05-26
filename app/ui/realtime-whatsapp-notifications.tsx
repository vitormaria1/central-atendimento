"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearWhatsappBadge, dismissToast, incWhatsappBadge, pushToast, useWhatsappNotifyStore } from "./whatsapp-notify-store";

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

export default function RealtimeWhatsappNotifications() {
  const router = useRouter();
  const { toasts } = useWhatsappNotifyStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    async function connect() {
      const me = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!me || !me.ok) return;

      try {
        const es = new EventSource("/api/stream");
        eventSourceRef.current = es;

        es.onopen = () => {
          // ok
        };

        es.onerror = () => {
          // EventSource faz retry automaticamente, mas em alguns cenários (proxy/edge) ele pode morrer silenciosamente.
          try {
            es.close();
          } catch {
            // ignore
          }
          eventSourceRef.current = null;
          if (retryTimer) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => void connect(), 1500);
        };

        es.onmessage = (ev) => {
          let data: { type?: string; chatId?: string } | null = null;
          try {
            data = JSON.parse(ev.data) as { type?: string; chatId?: string };
          } catch {
            return;
          }
          if (!data?.type || data.type === "ping" || data.type === "hello") return;

          if (data.type === "message_received") {
            const path = window.location.pathname;
            const isOnWhatsapp = path === "/whatsapp";
            const shouldNotify = !isOnWhatsapp || document.hidden;

            if (shouldNotify) {
              incWhatsappBadge();
              pushToast({ title: "WhatsApp", body: "Nova mensagem recebida." });
              playNotifySound();
            }
          }
        };
      } catch {
        // ignore
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  // UI: popup no canto (estilo notificação)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-24px))] space-y-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            dismissToast(t.id);
            clearWhatsappBadge();
            router.push("/whatsapp");
          }}
          className="pointer-events-auto w-full text-left rounded-2xl bg-[var(--card)] ring-1 ring-[var(--border)] px-4 py-3 shadow-2xl hover:bg-[color-mix(in_srgb,var(--card)_92%,white)] animate-[toastIn_160ms_ease-out]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t.body}</div>
            </div>
            <span
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(t.id);
              }}
            >
              ×
            </span>
          </div>
          <style jsx>{`
            @keyframes toastIn {
              from {
                transform: translateY(8px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </button>
      ))}
    </div>
  );
}
