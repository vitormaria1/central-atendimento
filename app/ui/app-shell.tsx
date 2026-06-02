"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clearWhatsappBadge } from "./whatsapp-notify-store";

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

type WaLabel = { id: string; name: string; color?: string | null };

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

function toMs(ts?: number | null) {
  if (!ts) return 0;
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

function formatTime(ts?: number) {
  if (!ts) return "";
  const ms = toMs(ts);
  const date = new Date(ms);
  return date.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dateKeyFromTs(ts?: number) {
  if (!ts) return "";
  const ms = toMs(ts);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabelFromKey(key: string) {
  if (!key) return "";
  const today = new Date();
  const todayKey = dateKeyFromTs(today.getTime());
  if (key === todayKey) return "Hoje";
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  if (!y || !m || !d) return key;
  const dt = new Date(y, m - 1, d);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dateKeyFromTs(yesterday.getTime());
  if (key === yKey) return "Ontem";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function getMessageText(m: MessageItem) {
  return m.text ?? m.content ?? "";
}

function stripOwnSignature(text: string, agentName?: string | null) {
  const name = (agentName ?? "").trim();
  if (!name) return text;
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const lines = t.split("\n");
  if (lines.length === 0) return text;
  const first = (lines[0] ?? "").trim();
  const sig1 = `*${name}:*`;
  const sig2 = `${name}:`;
  if (first === sig1 || first === sig2) {
    // remove first line + optional empty line following
    const rest = lines.slice(1);
    if (rest[0]?.trim() === "") rest.shift();
    return rest.join("\n").trimStart();
  }
  return text;
}

function includesIgnoreCase(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase());
}

function normalizeLabelName(name: string) {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

function dedupeWaLabels(labels: WaLabel[]) {
  const byName = new Map<string, WaLabel>();
  for (const l of labels) {
    const name = normalizeLabelName(l.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { ...l, name });
  }
  return Array.from(byName.values());
}

function colorFromName(name: string) {
  const s = normalizeLabelName(name).toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 62% 52%)`;
}

function labelColor(label: WaLabel) {
  const raw = (label.color ?? "").trim();
  return raw || colorFromName(label.name);
}

function renderHighlighted(text: string, q: string) {
  if (!q.trim()) return text;
  const query = q.trim();
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const parts: Array<string | { m: string }> = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(qLower, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push({ m: text.slice(idx, idx + query.length) });
    i = idx + query.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        typeof p === "string" ? (
          <span key={k}>{p}</span>
        ) : (
          <mark
            key={k}
            className="rounded px-1 bg-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--foreground)]"
          >
            {p.m}
          </mark>
        ),
      )}
    </>
  );
}

function isAudioLike(m: MessageItem, mimetype?: string) {
  if (mimetype?.startsWith("audio/")) return true;
  const mt = (m.messageType ?? "").toLowerCase();
  const t = (m.type ?? "").toLowerCase();
  return mt.includes("audio") || t === "audio" || t === "ptt" || mt.includes("ptt") || mt.includes("voice");
}

function extFromUrl(url: string) {
  try {
    const clean = url.split("?")[0] ?? url;
    const idx = clean.lastIndexOf(".");
    if (idx === -1) return "";
    return (clean.slice(idx + 1) || "").toLowerCase();
  } catch {
    return "";
  }
}

function isImageLike(m: MessageItem, mimetype?: string, mediaUrl?: string | null) {
  if (mimetype?.startsWith("image/")) return true;
  const mt = (m.messageType ?? "").toLowerCase();
  const t = (m.type ?? "").toLowerCase();
  if (mt.includes("image") || t === "image" || t === "sticker") return true;
  const ext = mediaUrl ? extFromUrl(mediaUrl) : "";
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp";
}

function isVideoLike(m: MessageItem, mimetype?: string, mediaUrl?: string | null) {
  if (mimetype?.startsWith("video/")) return true;
  const mt = (m.messageType ?? "").toLowerCase();
  const t = (m.type ?? "").toLowerCase();
  if (mt.includes("video") || t === "video") return true;
  const ext = mediaUrl ? extFromUrl(mediaUrl) : "";
  return ext === "mp4" || ext === "webm" || ext === "mov" || ext === "m4v";
}

function isPdfLike(mimetype?: string, mediaUrl?: string | null) {
  if (mimetype === "application/pdf") return true;
  const ext = mediaUrl ? extFromUrl(mediaUrl) : "";
  return ext === "pdf";
}

function readableFileName(raw: string, fallback: string, requireExtension = false) {
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (!decoded) return fallback;
    if (requireExtension && !/\.[a-z0-9]{2,8}$/i.test(decoded)) return fallback;
    return decoded;
  } catch {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    if (requireExtension && !/\.[a-z0-9]{2,8}$/i.test(trimmed)) return fallback;
    return trimmed;
  }
}

function fileNameFromUrl(url?: string | null, fallback = "documento") {
  if (!url) return fallback;
  try {
    const { pathname, searchParams } = new URL(url);
    const fromQuery = searchParams.get("filename") || searchParams.get("file") || searchParams.get("name");
    if (fromQuery) return readableFileName(fromQuery, fallback);
    const raw = pathname.split("/").filter(Boolean).at(-1) || fallback;
    return readableFileName(raw, fallback, true);
  } catch {
    const clean = url.split("?")[0] ?? url;
    const raw = clean.split("/").filter(Boolean).at(-1) || fallback;
    return readableFileName(raw, fallback, true);
  }
}

function fileLabelFromMime(mimetype?: string, mediaUrl?: string | null) {
  const ext = mediaUrl ? extFromUrl(mediaUrl) : "";
  if (mimetype === "application/pdf" || ext === "pdf") return "PDF";
  if (mimetype?.includes("word") || ext === "doc" || ext === "docx") return "DOC";
  if (mimetype?.includes("excel") || mimetype?.includes("spreadsheet") || ext === "xls" || ext === "xlsx") return "XLS";
  if (mimetype?.includes("presentation") || ext === "ppt" || ext === "pptx") return "PPT";
  return (ext || "arquivo").toUpperCase();
}

type ParsedContact = {
  caption?: string;
  name: string;
  subtitle?: string;
  phones: string[];
  vcard: string;
};

function normalizePhone(input: string) {
  const s = input.trim();
  if (!s) return "";
  const cleaned = s.replace(/[^\d+]/g, (m) => (m === "+" ? "+" : ""));
  return cleaned && cleaned !== "+" ? cleaned : s;
}

function parseVcard(vcard: string) {
  const lines = vcard
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  let name = "";
  let org = "";
  const phones: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/^item\d+\./i, "");
    const up = line.toUpperCase();
    if (up.startsWith("FN:")) name = line.slice(3).trim();
    if (up.startsWith("ORG:")) org = line.slice(4).trim();
    if (up.startsWith("N:") && !name) {
      const parts = line.slice(2).split(";");
      const n = [parts[1], parts[0]].filter(Boolean).join(" ").trim();
      if (n) name = n;
    }
    if (up.startsWith("TEL") || up.startsWith("PHONE:")) {
      const idx = line.indexOf(":");
      const val = idx >= 0 ? line.slice(idx + 1).trim() : "";
      const phone = normalizePhone(val);
      if (phone) phones.push(phone);
    }
  }

  return { name: name || org || "Contato", org: org || undefined, phones };
}

function buildVcard(name: string, phones: string[]) {
  const telLines = phones
    .filter(Boolean)
    .slice(0, 4)
    .map((p) => `TEL;TYPE=CELL:${p}`)
    .join("\n");
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\n${telLines}\nEND:VCARD\n`;
}

function parseContactFromText(text: string): ParsedContact | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  const beginIdx = t.toUpperCase().indexOf("BEGIN:VCARD");
  const endIdx = t.toUpperCase().indexOf("END:VCARD");

  let caption = "";
  let vcard = "";
  let name = "";
  let subtitle: string | undefined;
  let phones: string[] = [];

  if (beginIdx >= 0 && endIdx >= 0 && endIdx > beginIdx) {
    caption = t.slice(0, beginIdx).trim();
    vcard = t.slice(beginIdx, endIdx + "END:VCARD".length).trim();
    const parsed = parseVcard(vcard);
    name = parsed.name;
    phones = parsed.phones;
    subtitle = parsed.org;
  } else {
    const lines = t
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean);

    const useful = lines.filter((l) => !/^x-wa-/i.test(l));
    const phoneLines = useful.filter((l) => /^(phone|tel)\s*:/i.test(l) || /\+?\d[\d\s().-]{6,}\d/.test(l));
    phones = phoneLines
      .map((l) => {
        const m = l.match(/(\+?\d[\d\s().-]{6,}\d)/);
        return m ? normalizePhone(m[1]) : "";
      })
      .filter(Boolean);

    const candidates = useful.filter((l) => !/^(phone|tel)\s*:/i.test(l));
    caption = candidates.find((l) => l.endsWith(":")) ?? "";
    name =
      candidates.find((l) => !l.endsWith(":") && !/^\w+:\s*\+?\d/.test(l)) ??
      candidates.find((l) => !l.endsWith(":")) ??
      "Contato";

    subtitle = lines.some((l) => /^x-wa-biz-name:/i.test(l)) ? "Conta comercial" : undefined;
    vcard = buildVcard(name, phones);
  }

  const cleanCaption = caption.replace(/\s+/g, " ").trim();
  const cleanName = name.replace(/\s+/g, " ").trim();
  return {
    caption: cleanCaption || undefined,
    name: cleanName || "Contato",
    subtitle,
    phones: Array.from(new Set(phones)).slice(0, 4),
    vcard,
  };
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

function capDownloadCache(
  next: Record<string, { fileURL: string; mimetype?: string; unavailable?: boolean }>,
  maxSize: number,
) {
  const keys = Object.keys(next);
  if (keys.length <= maxSize) return next;
  const toDrop = keys.length - maxSize;
  const capped: Record<string, { fileURL: string; mimetype?: string; unavailable?: boolean }> = {};
  for (let i = toDrop; i < keys.length; i += 1) {
    const k = keys[i]!;
    capped[k] = next[k]!;
  }
  return capped;
}

type PendingAttachment = {
  file: File;
  objectUrl: string;
  kind: "image" | "video" | "audio" | "document";
  recorded?: boolean;
};

function VoiceWave({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={[
        "flex items-center gap-1 px-3 py-2 rounded-2xl ring-1 ring-white/10 bg-white/5",
        active ? "" : "hidden",
      ].join(" ")}
    >
      <div className="w-1.5 h-3 bg-[var(--primary)]/70 rounded-full animate-[voice_700ms_ease-in-out_infinite]" />
      <div className="w-1.5 h-5 bg-[var(--primary)] rounded-full animate-[voice_900ms_ease-in-out_infinite]" />
      <div className="w-1.5 h-4 bg-[var(--primary)]/80 rounded-full animate-[voice_800ms_ease-in-out_infinite]" />
      <div className="w-1.5 h-6 bg-[var(--primary)] rounded-full animate-[voice_1000ms_ease-in-out_infinite]" />
      <div className="w-1.5 h-3 bg-[var(--primary)]/70 rounded-full animate-[voice_750ms_ease-in-out_infinite]" />
      <style jsx>{`
        @keyframes voice {
          0%,
          100% {
            transform: scaleY(0.45);
            opacity: 0.65;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
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
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<"pendente" | "resolvido">("pendente");
  const [assignedAgentId, setAssignedAgentId] = useState<"vanderlei" | "gustavo" | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [chatMenuChatId, setChatMenuChatId] = useState<string | null>(null);
  const [chatMenuTagInput, setChatMenuTagInput] = useState("");
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [conversationSelectionMode, setConversationSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Record<string, boolean>>({});
  const [readAtByChatId, setReadAtByChatId] = useState<Record<string, number>>({});
  const sidebarMenuRef = useRef<HTMLDivElement | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [headerAssignOpen, setHeaderAssignOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCursor, setSearchCursor] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<Record<string, true>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [waLabels, setWaLabels] = useState<WaLabel[]>([]);
  const [downloadByMessageId, setDownloadByMessageId] = useState<
    Record<string, { fileURL: string; mimetype?: string; unavailable?: boolean }>
  >({});

  const lastRefreshAtRef = useRef<number>(0);
  const selectedChatIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldScrollToBottomRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const messageRefByKey = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const chatMenuChat = useMemo(
    () => chats.find((c) => c.chatId === chatMenuChatId) ?? null,
    [chats, chatMenuChatId],
  );

  useEffect(() => {
    setTags(selectedChat?.state?.tags ?? []);
  }, [selectedChatId, selectedChat?.state?.tags]);

  useEffect(() => {
    // ao trocar de chat, reseta modos
    setHeaderMenuOpen(false);
    setHeaderAssignOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    setSelectionMode(false);
    setSelectedMessageKeys({});
    setSearchCursor(0);
  }, [selectedChatId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("wa:readAtByChatId");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const obj = parsed as Record<string, unknown>;
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "number" && Number.isFinite(v)) next[k] = v;
      }
      setReadAtByChatId(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("wa:readAtByChatId", JSON.stringify(readAtByChatId));
    } catch {
      // ignore
    }
  }, [readAtByChatId]);

  useEffect(() => {
    if (!sidebarMenuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarMenuOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const el = sidebarMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setSidebarMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [sidebarMenuOpen]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const last = (c.lastMessageText ?? "").toLowerCase();
      return name.includes(q) || last.includes(q) || c.chatId.toLowerCase().includes(q);
    });
  }, [chats, search]);

  const tagFilteredChats = useMemo(() => {
    if (!favoritesOnly) return filteredChats;
    return filteredChats.filter((c) => (c.state?.tags ?? []).includes("Favoritos"));
  }, [favoritesOnly, filteredChats]);

  const visibleChats = useMemo(() => {
    if (assignedFilter === "all") return tagFilteredChats;
    return tagFilteredChats.filter((c) => c.state?.assignedAgentId === assignedFilter);
  }, [assignedFilter, tagFilteredChats]);

  const searchMatchKeys = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [] as string[];
    const keys: string[] = [];
    for (let idx = 0; idx < messages.length; idx += 1) {
      const m = messages[idx]!;
      const mine = Boolean(m.fromMe);
      const rawText = getMessageText(m);
      const text = mine ? stripOwnSignature(rawText, me?.agentName ?? null) : rawText;
      if (!text) continue;
      if (!includesIgnoreCase(text, q)) continue;
      const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
      keys.push(stableKey);
    }
    return keys;
  }, [me?.agentName, messages, searchQuery, selectedChatId]);

  useEffect(() => {
    // reseta cursor quando muda query
    setSearchCursor(0);
  }, [searchQuery]);

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

  const openConversationForNumber = useCallback(
    async (phoneRaw: string, displayName?: string) => {
      const phone = (phoneRaw ?? "").trim();
      if (!phone) {
        setToast("Contato sem número.");
        return;
      }
      const q = phone.replace(/[^\d+]/g, "");
      try {
        const url = new URL("/api/chats", window.location.origin);
        url.searchParams.set("search", q);
        url.searchParams.set("limit", "20");
        url.searchParams.set("offset", "0");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Falha ao buscar contato");
        }
        const data = (await res.json()) as { items: ChatListItem[] };
        const found = (data.items ?? []).find((c) => !c.isGroup) ?? (data.items ?? [])[0];

        if (found?.chatId) {
          setChats((prev) => {
            const map = new Map<string, ChatListItem>();
            for (const c of prev) map.set(c.chatId, c);
            for (const c of data.items ?? []) map.set(c.chatId, c);
            return Array.from(map.values());
          });
          setSelectedChatId(found.chatId);
          setToast(null);
          return;
        }

        // Ainda não existe conversa: cria uma “conversa nova” local.
        const provisional: ChatListItem = {
          chatId: q,
          name: (displayName ?? "").trim() || q,
          avatarUrl: "",
          isGroup: false,
          unreadCount: 0,
          lastMsgTimestamp: null,
          lastMessageText: "",
          state: null,
        };
        setChats((prev) => [provisional, ...prev.filter((c) => c.chatId !== provisional.chatId)]);
        setSelectedChatId(provisional.chatId);
        setToast(null);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Falha ao iniciar conversa");
      }
    },
    [],
  );

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
      items: Array<{
        chatId: string;
        status: "pendente" | "resolvido";
        assignedAgentId: "vanderlei" | "gustavo" | null;
        tags?: string[];
      }>;
    };
    const state = data.items[0];
    if (!state) return;
    setStatus(state.status);
    setAssignedAgentId(state.assignedAgentId);
    const normalizedTags = (state.tags ?? []).map(normalizeLabelName).filter(Boolean);
    setTags(Array.from(new Set(normalizedTags)).slice(0, 12));
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

  async function saveState(
    chatId: string,
    patch: { status?: "pendente" | "resolvido"; assignedAgentId?: "vanderlei" | "gustavo" | null; tags?: string[] },
  ) {
    await fetch(`/api/chat-state/${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await loadChats();
  }

  function normalizeTag(s: string) {
    return s
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 32);
  }

  async function addTag() {
    if (!selectedChatId) return;
    const next = normalizeTag(tagInput);
    if (!next) return;
    const updated = Array.from(new Set([...tags, next])).slice(0, 12);
    setTags(updated);
    setTagInput("");
    try {
      await saveState(selectedChatId, { tags: updated });
    } catch {
      setToast("Falha ao salvar etiquetas");
    }
  }

  async function removeTag(tag: string) {
    if (!selectedChatId) return;
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    try {
      await saveState(selectedChatId, { tags: updated });
    } catch {
      setToast("Falha ao salvar etiquetas");
    }
  }

  async function addTagToChat(chatId: string) {
    const next = normalizeTag(chatMenuTagInput);
    if (!next) return;
    const current = chats.find((c) => c.chatId === chatId)?.state?.tags ?? [];
    const updated = Array.from(new Set([...current, next])).slice(0, 12);
    setChatMenuTagInput("");
    try {
      await saveState(chatId, { tags: updated });
    } catch {
      setToast("Falha ao salvar etiquetas");
    }
  }

  async function removeTagFromChat(chatId: string, tag: string) {
    const current = chats.find((c) => c.chatId === chatId)?.state?.tags ?? [];
    const updated = current.filter((t) => t !== tag);
    try {
      await saveState(chatId, { tags: updated });
    } catch {
      setToast("Falha ao salvar etiquetas");
    }
  }

  async function toggleLabelForChat(chatId: string, labelNameRaw: string) {
    const labelName = normalizeLabelName(labelNameRaw);
    if (!labelName) return;
    const current = chats.find((c) => c.chatId === chatId)?.state?.tags ?? [];
    const exists = current.includes(labelName);
    const updated = exists
      ? current.filter((t) => t !== labelName)
      : Array.from(new Set([...current, labelName])).slice(0, 12);

    // Atualiza também o estado do chat selecionado (modal do header) se for o mesmo chat.
    if (selectedChatIdRef.current === chatId) {
      setTags(updated);
    }

    try {
      await saveState(chatId, { tags: updated });
    } catch {
      setToast("Falha ao salvar etiquetas");
    }
  }

  async function toggleLabelForSelected(labelName: string) {
    if (!selectedChatId) return;
    const normalized = normalizeLabelName(labelName);
    if (!normalized) return;
    const exists = tags.includes(normalized);
    if (exists) {
      await removeTag(normalized);
    } else {
      setTagInput(normalized);
      const updated = Array.from(new Set([...tags, normalized])).slice(0, 12);
      setTags(updated);
      setTagInput("");
      try {
        await saveState(selectedChatId, { tags: updated });
      } catch {
        setToast("Falha ao salvar etiquetas");
      }
    }
  }

  function isChatMutedLocal(chatId?: string | null) {
    if (!chatId) return false;
    try {
      return window.localStorage.getItem(`wa:mute:${chatId}`) === "1";
    } catch {
      return false;
    }
  }

  function setChatMutedLocal(chatId: string, muted: boolean) {
    try {
      window.localStorage.setItem(`wa:mute:${chatId}`, muted ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function copySelectedMessages() {
    const keys = Object.keys(selectedMessageKeys);
    if (keys.length === 0) return;
    const byKey = new Map<string, string>();
    for (let idx = 0; idx < messages.length; idx += 1) {
      const m = messages[idx]!;
      const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
      const mine = Boolean(m.fromMe);
      const raw = getMessageText(m);
      const t = mine ? stripOwnSignature(raw, me?.agentName ?? null) : raw;
      byKey.set(stableKey, t);
    }
    const text = keys
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .join("\n\n");
    void navigator.clipboard.writeText(text).then(
      () => setToast("Mensagens copiadas."),
      () => setToast("Falha ao copiar."),
    );
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

  async function fileToBase64(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
    const parts = dataUrl.split(",");
    return parts.length > 1 ? parts[1]! : dataUrl;
  }

  function inferMediaType(file: File): "image" | "video" | "audio" | "document" {
    const mt = (file.type ?? "").toLowerCase();
    if (mt.startsWith("image/")) return "image";
    if (mt.startsWith("video/")) return "video";
    if (mt.startsWith("audio/")) return "audio";
    return "document";
  }

  function setAttachment(file: File, recorded?: boolean) {
    const kind = inferMediaType(file);
    const objectUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, objectUrl, kind, recorded: Boolean(recorded) });
  }

  async function sendMediaFile(file: File, opts?: { recorded?: boolean }) {
    if (!selectedChatId) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const kind = inferMediaType(file);
      const type = opts?.recorded ? "ptt" : kind;
      const caption = composer.trim();

      const res = await fetch(`/api/chats/${encodeURIComponent(selectedChatId)}/send-media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          base64,
          fileName: file.name,
          mimetype: file.type || undefined,
          caption: caption.length > 0 ? caption : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
        throw new Error(
          data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao enviar arquivo",
        );
      }
      setComposer("");
      await refreshAll("sent-media");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendPendingAttachment() {
    if (!selectedChatId || !pendingAttachment) return;
    setUploading(true);
    try {
      const { file, kind, recorded } = pendingAttachment;
      const base64 = await fileToBase64(file);
      const type = recorded ? "ptt" : kind;
      const caption = composer.trim();

      const res = await fetch(`/api/chats/${encodeURIComponent(selectedChatId)}/send-media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          base64,
          fileName: file.name,
          mimetype: file.type || undefined,
          caption: caption.length > 0 ? caption : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
        throw new Error(data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao enviar arquivo");
      }

      setComposer("");
      URL.revokeObjectURL(pendingAttachment.objectUrl);
      setPendingAttachment(null);
      await refreshAll("sent-media");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar arquivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function cancelPendingAttachment() {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.objectUrl);
    setPendingAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function chooseBestAudioMimeType() {
    const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  async function startRecording() {
    if (recording) return;
    if (!selectedChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseBestAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
          // Voz no estilo WhatsApp: envia automaticamente ao parar.
          void sendMediaFile(file, { recorded: true }).catch((err) => {
            setToast(err instanceof Error ? err.message : "Falha ao enviar áudio");
          });
        } catch {
          // ignore
        } finally {
          mediaRecorderRef.current = null;
          recordedChunksRef.current = [];
          setRecording(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao iniciar gravação");
      setRecording(false);
    }
  }

  function stopRecording() {
    const r = mediaRecorderRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    return () => {
      if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.objectUrl);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureDownload = useCallback(
    async (messageId: string) => {
      const cached = downloadByMessageId[messageId];
      if (cached?.unavailable) throw new Error("Arquivo indisponível");
      if (cached?.fileURL) return cached;
      const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/download`, { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao baixar mídia");
      }
      const data = (await res.json()) as { fileURL?: string; mimetype?: string };
      if (!data.fileURL) {
        setDownloadByMessageId((prev) =>
          capDownloadCache({ ...prev, [messageId]: { fileURL: "", mimetype: data.mimetype, unavailable: true } }, MAX_DOWNLOAD_CACHE),
        );
        throw new Error("Arquivo indisponível");
      }
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

  function jumpToMatch(next: number) {
    if (!searchMatchKeys.length) return;
    const clamped = ((next % searchMatchKeys.length) + searchMatchKeys.length) % searchMatchKeys.length;
    setSearchCursor(clamped);
    const key = searchMatchKeys[clamped]!;
    const el = messageRefByKey.current[key];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    void loadMe();
    void loadChats();
  }, [loadChats, loadMe]);

  const loadWaLabels = useCallback(async () => {
    const res = await fetch("/api/labels", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { items?: WaLabel[] } | null;
    const items = (data?.items ?? []).filter((x): x is WaLabel => Boolean(x?.id && x?.name));
    setWaLabels(dedupeWaLabels(items));
  }, []);

  useEffect(() => {
    void loadWaLabels();
  }, [loadWaLabels]);

  useEffect(() => {
    clearWhatsappBadge();
  }, []);

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
      // Polling leve para manter a lista atualizada mesmo se o webhook/SSE falhar.
      pollTimer = window.setInterval(() => void refreshChatsOnly("poll:chatsOnly"), 20_000);
    }

    function stopPolling() {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
    }

    // Sempre liga o polling leve
    startPolling();

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
        // mantém polling leve
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
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)] relative">
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
              <div className="relative" ref={sidebarMenuRef}>
                <button
                  type="button"
                  onClick={() => setSidebarMenuOpen((v) => !v)}
                  className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 flex items-center justify-center text-lg"
                  aria-label="Mais opções"
                  title="Mais opções"
                >
                  ⋯
                </button>
                {sidebarMenuOpen ? (
                  <div className="absolute right-0 top-12 z-40 w-72 overflow-hidden rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarMenuOpen(false);
                        setToast("Em breve: novo grupo.");
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      Novo grupo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarMenuOpen(false);
                        setFavoritesOnly((v) => !v);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      {favoritesOnly ? "Todas as conversas" : "Mensagens favoritas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarMenuOpen(false);
                        setConversationSelectionMode((v) => !v);
                        setSelectedConversationIds({});
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      Selecionar conversas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = Date.now();
                        const next: Record<string, number> = { ...readAtByChatId };
                        for (const c of chats) next[c.chatId] = now;
                        setReadAtByChatId(next);
                        setSidebarMenuOpen(false);
                        setToast("Conversas marcadas como lidas.");
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      Marcar todas como lidas
                    </button>
                  </div>
                ) : null}
              </div>
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
                const chatTags = chat.state?.tags ?? [];
                const lastMs = toMs(chat.lastMsgTimestamp);
                const readAt = readAtByChatId[chat.chatId] ?? 0;
                const effectiveUnread = chat.unreadCount > 0 && lastMs > readAt ? chat.unreadCount : 0;
                return (
                  <div
                    key={chat.chatId}
                    className={[
                      "w-full px-4 py-3 border-b border-[var(--border)] transition",
                      active ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]" : "hover:bg-white/3",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (conversationSelectionMode) {
                            setSelectedConversationIds((prev) => ({ ...prev, [chat.chatId]: !prev[chat.chatId] }));
                            return;
                          }
                          setSelectedChatId(chat.chatId);
                          setReadAtByChatId((prev) => ({ ...prev, [chat.chatId]: Date.now() }));
                        }}
                        className="flex-1 min-w-0 text-left"
                        aria-label={`Abrir chat: ${chat.name}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {conversationSelectionMode ? (
                            <div
                              className={[
                                "h-5 w-5 rounded-md ring-2 shrink-0",
                                selectedConversationIds[chat.chatId]
                                  ? "bg-[var(--primary)] ring-[var(--primary)]"
                                  : "bg-transparent ring-[color-mix(in_srgb,var(--accent)_40%,white)]",
                              ].join(" ")}
                              aria-hidden="true"
                            />
                          ) : null}
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
                          {chatTags.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {chatTags.slice(0, 2).map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-2 py-0.5"
                                >
                                  {t}
                                </span>
                              ))}
                              {chatTags.length > 2 ? (
                                <span className="text-[10px] text-[var(--muted)]">+{chatTags.length - 2}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] text-[var(--muted)]">{formatTime(chat.lastMsgTimestamp ?? undefined)}</div>
                        <button
                          type="button"
                          onClick={() => {
                            setChatMenuChatId(chat.chatId);
                            setChatMenuTagInput("");
                          }}
                          className="h-8 w-8 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 flex items-center justify-center text-lg"
                          aria-label={`Mais opções do chat: ${chat.name}`}
                          title="Mais opções"
                        >
                          ⋯
                        </button>
                      </div>
                        <div className="flex items-center gap-2">
                          {chat.isGroup ? (
                            <span className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-2 py-1">
                              Grupo
                            </span>
                          ) : null}
                          {effectiveUnread > 0 ? (
                            <span className="text-[10px] rounded-full bg-[var(--primary)] text-white px-2 py-1">
                              {effectiveUnread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                </div>
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
                  {tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-2 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                      {tags.length > 3 ? <span className="text-[10px] text-[var(--muted)]">+{tags.length - 3}</span> : null}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--muted)] truncate">{selectedChatId ?? ""}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 relative">
                {selectionMode ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-[var(--muted)]">{Object.keys(selectedMessageKeys).length} selecionada(s)</div>
                    <button
                      type="button"
                      onClick={() => copySelectedMessages()}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMode(false);
                        setSelectedMessageKeys({});
                      }}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!selectedChatId}
                      onClick={() => setSearchOpen(true)}
                      className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60 flex items-center justify-center text-lg"
                      title="Pesquisar na conversa"
                      aria-label="Pesquisar na conversa"
                    >
                      🔎
                    </button>
                    <button
                      type="button"
                      disabled={!selectedChatId}
                      onClick={() => setHeaderMenuOpen((v) => !v)}
                      className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60 flex items-center justify-center text-lg"
                      title="Mais opções"
                      aria-label="Mais opções"
                    >
                      ⋯
                    </button>
                  </>
                )}

                {headerMenuOpen && selectedChatId ? (
                  <div className="absolute right-0 top-12 w-72 rounded-2xl bg-[var(--card)] ring-1 ring-[var(--border)] shadow-2xl overflow-hidden z-20">
                    {headerAssignOpen ? (
                      <>
                        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                          <div className="text-sm font-semibold">Atribuir conversa</div>
                          <button
                            type="button"
                            onClick={() => setHeaderAssignOpen(false)}
                            className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs hover:bg-white/8"
                          >
                            Voltar
                          </button>
                        </div>
                        {(
                          [
                            { id: "vanderlei", label: "Vanderlei" },
                            { id: "gustavo", label: "Gustavo" },
                            { id: null, label: "Sem responsável" },
                          ] satisfies ReadonlyArray<{
                            id: "vanderlei" | "gustavo" | null;
                            label: string;
                          }>
                        ).map((opt) => {
                          const selected = assignedAgentId === opt.id;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => {
                                setAssignedAgentId(opt.id);
                                void saveState(selectedChatId, { assignedAgentId: opt.id });
                                setHeaderAssignOpen(false);
                                setHeaderMenuOpen(false);
                                setToast(`Atribuído: ${opt.label}`);
                              }}
                              className={[
                                "w-full text-left px-4 py-3 hover:bg-white/5 text-sm flex items-center justify-between gap-3",
                                selected ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "",
                              ].join(" ")}
                            >
                              <span className="truncate">{opt.label}</span>
                              {selected ? <span className="text-[var(--primary)]">✓</span> : null}
                            </button>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setToast(`${selectedChat?.name ?? "Contato"} • ${selectedChatId}`);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Dados do contato
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setSearchOpen(true);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Pesquisar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setSelectionMode(true);
                            setSelectedMessageKeys({});
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Selecionar mensagens
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const muted = isChatMutedLocal(selectedChatId);
                            setChatMutedLocal(selectedChatId, !muted);
                            setHeaderMenuOpen(false);
                            setToast(!muted ? "Notificações silenciadas." : "Notificações ativadas.");
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          {isChatMutedLocal(selectedChatId) ? "Ativar notificações" : "Silenciar notificações"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            void toggleLabelForSelected("Favoritos");
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          {tags.includes("Favoritos") ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setTagPickerOpen(true);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Etiquetas
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeaderAssignOpen(true)}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Atribuir:{" "}
                          {assignedAgentId === "vanderlei"
                            ? "Vanderlei"
                            : assignedAgentId === "gustavo"
                              ? "Gustavo"
                              : "Sem responsável"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = status === "pendente" ? "resolvido" : "pendente";
                            setStatus(next);
                            void saveState(selectedChatId, { status: next });
                            setHeaderMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          {status === "pendente" ? "Fechar conversa" : "Reabrir conversa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setMessages([]);
                            void loadMessages(selectedChatId);
                            setToast("Conversa atualizada.");
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                        >
                          Limpar/atualizar conversa
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </header>

            {searchOpen ? (
              <div className="border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur px-5 py-3">
                <div className="flex items-center gap-2">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar na conversa…"
                    className="h-11 w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                    autoFocus
                  />
                  <div className="text-xs text-[var(--muted)] min-w-[72px] text-center">
                    {searchMatchKeys.length ? `${searchCursor + 1}/${searchMatchKeys.length}` : "0/0"}
                  </div>
                  <button
                    type="button"
                    onClick={() => jumpToMatch(searchCursor - 1)}
                    disabled={!searchMatchKeys.length}
                    className="h-11 w-11 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60"
                    title="Anterior"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToMatch(searchCursor + 1)}
                    disabled={!searchMatchKeys.length}
                    className="h-11 w-11 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60"
                    title="Próximo"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="h-11 rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 text-sm hover:bg-white/8"
                    title="Fechar busca"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}
  
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.map((m, idx) => {
                const mine = Boolean(m.fromMe);
                const rawText = getMessageText(m);
                const text = mine ? stripOwnSignature(rawText, me?.agentName ?? null) : rawText;
                const mtLower = (m.messageType ?? "").toLowerCase();
                const maybeContact = mtLower.includes("contact") || mtLower.includes("vcard") || /BEGIN:VCARD/i.test(text) || /X-WA-BIZ-/i.test(text);
                const contact = maybeContact ? parseContactFromText(text) : null;
                const dayKey = dateKeyFromTs(m.messageTimestamp);
                const prevDayKey = idx > 0 ? dateKeyFromTs(messages[idx - 1]?.messageTimestamp) : "";
                const showDaySeparator = Boolean(dayKey) && dayKey !== prevDayKey;
                const id = m.messageid ?? m.id ?? "";
                const cached = id ? downloadByMessageId[id] : undefined;
                const mediaUrl = (id && cached?.fileURL) || m.fileURL || null;
                const mimetype = cached?.mimetype;
                const showMedia = !contact && Boolean(mediaUrl);
                const showAudioPlayer = showMedia && isAudioLike(m, mimetype);
                const showImage = showMedia && !showAudioPlayer && isImageLike(m, mimetype, mediaUrl);
                const showVideo = showMedia && !showAudioPlayer && !showImage && isVideoLike(m, mimetype, mediaUrl);
                const showPdf = showMedia && !showAudioPlayer && !showImage && !showVideo && isPdfLike(mimetype, mediaUrl);
                const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
                return (
                  <div
                    key={stableKey}
                    ref={(el) => {
                      messageRefByKey.current[stableKey] = el;
                    }}
                  >
                    {showDaySeparator ? (
                      <div className="flex justify-center py-2">
                        <div className="text-xs rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-2">
                          {dayLabelFromKey(dayKey)}
                        </div>
                      </div>
                    ) : null}

                    <div className={mine ? "flex justify-end" : "flex justify-start"}>
                      {selectionMode ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMessageKeys((prev) => {
                              const next = { ...prev };
                              if (next[stableKey]) delete next[stableKey];
                              else next[stableKey] = true;
                              return next;
                            })
                          }
                          className="mr-2 mt-2 h-6 w-6 rounded-md ring-2 ring-white/20 bg-white/5 hover:bg-white/8 flex items-center justify-center"
                          aria-label="Selecionar mensagem"
                        >
                          {selectedMessageKeys[stableKey] ? "✓" : ""}
                        </button>
                      ) : null}
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

                      {contact ? (
                        <div className="mt-2">
                        {contact.caption ? (
                          <div className="text-sm whitespace-pre-wrap break-words">{contact.caption}</div>
                        ) : null}

                        <div className="mt-2 rounded-2xl bg-[color-mix(in_srgb,var(--background)_55%,black)] ring-1 ring-white/10 overflow-hidden">
                          <div className="p-4 flex items-center gap-3">
                            <div className="h-11 w-11 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-sm shrink-0">
                              {initialsFromName(contact.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate text-[color-mix(in_srgb,var(--accent)_75%,white)]">
                                {contact.name}
                              </div>
                              {contact.subtitle ? (
                                <div className="text-xs text-[var(--muted)] truncate">{contact.subtitle}</div>
                              ) : null}
                              {contact.phones.length ? (
                                <div className="mt-1 text-xs text-[var(--muted)] truncate">{contact.phones[0]}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="border-t border-white/10">
                            <div className="grid grid-cols-2">
                              <button
                                type="button"
                                className="px-4 py-3 text-sm text-[color-mix(in_srgb,var(--accent)_75%,white)] hover:bg-white/5"
                                onClick={() => {
                                  const phone = contact.phones[0] ?? "";
                                  if (!phone) return;
                                  void navigator.clipboard.writeText(phone).catch(() => null);
                                  setToast("Número copiado.");
                                }}
                              >
                                Copiar número
                              </button>
                              <button
                                type="button"
                                className="px-4 py-3 text-sm text-[color-mix(in_srgb,var(--accent)_75%,white)] hover:bg-white/5 border-l border-white/10"
                                onClick={() => {
                                  void openConversationForNumber(contact.phones[0] ?? "", contact.name);
                                }}
                              >
                                Conversar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      ) : text.trim().length > 0 ? (
                        <div className="mt-1 text-sm whitespace-pre-wrap break-words">
                          {searchQuery.trim() ? renderHighlighted(text, searchQuery) : text}
                        </div>
                      ) : null}

                      {showMedia ? (
                        <div className="mt-2">
                          {showAudioPlayer ? (
                            mediaUrl ? (
                              <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 overflow-hidden">
                                <audio
                                  controls
                                  preload="metadata"
                                  src={mediaUrl}
                                  className="block w-[520px] max-w-full h-16"
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
                        ) : mediaUrl && showImage ? (
                          <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mediaUrl}
                              alt="Imagem enviada"
                              className="max-w-full rounded-2xl ring-1 ring-white/10"
                              style={{ maxHeight: 420 }}
                              loading="lazy"
                            />
                          </a>
                        ) : mediaUrl && showVideo ? (
                          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3">
                            <video controls preload="metadata" src={mediaUrl} className="w-[520px] max-w-full rounded-2xl" />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                              >
                                Abrir
                              </a>
                            </div>
                          </div>
                        ) : mediaUrl && showPdf ? (
                          <div className="w-[360px] max-w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--background)_62%,black)] px-3 py-3 hover:bg-white/8"
                              aria-label={`Abrir ${fileNameFromUrl(mediaUrl, "documento.pdf")}`}
                            >
                              <div className="relative flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-red-600 shadow-sm">
                                <div className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-t-[10px] border-l-slate-200 border-t-transparent" />
                                PDF
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{fileNameFromUrl(mediaUrl, "documento.pdf")}</div>
                                <div className="mt-0.5 text-xs text-[var(--muted)]">PDF • tocar para abrir</div>
                              </div>
                            </a>
                            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-3 py-2">
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                              >
                                Abrir
                              </a>
                              <a
                                href={mediaUrl}
                                download
                                className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                              >
                                Baixar
                              </a>
                            </div>
                          </div>
                        ) : mediaUrl ? (
                          <div className="w-[360px] max-w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--background)_62%,black)] px-3 py-3 hover:bg-white/8"
                              aria-label={`Abrir ${fileNameFromUrl(mediaUrl, "documento")}`}
                            >
                              <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[9px] font-black text-slate-700 shadow-sm">
                                {fileLabelFromMime(mimetype, mediaUrl)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{fileNameFromUrl(mediaUrl, "documento")}</div>
                                <div className="mt-0.5 text-xs text-[var(--muted)]">Documento • tocar para abrir</div>
                              </div>
                            </a>
                            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-3 py-2">
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                              >
                                Abrir
                              </a>
                              <a
                                href={mediaUrl}
                                download
                                className="text-sm rounded-full bg-white/5 ring-1 ring-white/10 px-4 py-2 hover:bg-white/8"
                              >
                                Baixar
                              </a>
                            </div>
                          </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-2 text-[10px] text-[var(--muted)] text-right">
                        {formatTime(m.messageTimestamp)}
                      </div>
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
                {pendingAttachment && pendingAttachment.kind === "document" ? (
                  <div className="mb-2 rounded-3xl bg-white/3 ring-1 ring-white/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          Anexo
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--muted)] truncate">{pendingAttachment.file.name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={cancelPendingAttachment}
                        className="shrink-0 rounded-2xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                      >
                        Remover
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs text-[var(--muted)]">Documento pronto para envio.</div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={!selectedChatId || uploading}
                        onClick={() => void sendPendingAttachment()}
                        className="rounded-2xl px-4 py-2 text-xs bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_28%,transparent)] disabled:opacity-60"
                      >
                        {uploading ? "Enviando..." : "Enviar anexo"}
                      </button>
                    </div>
                  </div>
                ) : null}

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

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const kind = inferMediaType(file);
                  if (kind === "document") {
                    setAttachment(file, false);
                  } else {
                    void sendMediaFile(file).catch((err) => setToast(err instanceof Error ? err.message : "Falha ao enviar arquivo"));
                  }
                }}
              />
              <button
                type="button"
                disabled={!selectedChatId || uploading}
                onClick={() => fileInputRef.current?.click()}
                className="h-12 w-12 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 disabled:opacity-60 flex items-center justify-center text-lg"
                title="Enviar arquivo/áudio"
              >
                📎
              </button>

              <VoiceWave active={recording} />
              <button
                type="button"
                disabled={!selectedChatId || uploading}
                onClick={() => (recording ? stopRecording() : void startRecording())}
                className={[
                  "h-12 w-12 rounded-2xl ring-1 disabled:opacity-60 flex items-center justify-center text-lg transition",
                  recording
                    ? "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] ring-[color-mix(in_srgb,var(--warning)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_24%,transparent)]"
                    : "bg-white/5 ring-white/10 hover:bg-white/8",
                ].join(" ")}
                title={recording ? "Parar gravação" : "Gravar áudio"}
              >
                {recording ? "■" : "🎙️"}
              </button>

              <button
                disabled={!selectedChatId || sending || uploading || composer.trim().length === 0}
                onClick={() => void sendMessage()}
                className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
              >
                {uploading ? "Enviando..." : sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </footer>
        </main>
      </div>

      {tagPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar"
            onClick={() => setTagPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Etiquetas do chat"
            className="relative w-full max-w-lg rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Etiquetas</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Organize o chat com etiquetas (ex.: Fiscal, Urgente).</div>
              </div>
              <button
                type="button"
                onClick={() => setTagPickerOpen(false)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Adicionar etiqueta…"
                aria-label="Adicionar etiqueta"
                className="h-11 w-full rounded-2xl bg-[color-mix(in_srgb,var(--background)_55%,black)] ring-1 ring-white/10 px-4 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTag();
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => void addTag()}
                disabled={!selectedChatId || !tagInput.trim()}
                className="h-11 shrink-0 rounded-2xl bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                Adicionar
              </button>
            </div>

            {waLabels.length > 0 ? (
              <div className="mt-4 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                <div className="text-sm font-medium">Etiquetas do WhatsApp</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {waLabels.map((l) => {
                    const checked = tags.includes(l.name);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => void toggleLabelForSelected(l.name)}
                        className={[
                          "min-h-[46px] rounded-2xl px-4 py-3 ring-1 text-left hover:bg-white/5",
                          checked
                            ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                            : "bg-white/0 ring-white/10",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="h-9 w-9 rounded-full ring-1 ring-white/10 shrink-0"
                                style={{ backgroundColor: labelColor(l) }}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{l.name}</div>
                                <div className="text-xs text-[var(--muted)]">id: {l.id}</div>
                            </div>
                          </div>
                          <div
                            className={[
                              "h-5 w-5 rounded-md ring-2 shrink-0",
                              checked
                                ? "bg-[var(--primary)] ring-[var(--primary)]"
                                : "bg-transparent ring-[color-mix(in_srgb,var(--accent)_40%,white)]",
                            ].join(" ")}
                            aria-hidden="true"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => void removeTag(t)}
                    className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                    title="Remover etiqueta"
                  >
                    {t} <span className="text-[var(--muted)]">✕</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-[var(--muted)]">Sem etiquetas ainda.</div>
            )}
          </div>
        </div>
      ) : null}

      {chatMenuChat ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar"
            onClick={() => setChatMenuChatId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Opções do chat"
            className="relative w-full max-w-lg rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">{chatMenuChat.name}</div>
                <div className="mt-1 text-sm text-[var(--muted)] truncate">{chatMenuChat.chatId}</div>
              </div>
              <button
                type="button"
                onClick={() => setChatMenuChatId(null)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = (chatMenuChat.state?.assignedAgentId ?? null) === "vanderlei" ? "gustavo" : "vanderlei";
                  void saveState(chatMenuChat.chatId, { assignedAgentId: next });
                }}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm hover:bg-white/8"
              >
                Atribuir: {chatMenuChat.state?.assignedAgentId === "vanderlei" ? "Vanderlei" : chatMenuChat.state?.assignedAgentId === "gustavo" ? "Gustavo" : "—"}
              </button>

              <button
                type="button"
                onClick={() => {
                  const current = chatMenuChat.state?.status ?? "pendente";
                  const next = current === "pendente" ? "resolvido" : "pendente";
                  void saveState(chatMenuChat.chatId, { status: next });
                }}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm hover:bg-white/8"
              >
                Status: {chatMenuChat.state?.status ?? "pendente"}
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="text-sm font-medium">Etiquetas</div>

              {waLabels.length > 0 ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-[var(--muted)]">Etiquetas do WhatsApp</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {waLabels.map((l) => {
                      const checked = (chatMenuChat.state?.tags ?? []).includes(l.name);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => void toggleLabelForChat(chatMenuChat.chatId, l.name)}
                          className={[
                            "min-h-[44px] rounded-2xl px-4 py-3 ring-1 text-left hover:bg-white/5",
                            checked
                              ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                              : "bg-white/0 ring-white/10",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="h-8 w-8 rounded-full ring-1 ring-white/10 shrink-0"
                                style={{ backgroundColor: labelColor(l) }}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{l.name}</div>
                              </div>
                            </div>
                            <div
                              className={[
                                "h-5 w-5 rounded-md ring-2 shrink-0",
                                checked
                                  ? "bg-[var(--primary)] ring-[var(--primary)]"
                                  : "bg-transparent ring-[color-mix(in_srgb,var(--accent)_40%,white)]",
                              ].join(" ")}
                              aria-hidden="true"
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-2">
                <input
                  value={chatMenuTagInput}
                  onChange={(e) => setChatMenuTagInput(e.target.value)}
                  placeholder="Adicionar etiqueta…"
                  aria-label="Adicionar etiqueta no chat"
                  className="h-11 w-full rounded-2xl bg-[color-mix(in_srgb,var(--background)_55%,black)] ring-1 ring-white/10 px-4 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addTagToChat(chatMenuChat.chatId);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void addTagToChat(chatMenuChat.chatId)}
                  disabled={!chatMenuChatId || !chatMenuTagInput.trim()}
                  className="h-11 shrink-0 rounded-2xl bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  Adicionar
                </button>
              </div>

              {(chatMenuChat.state?.tags ?? []).length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(chatMenuChat.state?.tags ?? []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => void removeTagFromChat(chatMenuChat.chatId, t)}
                      className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                      title="Remover etiqueta"
                    >
                      {t} <span className="text-[var(--muted)]">✕</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--muted)]">Sem etiquetas.</div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedChatId(chatMenuChat.chatId);
                  setChatMenuChatId(null);
                }}
                className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-4 py-3 text-sm hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
              >
                Abrir chat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 rounded-2xl bg-[var(--card)] ring-1 ring-[var(--border)] px-4 py-3 text-sm shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
