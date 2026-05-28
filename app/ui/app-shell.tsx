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
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(ms);
  return date.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dateKeyFromTs(ts?: number) {
  if (!ts) return "";
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
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
  const [toast, setToast] = useState<string | null>(null);
  const [downloadByMessageId, setDownloadByMessageId] = useState<Record<string, { fileURL: string; mimetype?: string }>>(
    {},
  );

  const lastRefreshAtRef = useRef<number>(0);
  const selectedChatIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldScrollToBottomRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  useEffect(() => {
    setTags(selectedChat?.state?.tags ?? []);
  }, [selectedChatId, selectedChat?.state?.tags]);

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
    setTags(state.tags ?? []);
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
	              <button
	                disabled={!selectedChatId}
	                onClick={() => setTagPickerOpen(true)}
	                className="rounded-xl px-3 py-2 text-xs bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:opacity-60"
	                title="Etiquetas"
	              >
	                Etiquetas
	              </button>
	            </div>
	          </header>

	          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
	            {messages.map((m, idx) => {
	              const mine = Boolean(m.fromMe);
	              const text = getMessageText(m);
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
	              const showMedia = !contact && (Boolean(mediaUrl) || (m.messageType && m.messageType !== "Conversation"));
              const showAudioPlayer = showMedia && isAudioLike(m, mimetype);
              const showImage = showMedia && !showAudioPlayer && isImageLike(m, mimetype, mediaUrl);
              const showVideo = showMedia && !showAudioPlayer && !showImage && isVideoLike(m, mimetype, mediaUrl);
              const showPdf = showMedia && !showAudioPlayer && !showImage && !showVideo && isPdfLike(mimetype, mediaUrl);
              const stableKey = m.messageid ?? m.id ?? `${m.chatid ?? selectedChatId ?? "chat"}:${m.messageTimestamp ?? "t"}:${idx}`;
	              return (
	                <div key={stableKey}>
	                  {showDaySeparator ? (
	                    <div className="flex justify-center py-2">
	                      <div className="text-xs rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-2">
	                        {dayLabelFromKey(dayKey)}
	                      </div>
	                    </div>
	                  ) : null}

	                  <div className={mine ? "flex justify-end" : "flex justify-start"}>
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
                          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3">
                            <iframe
                              title="PDF"
                              src={mediaUrl}
                              className="w-[520px] max-w-full h-[520px] rounded-2xl bg-black/20"
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
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
                          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3">
                            <div className="text-sm font-semibold">Documento</div>
                            <div className="mt-2 flex items-center gap-2">
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
                            <div className="mt-2 text-xs text-[var(--muted)]">Pré-visualização indisponível para este tipo.</div>
                          </div>
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

      {toast ? (
        <div className="fixed bottom-5 right-5 rounded-2xl bg-[var(--card)] ring-1 ring-[var(--border)] px-4 py-3 text-sm shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
