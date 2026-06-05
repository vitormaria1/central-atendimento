import { getEnv } from "./env";

export type UazapiChat = {
  id?: string;
  name?: string;
  image?: string;
  imagePreview?: string;
  wa_contactName?: string;
  wa_chatid?: string;
  wa_fastid?: string;
  wa_name?: string;
  wa_isGroup?: boolean;
  wa_unreadCount?: number;
  wa_lastMsgTimestamp?: number;
  wa_lastMessageTextVote?: string;
  wa_lastMessageType?: string;
};

export type UazapiMessage = {
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

type PathKind = "chatFind" | "messageFind" | "sendText" | "labelsList" | "chatLabelsGet";

const globalForUazapi = globalThis as unknown as {
  __ca_uazapi_paths?: Partial<Record<PathKind, string>>;
};

function getCachedPath(kind: PathKind) {
  if (!globalForUazapi.__ca_uazapi_paths) globalForUazapi.__ca_uazapi_paths = {};
  return globalForUazapi.__ca_uazapi_paths[kind] ?? null;
}

function setCachedPath(kind: PathKind, path: string) {
  if (!globalForUazapi.__ca_uazapi_paths) globalForUazapi.__ca_uazapi_paths = {};
  globalForUazapi.__ca_uazapi_paths[kind] = path;
}

async function uazapiFetch<T>(path: string, init: RequestInit = {}) {
  const { UAZAPI_BASE_URL, UAZAPI_TOKEN } = getEnv();
  const url = `${UAZAPI_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      token: UAZAPI_TOKEN,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`UAZAPI ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

async function uazapiTryFetch(path: string, init: RequestInit = {}) {
  const { UAZAPI_BASE_URL, UAZAPI_TOKEN } = getEnv();
  const url = `${UAZAPI_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      token: UAZAPI_TOKEN,
      "content-type": "application/json",
    },
    cache: "no-store",
  });
  if (res.ok) return { ok: true as const, res };
  const text = await res.text().catch(() => "");
  return { ok: false as const, status: res.status, text };
}

async function resolvePath(kind: PathKind) {
  const env = getEnv();
  const cached = getCachedPath(kind);
  if (cached) return cached;

  const override =
    kind === "chatFind"
      ? env.UAZAPI_CHAT_FIND_PATH
      : kind === "messageFind"
        ? env.UAZAPI_MESSAGE_FIND_PATH
        : kind === "sendText"
          ? env.UAZAPI_SEND_TEXT_PATH
          : undefined;
  if (override) {
    setCachedPath(kind, override);
    return override;
  }

  const candidates =
    kind === "chatFind"
      ? ["/chat/find"]
      : kind === "messageFind"
        ? ["/message/find"]
        : kind === "sendText"
          ? ["/send/text"]
          : kind === "labelsList"
            ? ["/labels", "/labels/list", "/label", "/label/list"]
            : ["/labels/chats", "/labels/chats/get", "/labels/chat", "/label/chat", "/labels/chat/get"];

  for (const path of candidates) {
    const probeBody =
      kind === "chatFind"
        ? { limit: 1, offset: 0 }
        : kind === "messageFind"
          ? { chatid: "probe", limit: 1 }
          : kind === "sendText"
            ? { number: "probe", text: "probe", linkPreview: false, replyid: "", mentions: "", readchat: false, delay: 0 }
            : kind === "labelsList"
              ? {}
              : { chatid: "probe" };

    // Some label endpoints are GET, others are POST.
    const attemptGet = kind === "labelsList" ? await uazapiTryFetch(path, { method: "GET" }) : null;
    const attempt =
      attemptGet?.ok
        ? attemptGet
        : await uazapiTryFetch(path, { method: "POST", body: JSON.stringify(probeBody) });
    // Consider 400/422 as "endpoint exists but probe body is invalid", which is acceptable for discovery.
    if (attempt.ok || attempt.status === 400 || attempt.status === 401 || attempt.status === 403 || attempt.status === 422) {
      setCachedPath(kind, path);
      return path;
    }
  }

  // fallback to the most likely
  const fallback = candidates[0]!;
  setCachedPath(kind, fallback);
  return fallback;
}

export async function downloadMessage(params: { id: string; return_link?: boolean; return_base64?: boolean }) {
  const data = await uazapiFetch<{ fileURL?: string; mimetype?: string; base64Data?: string; transcription?: string }>(
    "/message/download",
    {
      method: "POST",
      body: JSON.stringify({
        id: params.id,
        return_link: params.return_link ?? true,
        return_base64: params.return_base64 ?? false,
      }),
    },
  );
  return data;
}

export async function listChats(params: { search?: string; limit?: number; offset?: number }) {
  const chatFindPath = await resolvePath("chatFind");
  const body: Record<string, unknown> = {
    operator: "AND",
    sort: "-wa_lastMsgTimestamp",
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };
  if (params.search?.trim()) {
    // O spec diz: sem operador = LIKE; e `~` para "contém".
    // Usamos OR entre `name` e `wa_name` para pegar grupos/contatos.
    body.operator = "OR";
    body.name = `~${params.search.trim()}`;
    body.wa_name = `~${params.search.trim()}`;
  }

  const data = await uazapiFetch<{
    chats: UazapiChat[];
    pagination?: { totalRecords?: number; limit?: number; offset?: number };
  }>(chatFindPath, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.chats ?? [];
}

export async function findMessages(params: { chatid: string; limit?: number; offset?: number }) {
  const messageFindPath = await resolvePath("messageFind");
  const data = await uazapiFetch<{
    returnedMessages?: number;
    messages: UazapiMessage[];
    limit?: number;
    offset?: number;
    nextOffset?: number;
    hasMore?: boolean;
  }>(messageFindPath, {
    method: "POST",
    body: JSON.stringify({ chatid: params.chatid, limit: params.limit ?? 80, offset: params.offset ?? 0 }),
  });
  return data.messages ?? [];
}

export async function sendText(params: {
  number: string;
  text: string;
  linkPreview?: boolean;
  readchat?: boolean;
  delay?: number;
}) {
  const sendTextPath = await resolvePath("sendText");
  const data = await uazapiFetch<{ ok?: boolean; id?: string; messageid?: string; [k: string]: unknown }>(
    sendTextPath,
    {
      method: "POST",
      body: JSON.stringify({
        number: params.number,
        text: params.text,
        linkPreview: params.linkPreview ?? false,
        replyid: "",
        mentions: "",
        readchat: params.readchat ?? true,
        delay: params.delay ?? 0,
      }),
    },
  );
  return data;
}

export async function sendMedia(params: {
  number: string;
  type: "image" | "video" | "videoplay" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";
  file: string;
  text?: string;
  docName?: string;
  mimetype?: string;
  readchat?: boolean;
  delay?: number;
}) {
  const data = await uazapiFetch<{ ok?: boolean; id?: string; messageid?: string; [k: string]: unknown }>("/send/media", {
    method: "POST",
    body: JSON.stringify({
      number: params.number,
      type: params.type,
      file: params.file,
      text: params.text ?? "",
      docName: params.docName ?? "",
      mimetype: params.mimetype ?? "",
      readchat: params.readchat ?? false,
      delay: params.delay ?? 0,
    }),
  });
  return data;
}

export type UazapiLabel = { id?: string; name?: string; color?: string };

export async function listLabels() {
  const labelsListPath = await resolvePath("labelsList");
  // Try GET first (many APIs expose list via GET), fallback to POST.
  const attempt = await uazapiTryFetch(labelsListPath, { method: "GET" });
  const res = attempt.ok
    ? attempt.res
    : await fetch(`${getEnv().UAZAPI_BASE_URL}${labelsListPath}`, {
        method: "POST",
        headers: { token: getEnv().UAZAPI_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`UAZAPI ${res.status} ${res.statusText}: ${text}`);
  }

  const json = (await res.json().catch(() => null)) as unknown;
  const obj = (json && typeof json === "object" ? (json as Record<string, unknown>) : null) ?? null;
  const itemsUnknown =
    (Array.isArray(json) ? json : null) ??
    (Array.isArray(obj?.labels) ? (obj?.labels as unknown[]) : null) ??
    (Array.isArray(obj?.items) ? (obj?.items as unknown[]) : null) ??
    (obj?.data && typeof obj.data === "object" && Array.isArray((obj.data as Record<string, unknown>).labels)
      ? (((obj.data as Record<string, unknown>).labels as unknown[]) ?? [])
      : []);

  const items = (itemsUnknown ?? [])
    .map((x): UazapiLabel | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      return {
        id: typeof r.id === "string" ? r.id : undefined,
        name: typeof r.name === "string" ? r.name : undefined,
        color: typeof r.color === "string" ? r.color : undefined,
      };
    })
    .filter((x): x is UazapiLabel => x !== null);

  return (items ?? []).map((x) => ({ id: x.id, name: x.name, color: x.color })).filter((x) => x.id || x.name);
}

export async function getChatLabels(params: { chatid: string }) {
  const chatLabelsGetPath = await resolvePath("chatLabelsGet");
  const res = await uazapiTryFetch(chatLabelsGetPath, {
    method: "POST",
    body: JSON.stringify({ chatid: params.chatid }),
  });
  const okRes = res.ok
    ? res.res
    : await fetch(`${getEnv().UAZAPI_BASE_URL}${chatLabelsGetPath}`, {
        method: "GET",
        headers: { token: getEnv().UAZAPI_TOKEN, "content-type": "application/json" },
        cache: "no-store",
      });

  if (!okRes.ok) {
    const text = await okRes.text().catch(() => "");
    throw new Error(`UAZAPI ${okRes.status} ${okRes.statusText}: ${text}`);
  }

  const json = (await okRes.json().catch(() => null)) as unknown;
  const obj = (json && typeof json === "object" ? (json as Record<string, unknown>) : null) ?? null;
  const dataObj = obj?.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : null;
  const itemsUnknown: unknown =
    obj?.labels ?? obj?.items ?? dataObj?.labels ?? obj?.data ?? (Array.isArray(json) ? json : []);

  const normalized: UazapiLabel[] = [];
  const arr = Array.isArray(itemsUnknown) ? itemsUnknown : [];
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") normalized.push({ id: it, name: undefined });
    else if (typeof it === "object") {
      const r = it as Record<string, unknown>;
      normalized.push({
        id: typeof r.id === "string" ? r.id : undefined,
        name: typeof r.name === "string" ? r.name : undefined,
        color: typeof r.color === "string" ? r.color : undefined,
      });
    }
  }
  return normalized.filter((x) => x.id || x.name);
}
