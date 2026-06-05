export type ChatPresenceStatus = "online" | "offline" | "typing";

export type ChatPresenceState = {
  presenceStatus?: string | null;
  lastSeenAt?: string | null;
  typingUntilAt?: string | null;
};

export type PresenceLabel = {
  text: string | null;
  tone: "online" | "offline" | "typing" | "unknown";
};

type PresenceUpdate = {
  presenceStatus?: ChatPresenceStatus | null;
  lastSeenAt?: string | null;
  typingUntilAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFirstString(source: Record<string, unknown> | null, nested: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key] ?? nested?.[key];
    const normalized = toNullableString(value);
    if (normalized) return normalized;
  }
  return null;
}

function readFirstBoolean(source: Record<string, unknown> | null, nested: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key] ?? nested?.[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "online", "typing"].includes(normalized)) return true;
      if (["false", "0", "no", "offline", "stopped", "stop"].includes(normalized)) return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return null;
}

function normalizeTimestampInput(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        const ms = num < 1_000_000_000_000 ? num * 1000 : num;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function normalizePresenceStatus(value: string | null): ChatPresenceStatus | null {
  if (value === "online" || value === "offline" || value === "typing") return value;
  return null;
}

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatLastSeen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const todayKey = today.toLocaleDateString("en-CA");
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  const dateKey = date.toLocaleDateString("en-CA");
  const clock = formatClock(iso);

  if (dateKey === todayKey) return `visto por último hoje às ${clock}`;
  if (dateKey === yesterdayKey) return `visto por último ontem às ${clock}`;
  return `visto por último em ${date.toLocaleDateString("pt-BR")} às ${clock}`;
}

export function resolvePresenceLabel(state: ChatPresenceState | null | undefined, nowMs = Date.now()): PresenceLabel {
  const typingUntil = normalizeTimestampInput(state?.typingUntilAt);
  const typingUntilMs = typingUntil ? new Date(typingUntil).getTime() : 0;
  const typingActive = typingUntilMs > nowMs;
  const status = (state?.presenceStatus ?? "").trim().toLowerCase();

  if (typingActive) return { text: "digitando...", tone: "typing" };
  if (status === "online") return { text: "online", tone: "online" };
  if (status === "typing") {
    if (state?.lastSeenAt) return { text: formatLastSeen(state.lastSeenAt), tone: "offline" };
    return { text: "online", tone: "online" };
  }

  const lastSeen = normalizeTimestampInput(state?.lastSeenAt);
  if (lastSeen) return { text: formatLastSeen(lastSeen), tone: "offline" };
  if (status === "offline") return { text: "offline", tone: "offline" };
  return { text: null, tone: "unknown" };
}

export function parsePresenceUpdate(payload: unknown, eventType: string): PresenceUpdate | null {
  const source = isRecord(payload) ? payload : null;
  const nested = isRecord(source?.presence) ? source.presence : null;
  const lowerEvent = (eventType ?? "").toLowerCase();

  const rawStatus =
    readFirstString(source, nested, [
      "presenceStatus",
      "presence_status",
      "presenceState",
      "presence_state",
      "status",
      "state",
      "presence",
    ])?.toLowerCase() ?? null;

  const isTyping =
    readFirstBoolean(source, nested, ["isTyping", "is_typing", "typing", "typingActive", "typing_active"]) ??
    lowerEvent.includes("typing");

  const typingStopped =
    lowerEvent.includes("stop typing") ||
    lowerEvent.includes("stopped typing") ||
    lowerEvent.includes("typing stop") ||
    lowerEvent.includes("typing ended");

  const isPresenceEvent =
    lowerEvent.includes("presence") ||
    lowerEvent.includes("online") ||
    lowerEvent.includes("offline") ||
    lowerEvent.includes("typing") ||
    lowerEvent.includes("seen") ||
    lowerEvent.includes("last seen") ||
    rawStatus !== null ||
    source?.isOnline !== undefined ||
    source?.isTyping !== undefined ||
    source?.lastSeenAt !== undefined ||
    source?.last_seen_at !== undefined ||
    source?.typingUntil !== undefined ||
    source?.typing_until !== undefined;

  if (!isPresenceEvent) return null;

  const lastSeenAt =
    normalizeTimestampInput(
      source?.lastSeenAt ??
        source?.last_seen_at ??
        source?.lastSeen ??
        source?.last_seen ??
        nested?.lastSeenAt ??
        nested?.last_seen_at ??
        nested?.lastSeen ??
        nested?.last_seen,
    ) ?? null;

  const typingUntilAt =
    normalizeTimestampInput(
      source?.typingUntil ??
        source?.typing_until ??
        source?.typingUntilAt ??
        source?.typing_until_at ??
        nested?.typingUntil ??
        nested?.typing_until ??
        nested?.typingUntilAt ??
        nested?.typing_until_at,
    ) ?? null;

  const onlineFlag =
    readFirstBoolean(source, nested, ["isOnline", "is_online", "online", "isConnected", "is_connected"]) ?? null;

  if (typingStopped) {
    return {
      presenceStatus: normalizePresenceStatus(rawStatus),
      lastSeenAt,
      typingUntilAt: null,
    };
  }

  if (isTyping || rawStatus === "typing") {
    return {
      presenceStatus: "typing",
      lastSeenAt,
      typingUntilAt: typingUntilAt ?? new Date(Date.now() + 12_000).toISOString(),
    };
  }

  if (rawStatus === "online" || onlineFlag === true) {
    return {
      presenceStatus: "online",
      lastSeenAt,
      typingUntilAt: null,
    };
  }

  if (rawStatus === "offline" || onlineFlag === false) {
    return {
      presenceStatus: "offline",
      lastSeenAt: lastSeenAt ?? normalizeTimestampInput(source?.lastSeenAt ?? source?.last_seen_at ?? nested?.lastSeenAt ?? nested?.last_seen_at),
      typingUntilAt: null,
    };
  }

  if (lastSeenAt || typingUntilAt) {
    return {
      presenceStatus: normalizePresenceStatus(rawStatus),
      lastSeenAt,
      typingUntilAt,
    };
  }

  return {
    presenceStatus: normalizePresenceStatus(rawStatus),
    lastSeenAt: null,
    typingUntilAt: null,
  };
}
