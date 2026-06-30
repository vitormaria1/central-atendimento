"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resolvePresenceLabel, type ChatPresenceState } from "@/lib/chat-presence";
import { clearWhatsappBadge } from "./whatsapp-notify-store";
import SystemNotifications from "./system-notifications";

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
    presenceStatus?: string | null;
    lastSeenAt?: string | null;
    typingUntilAt?: string | null;
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
  sender_pn?: string;
  text?: string;
  content?: string;
  type?: string;
  fileURL?: string;
  messageStatus?: string;
  status?: string;
  ack?: number;
  deliveredAt?: number;
  receivedAt?: number;
  readAt?: number;
  seenAt?: number;
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

function parseAgentSignature(text: string) {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const first = (t.split("\n")[0] ?? "").trim().toLowerCase();
  if (first === "*vanderlei:*" || first === "vanderlei:") return "Vanderlei";
  if (first === "*gustavo:*" || first === "gustavo:") return "Gustavo";
  return null;
}

function stripAgentSignature(text: string) {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const lines = t.split("\n");
  if (lines.length === 0) return text;
  const first = (lines[0] ?? "").trim().toLowerCase();
  if (first === "*vanderlei:*" || first === "vanderlei:" || first === "*gustavo:*" || first === "gustavo:") {
    const rest = lines.slice(1);
    if (rest[0]?.trim() === "") rest.shift();
    return rest.join("\n").trimStart();
  }
  return text;
}

function getDisplayMessageText(m: MessageItem) {
  return m.fromMe ? stripAgentSignature(getMessageText(m)) : getMessageText(m);
}

function getDisplaySenderName(m: MessageItem, fallbackAgentName?: string | null) {
  if (!m.fromMe) return m.senderName ?? "Cliente";
  return parseAgentSignature(getMessageText(m)) ?? fallbackAgentName ?? "Você";
}

function getDisplayChatPreviewText(text: string) {
  const normalized = stripAgentSignature(text ?? "");
  return normalized || text || "";
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

type ReceiptStage = "sent" | "delivered" | "read";

function normalizeReceiptStage(m: MessageItem): ReceiptStage | null {
  if (!m.fromMe) return null;

  const raw = `${m.messageStatus ?? ""} ${m.status ?? ""}`.toLowerCase().trim();
  if (raw.includes("read") || raw.includes("seen") || m.readAt || m.seenAt) return "read";
  if (raw.includes("delivered") || raw.includes("received") || m.deliveredAt || m.receivedAt) return "delivered";
  if (raw.includes("sent") || raw.includes("server") || raw.includes("pending") || raw.includes("sending")) return "sent";

  if (typeof m.ack === "number") {
    if (m.ack >= 3) return "read";
    if (m.ack >= 2) return "delivered";
    return "sent";
  }

  return "sent";
}

function receiptClass(stage: ReceiptStage) {
  if (stage === "read") return "text-[#53bdeb]";
  return "text-[var(--muted)]";
}

function ReceiptTicks({ stage, animate }: { stage: ReceiptStage; animate?: boolean }) {
  const label = stage === "sent" ? "Enviada" : stage === "delivered" ? "Recebida" : "Visualizada";
  return (
    <span
      className={[
        "inline-flex items-center text-[11px] leading-none transition-all duration-200",
        receiptClass(stage),
        animate ? "scale-110 -translate-y-0.5" : "",
      ].join(" ")}
      aria-label={label}
    >
      {stage === "sent" ? "✓" : "✓✓"}
    </span>
  );
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

function isDownloadableMediaLike(m: MessageItem, mimetype?: string, mediaUrl?: string | null) {
  if (mimetype && !mimetype.startsWith("text/")) return true;
  if (mediaUrl) {
    return (
      isAudioLike(m, mimetype) ||
      isImageLike(m, mimetype, mediaUrl) ||
      isVideoLike(m, mimetype, mediaUrl) ||
      isPdfLike(mimetype, mediaUrl)
    );
  }

  const mt = (m.messageType ?? "").toLowerCase();
  const t = (m.type ?? "").toLowerCase();
  const mediaHints = ["audio", "document", "file", "image", "media", "ptt", "sticker", "video"];
  return mediaHints.some((hint) => mt.includes(hint) || t.includes(hint));
}

function normalizePhone(input: string) {
  const s = input.trim();
  if (!s) return "";
  const cleaned = s.replace(/[^\d+]/g, (m) => (m === "+" ? "+" : ""));
  return cleaned && cleaned !== "+" ? cleaned : s;
}

function extractPhoneFromChatId(chatId: string) {
  const raw = chatId.trim();
  if (!raw) return "";
  const base = raw.includes("@") ? raw.split("@")[0] ?? "" : raw;
  const phone = normalizePhone(base);
  return /\d/.test(phone) ? phone : "";
}

function formatDateTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function presenceToneClass(tone?: "online" | "offline" | "typing" | "unknown") {
  if (tone === "online") return "bg-emerald-400";
  if (tone === "typing") return "bg-amber-400";
  if (tone === "offline") return "bg-[var(--muted)]";
  return "bg-white/20";
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

type ContactProfile = {
  name: string;
  avatarLabel: string;
  avatarUrl?: string;
  subtitle?: string;
  presenceText?: string | null;
  presenceTone?: "online" | "offline" | "typing" | "unknown";
  phone?: string;
  isGroup: boolean;
  chatId: string;
  status: "pendente" | "resolvido" | null;
  assignedAgentId: "vanderlei" | "gustavo" | null;
  tags: string[];
  unreadCount: number;
  lastMessageText: string;
  lastActivityAt?: string;
};

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
  id: string;
  file: File;
  objectUrl: string;
  kind: "image" | "video" | "audio" | "document";
  recorded?: boolean;
};

const CHAT_ASSIGN_OPTIONS = [
  { id: "vanderlei", label: "Vanderlei" },
  { id: "gustavo", label: "Gustavo" },
  { id: null, label: "Sem responsável" },
] satisfies ReadonlyArray<{
  id: "vanderlei" | "gustavo" | null;
  label: string;
}>;

type FileDragEvent = {
  preventDefault: () => void;
  dataTransfer: DataTransfer;
};

type ClipboardWithFiles = {
  preventDefault: () => void;
  clipboardData: DataTransfer;
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<"pendente" | "resolvido">("pendente");
  const [assignedAgentId, setAssignedAgentId] = useState<"vanderlei" | "gustavo" | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [chatMenuChatId, setChatMenuChatId] = useState<string | null>(null);
  const [chatMenuPosition, setChatMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [chatMenuAssignOpen, setChatMenuAssignOpen] = useState(false);
  const [chatMenuTagInput, setChatMenuTagInput] = useState("");
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [sidebarMenuPosition, setSidebarMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [conversationSelectionMode, setConversationSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Record<string, boolean>>({});
  const [readAtByChatId, setReadAtByChatId] = useState<Record<string, number>>({});
  const [manualUnreadByChatId, setManualUnreadByChatId] = useState<Record<string, true>>({});
  const sidebarMenuRef = useRef<HTMLDivElement | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [headerAssignOpen, setHeaderAssignOpen] = useState(false);
  const [contactProfileOpen, setContactProfileOpen] = useState(false);
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
  const [pinnedByChatId, setPinnedByChatId] = useState<Record<string, true>>({});
  const [dragActive, setDragActive] = useState(false);

  const lastRefreshAtRef = useRef<number>(0);
  const selectedChatIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldScrollToBottomRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const messageRefByKey = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragCounterRef = useRef(0);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const chatMenuChat = useMemo(
    () => chats.find((c) => c.chatId === chatMenuChatId) ?? null,
    [chats, chatMenuChatId],
  );

  function openChatActionMenu(chatId: string, x: number, y: number) {
    const width = 320;
    const height = 468;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    setChatMenuChatId(chatId);
    setChatMenuAssignOpen(false);
    setChatMenuTagInput("");
    setChatMenuPosition({
      left: Math.min(Math.max(margin, x), maxLeft),
      top: Math.min(Math.max(margin, y), maxTop),
    });
  }

  function closeChatActionMenu() {
    setChatMenuAssignOpen(false);
    setChatMenuPosition(null);
  }
  const contactProfile = useMemo<ContactProfile | null>(() => {
    if (!selectedChat) return null;
    const latestIncomingPhone = [...messages]
      .reverse()
      .find((m) => Boolean(m.sender_pn?.trim() && !m.fromMe))?.sender_pn?.trim();
    const phone = normalizePhone(latestIncomingPhone ?? "") || extractPhoneFromChatId(selectedChat.chatId);
    const subtitle = selectedChat.isGroup ? "Grupo" : phone ? "Conta do WhatsApp" : "Contato";
    const presence = selectedChat.isGroup
      ? { text: null, tone: "unknown" as const }
      : resolvePresenceLabel(selectedChat.state as ChatPresenceState | null | undefined, presenceNow);
    const lastActivityAt = selectedChat.lastMsgTimestamp
      ? new Date(toMs(selectedChat.lastMsgTimestamp)).toLocaleString("pt-BR", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : selectedChat.state?.updatedAt
        ? formatDateTime(selectedChat.state.updatedAt)
        : undefined;
    return {
      name: selectedChat.name,
      avatarLabel: initialsFromName(selectedChat.name),
      avatarUrl: selectedChat.avatarUrl || undefined,
      subtitle,
      presenceText: presence.text,
      presenceTone: presence.tone,
      phone: phone || undefined,
      isGroup: selectedChat.isGroup,
      chatId: selectedChat.chatId,
      status: selectedChat.state?.status ?? null,
      assignedAgentId: selectedChat.state?.assignedAgentId ?? null,
      tags: selectedChat.state?.tags ?? [],
      unreadCount: selectedChat.unreadCount,
      lastMessageText: getDisplayChatPreviewText(selectedChat.lastMessageText) || "Sem mensagem recente",
      lastActivityAt,
    };
  }, [messages, presenceNow, selectedChat]);

  useEffect(() => {
    setTags(selectedChat?.state?.tags ?? []);
  }, [selectedChatId, selectedChat?.state?.tags]);

  useEffect(() => {
    // ao trocar de chat, reseta modos
    setHeaderMenuOpen(false);
    setHeaderAssignOpen(false);
    setChatMenuAssignOpen(false);
    setChatMenuPosition(null);
    setContactProfileOpen(false);
    setChatMenuPosition(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSelectionMode(false);
    setSelectedMessageKeys({});
    setSearchCursor(0);
  }, [selectedChatId]);

  useEffect(() => {
    const state = selectedChat?.state;
    const needsClock = Boolean(state?.typingUntilAt) || state?.presenceStatus === "typing";
    if (!needsClock) return;

    setPresenceNow(Date.now());
    const timer = window.setInterval(() => setPresenceNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedChat?.state]);

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
      const raw = window.localStorage.getItem("wa:pinnedByChatId");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const obj = parsed as Record<string, unknown>;
      const next: Record<string, true> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === true) next[k] = true;
      }
      setPinnedByChatId(next);
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
    try {
      window.localStorage.setItem("wa:pinnedByChatId", JSON.stringify(pinnedByChatId));
    } catch {
      // ignore
    }
  }, [pinnedByChatId]);

  useEffect(() => {
    if (!sidebarMenuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSidebarMenu();
    }
    function onPointerDown(e: PointerEvent) {
      const el = sidebarMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) closeSidebarMenu();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [sidebarMenuOpen]);

  function openSidebarMenu() {
    const rect = sidebarMenuButtonRef.current?.getBoundingClientRect();
    const width = 288;
    const margin = 8;
    const estimatedHeight = 220;
    const left = rect ? Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin) : margin;
    const top = rect ? Math.min(rect.bottom + 8, window.innerHeight - estimatedHeight - margin) : 72;
    setSidebarMenuPosition({ left, top });
    setSidebarMenuOpen(true);
  }

  function closeSidebarMenu() {
    setSidebarMenuOpen(false);
    setSidebarMenuPosition(null);
  }

  useEffect(() => {
    if (!chatMenuChat || !chatMenuPosition) return;

    const menuSelector = `div[role="menu"][aria-label="Opções do chat ${CSS.escape(chatMenuChat.name)}"]`;
    const pinButtonIndex = 1;

    function getPinButton() {
      const menu = document.querySelector(menuSelector);
      const items = menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')) : [];
      return items[pinButtonIndex] ?? null;
    }

    const pinButton = getPinButton();
    const label = pinButton?.querySelector<HTMLSpanElement>("span:last-child");
    if (label) label.textContent = pinnedByChatId[chatMenuChat.chatId] ? "Desafixar conversa" : "Fixar conversa";

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('button[role="menuitem"]');
      if (!button || button !== getPinButton()) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const pinned = Boolean(pinnedByChatId[chatMenuChat!.chatId]);
      setPinnedByChatId((prev) => {
        const next = { ...prev };
        if (pinned) delete next[chatMenuChat!.chatId];
        else next[chatMenuChat!.chatId] = true;
        return next;
      });
      closeChatActionMenu();
      setChatMenuChatId(null);
      setToast(pinned ? "Conversa desafixada." : "Conversa fixada.");
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [chatMenuChat, chatMenuPosition, pinnedByChatId]);

  useEffect(() => {
    if (!contactProfileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContactProfileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contactProfileOpen]);

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

  const pinnedVisibleChats = useMemo(() => {
    return [...visibleChats].sort((a, b) => {
      const aPinned = pinnedByChatId[a.chatId] ? 1 : 0;
      const bPinned = pinnedByChatId[b.chatId] ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return toMs(b.lastMsgTimestamp) - toMs(a.lastMsgTimestamp);
    });
  }, [pinnedByChatId, visibleChats]);

  const searchMatchKeys = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [] as string[];
    const keys: string[] = [];
    for (let idx = 0; idx < messages.length; idx += 1) {
      const m = messages[idx]!;
      const text = getDisplayMessageText(m);
      if (!text) continue;
      if (!includesIgnoreCase(text, q)) continue;
      const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
      keys.push(stableKey);
    }
    return keys;
  }, [messages, searchQuery, selectedChatId]);

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
        presenceStatus?: string | null;
        lastSeenAt?: string | null;
        typingUntilAt?: string | null;
        updatedAt?: string;
      }>;
    };
    const state = data.items[0];
    if (!state) return;
    setStatus(state.status);
    setAssignedAgentId(state.assignedAgentId);
    const normalizedTags = (state.tags ?? []).map(normalizeLabelName).filter(Boolean);
    setTags(Array.from(new Set(normalizedTags)).slice(0, 12));
    setChats((prev) =>
      prev.map((chat) =>
        chat.chatId === chatId
          ? {
              ...chat,
              state: {
                status: state.status,
                assignedAgentId: state.assignedAgentId,
                tags: Array.from(new Set(normalizedTags)).slice(0, 12),
                presenceStatus: state.presenceStatus ?? null,
                lastSeenAt: state.lastSeenAt ?? null,
                typingUntilAt: state.typingUntilAt ?? null,
                updatedAt: state.updatedAt ?? new Date().toISOString(),
              },
            }
          : chat,
      ),
    );
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
      const t = getDisplayMessageText(m);
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
    if (!text && pendingAttachments.length === 0) return;
    if (pendingAttachments.length > 0) {
      await sendPendingAttachments();
      return;
    }
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

  function handleAttachmentFiles(fileList: FileList | File[], opts?: { recorded?: boolean }) {
    const files = Array.from(fileList).filter(Boolean);
    if (files.length === 0) return;
    addPendingAttachments(files, opts);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function extractClipboardFiles(clipboardData: DataTransfer) {
    const files = Array.from(clipboardData.files ?? []).filter(Boolean);
    if (files.length > 0) return files;
    const fromItems = Array.from(clipboardData.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    return fromItems;
  }

  function handlePaste(event: ClipboardWithFiles) {
    if (!selectedChatId) return;
    const files = extractClipboardFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    addPendingAttachments(files);
  }

  function isFileDragEvent(event: { dataTransfer?: DataTransfer | null }) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes("Files");
  }

  function handleDragEnter(event: FileDragEvent) {
    if (!selectedChatId || !isFileDragEvent(event)) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: FileDragEvent) {
    if (!selectedChatId || !isFileDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: FileDragEvent) {
    if (!selectedChatId || !isFileDragEvent(event)) return;
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  }

  function handleDrop(event: FileDragEvent) {
    if (!selectedChatId || !isFileDragEvent(event)) return;
    event.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    handleAttachmentFiles(event.dataTransfer.files);
  }

  function attachmentPreviewLabel(attachment: PendingAttachment) {
    if (attachment.kind === "image") return "Imagem";
    if (attachment.kind === "video") return "Vídeo";
    if (attachment.kind === "audio") return "Áudio";
    return "Documento";
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

  function createPendingAttachment(file: File, recorded?: boolean): PendingAttachment {
    const kind = inferMediaType(file);
    const objectUrl = URL.createObjectURL(file);
    return {
      id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      file,
      objectUrl,
      kind,
      recorded: Boolean(recorded),
    };
  }

  function addPendingAttachments(files: File[], opts?: { recorded?: boolean }) {
    if (files.length === 0) return;
    setPendingAttachments((prev) => [...prev, ...files.map((file) => createPendingAttachment(file, opts?.recorded))]);
  }

  async function uploadMediaFile(file: File, opts?: { recorded?: boolean; caption?: string }) {
    if (!selectedChatId) return;
    const base64 = await fileToBase64(file);
    const kind = inferMediaType(file);
    const type = opts?.recorded ? "ptt" : kind;
    const caption = (opts?.caption ?? composer).trim();

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
  }

  async function sendMediaFile(file: File, opts?: { recorded?: boolean; caption?: string }) {
    if (!selectedChatId) return;
    setUploading(true);
    try {
      await uploadMediaFile(file, opts);
      await refreshAll("sent-media");
      if (opts?.caption === undefined) setComposer("");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar arquivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendPendingAttachments() {
    if (!selectedChatId || pendingAttachments.length === 0) return;
    setUploading(true);
    const attachments = pendingAttachments;
    const caption = composer.trim();
    try {
      for (let idx = 0; idx < attachments.length; idx += 1) {
        const attachment = attachments[idx]!;
        await uploadMediaFile(attachment.file, {
          recorded: attachment.recorded,
          caption: idx === 0 ? caption : "",
        });
      }
      await refreshAll("sent-media");
      for (const attachment of attachments) URL.revokeObjectURL(attachment.objectUrl);
      setComposer("");
      setPendingAttachments([]);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao enviar arquivos");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function clearPendingAttachments() {
    setPendingAttachments((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.objectUrl);
      return [];
    });
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
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      for (const attachment of pendingAttachmentsRef.current) URL.revokeObjectURL(attachment.objectUrl);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
    };
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

  // Mídias: pré-carrega automaticamente para evitar bolhas vazias quando a API ainda não trouxe fileURL.
  useEffect(() => {
    if (!selectedChatId) return;
    if (messages.length === 0) return;

    const mediaToPrefetch: string[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]!;
      const id = m.messageid ?? m.id ?? "";
      if (!id) continue;
      const cached = downloadByMessageId[id];
      if (cached?.fileURL || cached?.unavailable || m.fileURL) continue;
      if (!isDownloadableMediaLike(m, cached?.mimetype, m.fileURL ?? null)) continue;
      // Só faz prefetch das mais recentes para evitar flood.
      mediaToPrefetch.push(id);
      if (mediaToPrefetch.length >= 6) break;
    }

    if (mediaToPrefetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const id of mediaToPrefetch) {
        if (cancelled) return;
        try {
          await ensureDownload(id);
        } catch {
          // Silencioso: se falhar, a mensagem continua com a opção manual de carregar mídia.
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
    <div className="min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen min-w-0 overflow-hidden">
        <aside className="w-[clamp(320px,30vw,400px)] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,var(--background))]">
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
                  ref={sidebarMenuButtonRef}
                  onClick={() => {
                    if (sidebarMenuOpen) closeSidebarMenu();
                    else openSidebarMenu();
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_94%,var(--background))] text-lg hover:bg-[color-mix(in_srgb,var(--card)_98%,var(--background))]"
                  aria-label="Mais opções"
                  title="Mais opções"
                >
                  ⋯
                </button>
                {sidebarMenuOpen ? (
                  <div
                    className="fixed z-40 w-72 overflow-hidden rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] shadow-2xl max-h-[calc(100vh-16px)] overflow-y-auto"
                    style={{
                      left: sidebarMenuPosition?.left ?? 8,
                      top: sidebarMenuPosition?.top ?? 72,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        closeSidebarMenu();
                        setToast("Em breve: novo grupo.");
                      }}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-[var(--surface-2)]"
                    >
                      Novo grupo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeSidebarMenu();
                        setFavoritesOnly((v) => !v);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      {favoritesOnly ? "Todas as conversas" : "Mensagens favoritas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeSidebarMenu();
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
                        setManualUnreadByChatId({});
                        closeSidebarMenu();
                        setToast("Conversas marcadas como lidas.");
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                    >
                      Marcar todas como lidas
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_90%,var(--background))] p-1">
                <button
                  type="button"
                  onClick={() => setAssignedFilter((prev) => (prev === "vanderlei" ? "all" : "vanderlei"))}
                  className={[
                    "rounded-xl px-3 py-2 text-xs transition",
                    assignedFilter === "vanderlei"
                      ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                      : "hover:bg-[var(--surface-2)]",
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
                      : "hover:bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  Gustavo
                </button>
              </div>
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl border px-3 py-2 text-xs border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--surface-1)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
            </div>
          </div>

          <div className="border-b border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_88%,var(--background))] px-3 py-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Conversas</div>
                <div className="mt-0.5 text-sm font-medium text-[var(--foreground)]">WhatsApp</div>
              </div>
              <div className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-1 text-[10px] text-[var(--muted)]">
                {pinnedVisibleChats.length}
              </div>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_94%,var(--background))] px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
            />
          </div>
  
            <div className="overflow-y-auto h-[calc(100vh-64px-88px)]">
              {pinnedVisibleChats.map((chat) => {
                const active = chat.chatId === selectedChatId;
                const chatTags = chat.state?.tags ?? [];
                const pinned = Boolean(pinnedByChatId[chat.chatId]);
                const lastMs = toMs(chat.lastMsgTimestamp);
                const readAt = readAtByChatId[chat.chatId] ?? 0;
                const effectiveUnread = manualUnreadByChatId[chat.chatId]
                  ? Math.max(chat.unreadCount, 1)
                  : chat.unreadCount > 0 && lastMs > readAt
                    ? chat.unreadCount
                    : 0;
                return (
                  <div
                    key={chat.chatId}
                    className={[
                      "w-full px-4 py-3 border-b border-[var(--border)] transition",
                      active
                        ? "bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]"
                        : "hover:bg-[color-mix(in_srgb,var(--card)_88%,var(--background))]",
                    ].join(" ")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openChatActionMenu(chat.chatId, e.clientX, e.clientY);
                    }}
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
                          setManualUnreadByChatId((prev) => {
                            if (!prev[chat.chatId]) return prev;
                            const next = { ...prev };
                            delete next[chat.chatId];
                            return next;
                          });
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
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1)]">
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openChatActionMenu(chat.chatId, e.clientX, e.clientY);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-lg hover:bg-[var(--surface-2)]"
                          aria-label={`Mais opções do chat: ${chat.name}`}
                          title="Mais opções"
                        >
                          ⋯
                        </button>
                      </div>
                        <div className="flex items-center gap-2">
                          {pinned ? (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px]" title="Conversa fixada">
                              Fixada
                            </span>
                          ) : null}
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

        <main
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
            {dragActive ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--background)_70%,black)]/80 backdrop-blur-sm pointer-events-none">
                <div className="rounded-[32px] border-2 border-dashed border-[color-mix(in_srgb,var(--primary)_60%,white)] bg-[color-mix(in_srgb,var(--card)_70%,black)] px-8 py-10 text-center shadow-2xl">
                  <div className="text-lg font-semibold">Solte os arquivos para anexar</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">Você pode soltar vários arquivos de uma vez.</div>
                </div>
              </div>
            ) : null}
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
                {contactProfile?.presenceText ? (
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)] truncate">
                    <span className={["h-2 w-2 rounded-full shrink-0", presenceToneClass(contactProfile.presenceTone)].join(" ")} />
                    <span className="truncate">{contactProfile.presenceText}</span>
                  </div>
                ) : null}
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
                ) : !contactProfile?.presenceText ? (
                  <div className="text-xs text-[var(--muted)] truncate">{selectedChatId ?? ""}</div>
                ) : null}
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
                    <SystemNotifications />
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
                            setContactProfileOpen(true);
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

            {contactProfileOpen && contactProfile ? (
              <div className="absolute inset-0 z-30">
                <button
                  type="button"
                  aria-label="Fechar perfil do contato"
                  onClick={() => setContactProfileOpen(false)}
                  className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                />
                <aside className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto border-l border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,black)] shadow-2xl">
                  <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,black)]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Dados do contato</div>
                      <div className="text-xs text-[var(--muted)]">Perfil da conversa</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setContactProfileOpen(false)}
                      className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 flex items-center justify-center text-lg"
                      aria-label="Fechar"
                    >
                      ×
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="overflow-hidden rounded-[32px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] shadow-lg">
                      <div className="relative px-5 pb-5 pt-8">
                        <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_26%,transparent),color-mix(in_srgb,var(--primary)_20%,transparent),transparent)]" />
                        <div className="relative flex flex-col items-center text-center">
                          <div className="h-28 w-28 rounded-[36px] overflow-hidden ring-4 ring-[color-mix(in_srgb,var(--background)_85%,transparent)] bg-white/8 flex items-center justify-center shadow-xl">
                            {contactProfile.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={contactProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-3xl font-semibold text-[var(--muted)]">{contactProfile.avatarLabel}</span>
                            )}
                          </div>
                          <div className="mt-4 space-y-1">
                            <div className="text-xl font-semibold leading-tight">{contactProfile.name}</div>
                            {contactProfile.presenceText ? (
                              <div className="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
                                <span
                                  className={["h-2.5 w-2.5 rounded-full shrink-0", presenceToneClass(contactProfile.presenceTone)].join(" ")}
                                />
                                <span>{contactProfile.presenceText}</span>
                              </div>
                            ) : null}
                            <div className="text-sm text-[var(--muted)]">{contactProfile.subtitle}</div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            {contactProfile.isGroup ? (
                              <span className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1">
                                Grupo
                              </span>
                            ) : (
                              <span className="text-[10px] rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_35%,transparent)] px-3 py-1">
                                Contato individual
                              </span>
                            )}
                            <span className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1">
                              {contactProfile.unreadCount > 0 ? `${contactProfile.unreadCount} não lida(s)` : "Em dia"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[var(--border)] bg-[var(--background)]/40">
                        <div className="grid grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!contactProfile.phone) return;
                              void navigator.clipboard.writeText(contactProfile.phone).catch(() => null);
                              setToast("Número copiado.");
                            }}
                            className="px-4 py-3 text-sm text-left hover:bg-white/5"
                          >
                            <div className="text-xs text-[var(--muted)]">Número</div>
                            <div className="mt-1 truncate font-medium">{contactProfile.phone ?? "Indisponível"}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setContactProfileOpen(false);
                              void toggleLabelForSelected("Favoritos");
                            }}
                            className="px-4 py-3 text-sm text-left hover:bg-white/5 border-l border-[var(--border)]"
                          >
                            <div className="text-xs text-[var(--muted)]">Favoritos</div>
                            <div className="mt-1 font-medium">
                              {tags.includes("Favoritos") ? "Remover" : "Adicionar"}
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="text-sm font-semibold">Sobre</div>
                        <div className="mt-2 text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap break-words">
                          {contactProfile.lastMessageText}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="text-sm font-semibold">Informações da conversa</div>
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[var(--muted)]">Status</span>
                            <span className="text-right font-medium">
                              {contactProfile.status === "resolvido" ? "Resolvido" : "Pendente"}
                            </span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[var(--muted)]">Responsável</span>
                            <span className="text-right font-medium">
                              {contactProfile.assignedAgentId === "vanderlei"
                                ? "Vanderlei"
                                : contactProfile.assignedAgentId === "gustavo"
                                  ? "Gustavo"
                                  : "Sem responsável"}
                            </span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[var(--muted)]">Última atualização</span>
                            <span className="text-right font-medium">{contactProfile.lastActivityAt ?? "Indisponível"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[var(--muted)]">ID do chat</span>
                            <span className="text-right font-medium break-all">{contactProfile.chatId}</span>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="text-sm font-semibold">Etiquetas</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {contactProfile.tags.length > 0 ? (
                            contactProfile.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-3 py-1"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-[var(--muted)]">Sem etiquetas.</span>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}

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
                const text = getDisplayMessageText(m);
                const senderName = getDisplaySenderName(m, me?.agentName ?? null);
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
                const receiptStage = normalizeReceiptStage(m);
                const previousReceiptStage =
                  idx > 0 ? normalizeReceiptStage(messages[idx - 1]!) : null;
                const receiptAnimate = receiptStage !== previousReceiptStage;
                const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
                const bubbleToneClass = mine
                  ? "bg-[color-mix(in_srgb,var(--primary)_18%,var(--surface-1))] ring-[color-mix(in_srgb,var(--primary)_32%,white)] text-[var(--foreground)]"
                  : "bg-[color-mix(in_srgb,var(--surface-1)_98%,white)] ring-[color-mix(in_srgb,var(--foreground)_12%,var(--background))] text-[var(--foreground)] shadow-[0_2px_10px_rgba(15,23,42,0.06)]";
                const bubbleContentPaddingClass = showAudioPlayer ? "pr-4 pb-10" : "pr-16 pb-7";
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
                        "relative rounded-[20px] px-4 py-3 ring-1",
                        bubbleToneClass,
                        bubbleContentPaddingClass,
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold">
                      {senderName}
                      {":"}
                    </div>

                      {contact ? (
                        <div className="mt-2">
                        {contact.caption ? (
                          <div className="text-sm whitespace-pre-wrap break-words">{contact.caption}</div>
                        ) : null}

                        <div className="mt-2 overflow-hidden rounded-[16px] bg-[color-mix(in_srgb,var(--surface-2)_92%,var(--background))] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))]">
                          <div className="p-4 flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--surface-1)] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] text-sm">
                              {initialsFromName(contact.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[var(--foreground)]">
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
                                className="px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--surface-1)_86%,transparent)]"
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
                                className="border-l border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--surface-1)_86%,transparent)]"
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
                              className="max-w-full rounded-[16px] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))]"
                              style={{ maxHeight: 420 }}
                              loading="lazy"
                            />
                          </a>
                        ) : mediaUrl && showVideo ? (
                          <div className="rounded-[16px] bg-[color-mix(in_srgb,var(--surface-2)_92%,var(--background))] p-3 ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))]">
                            <video controls preload="metadata" src={mediaUrl} className="w-[520px] max-w-full rounded-[16px]" />
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
                          <div className="w-[360px] max-w-full overflow-hidden rounded-[16px] bg-[color-mix(in_srgb,var(--surface-2)_92%,var(--background))] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))]">
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--surface-1)_88%,var(--background))] px-3 py-3 hover:bg-[color-mix(in_srgb,var(--surface-1)_96%,var(--background))]"
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
                            <div className="flex items-center justify-end gap-2 border-t border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] px-3 py-2">
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
                          <div className="w-[360px] max-w-full overflow-hidden rounded-[16px] bg-[color-mix(in_srgb,var(--surface-2)_92%,var(--background))] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,var(--background))]">
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--surface-1)_88%,var(--background))] px-3 py-3 hover:bg-[color-mix(in_srgb,var(--surface-1)_96%,var(--background))]"
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
                            <div className="flex items-center justify-end gap-2 border-t border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] px-3 py-2">
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

                      {!showMedia && id && !contact && isDownloadableMediaLike(m, mimetype, mediaUrl) && !cached?.unavailable ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8"
                            onClick={() => {
                              void (async () => {
                                try {
                                  await ensureDownload(id);
                                } catch (err) {
                                  setToast(err instanceof Error ? err.message : "Falha ao carregar mídia");
                                }
                              })();
                            }}
                          >
                            Carregar mídia
                          </button>
                        </div>
                      ) : !showMedia && cached?.unavailable ? (
                        <div className="mt-2 text-xs text-[var(--muted)]">Mídia indisponível.</div>
                      ) : null}

                      <div className="absolute bottom-2.5 right-3 flex items-center gap-1 text-[10px] leading-none text-[var(--muted)]">
                        <span>{formatTime(m.messageTimestamp)}</span>
                        {mine && receiptStage ? (
                          <span
                            className={[
                              "inline-flex items-center",
                              receiptStage === "read" ? "text-[#53bdeb]" : "",
                            ].join(" ")}
                          >
                            <ReceiptTicks key={`${stableKey}:${receiptStage}`} stage={receiptStage} animate={receiptAnimate} />
                          </span>
                        ) : null}
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
                {pendingAttachments.length > 0 ? (
                  <div className="mb-2 rounded-3xl bg-white/3 ring-1 ring-white/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {pendingAttachments.length > 1 ? `${pendingAttachments.length} anexos prontos` : "Anexo pronto"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--muted)] truncate">
                          {pendingAttachments.length > 1
                            ? "Revise os arquivos antes de enviar."
                            : pendingAttachments[0]?.file.name ?? ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clearPendingAttachments}
                        className="shrink-0 rounded-2xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                      >
                        Limpar
                      </button>
                    </div>

                    <div className="mt-3 flex gap-3 overflow-x-auto pb-1 pr-1 snap-x snap-mandatory">
                      {pendingAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="min-w-[180px] max-w-[180px] shrink-0 snap-start overflow-hidden rounded-3xl bg-black/10 ring-1 ring-white/10"
                        >
                          <div className="h-28 bg-[color-mix(in_srgb,var(--background)_55%,black)] flex items-center justify-center overflow-hidden">
                            {attachment.kind === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={attachment.objectUrl} alt={attachment.file.name} className="h-full w-full object-cover" />
                            ) : attachment.kind === "video" ? (
                              <video src={attachment.objectUrl} className="h-full w-full object-cover" muted playsInline />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center px-3">
                                <div className="rounded-2xl bg-white/8 ring-1 ring-white/10 px-3 py-2 text-[10px] font-semibold">
                                  {attachmentPreviewLabel(attachment)}
                                </div>
                                <div className="mt-2 text-[10px] text-[var(--muted)]">
                                  {attachment.recorded ? "Gravação pronta" : "Pronto para envio"}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{attachment.file.name}</div>
                              <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                                {attachmentPreviewLabel(attachment)}
                                {attachment.recorded ? " • áudio gravado" : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePendingAttachment(attachment.id)}
                              className="w-full rounded-2xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={!selectedChatId || uploading}
                        onClick={() => void sendPendingAttachments()}
                        className="rounded-2xl px-4 py-2 text-xs bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_28%,transparent)] disabled:opacity-60"
                      >
                        {uploading ? "Enviando..." : pendingAttachments.length > 1 ? "Enviar anexos" : "Enviar anexo"}
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
                  onPaste={handlePaste}
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
                multiple
                className="hidden"
                onChange={(e) => {
                  if (!e.target.files?.length) return;
                  handleAttachmentFiles(e.target.files);
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
                disabled={!selectedChatId || sending || uploading || (composer.trim().length === 0 && pendingAttachments.length === 0)}
                onClick={() => void sendMessage()}
                className="h-12 rounded-2xl bg-[var(--primary)] px-5 text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
              >
                {uploading ? "Enviando..." : sending ? "Enviando..." : pendingAttachments.length > 0 ? "Enviar anexos" : "Enviar"}
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

      {chatMenuChat && chatMenuPosition ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar opções do chat"
            onClick={() => {
              setChatMenuChatId(null);
              closeChatActionMenu();
            }}
          />
          <div
            role="menu"
            aria-label={`Opções do chat ${chatMenuChat.name}`}
            className="absolute w-80 overflow-hidden rounded-3xl bg-[var(--card)] ring-1 ring-[var(--border)] shadow-2xl"
            style={{ left: chatMenuPosition.left, top: chatMenuPosition.top }}
          >
            {chatMenuAssignOpen ? (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                  <div className="text-sm font-semibold">Atribuir conversa</div>
                  <button
                    type="button"
                    onClick={() => setChatMenuAssignOpen(false)}
                    className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs hover:bg-white/8"
                  >
                    Voltar
                  </button>
                </div>
                {CHAT_ASSIGN_OPTIONS.map((opt) => {
                  const selected = (chatMenuChat.state?.assignedAgentId ?? null) === opt.id;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void saveState(chatMenuChat.chatId, { assignedAgentId: opt.id });
                        closeChatActionMenu();
                        setChatMenuChatId(null);
                        setToast(`Conversa atribuída para ${opt.label}.`);
                      }}
                      className={[
                        "flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm hover:bg-white/5",
                        selected ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "",
                      ].join(" ")}
                    >
                      <span>{opt.label}</span>
                      {selected ? <span className="text-[var(--primary)]">✓</span> : null}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast("Em breve: arquivar conversa.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">▣</span>
                  <span>Arquivar conversa</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast("Em breve: desafixar conversa.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">⌧</span>
                  <span>Desafixar conversa</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setReadAtByChatId((prev) => ({ ...prev, [chatMenuChat.chatId]: 0 }));
                    setManualUnreadByChatId((prev) => ({ ...prev, [chatMenuChat.chatId]: true }));
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast("Conversa marcada como não lida.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">☰</span>
                  <span>Marcar como não lida</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const alreadyFavorite = (chatMenuChat.state?.tags ?? []).includes("Favoritos");
                    void toggleLabelForChat(chatMenuChat.chatId, "Favoritos");
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast(alreadyFavorite ? "Removido dos Favoritos." : "Adicionado aos Favoritos.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">♡</span>
                  <span>{(chatMenuChat.state?.tags ?? []).includes("Favoritos") ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeChatActionMenu();
                    setChatMenuTagInput("");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">🏷</span>
                  <span>Etiquetas</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setChatMenuAssignOpen(true)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">👤</span>
                  <span>
                    Atribuir
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {chatMenuChat.state?.assignedAgentId === "vanderlei"
                        ? "Vanderlei"
                        : chatMenuChat.state?.assignedAgentId === "gustavo"
                          ? "Gustavo"
                          : "—"}
                    </span>
                  </span>
                </button>
                <div className="mx-5 border-t border-[var(--border)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (selectedChatIdRef.current === chatMenuChat.chatId) {
                      setMessages([]);
                    }
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast("Conversa limpa nesta visualização.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">⊖</span>
                  <span>Limpar conversa</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeChatActionMenu();
                    setChatMenuChatId(null);
                    setToast("Em breve: apagar conversa.");
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-sm hover:bg-white/5"
                >
                  <span className="w-6 text-center text-lg" aria-hidden="true">🗑</span>
                  <span>Apagar conversa</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {chatMenuChat && !chatMenuPosition ? (
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

            {chatMenuAssignOpen ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Atribuir conversa</div>
                  <button
                    type="button"
                    onClick={() => setChatMenuAssignOpen(false)}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs hover:bg-white/8"
                  >
                    Voltar
                  </button>
                </div>
                {CHAT_ASSIGN_OPTIONS.map((opt) => {
                  const selected = (chatMenuChat.state?.assignedAgentId ?? null) === opt.id;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        void saveState(chatMenuChat.chatId, { assignedAgentId: opt.id });
                        setChatMenuAssignOpen(false);
                        setChatMenuChatId(null);
                        setToast(`Conversa atribuída para ${opt.label}.`);
                      }}
                      className={[
                        "flex w-full items-center justify-between rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm hover:bg-white/8",
                        selected ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "",
                      ].join(" ")}
                    >
                      <span>{opt.label}</span>
                      {selected ? <span className="text-[var(--primary)]">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChatMenuAssignOpen(true)}
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
            )}

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
