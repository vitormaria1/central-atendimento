import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { log } from "@/lib/logger";
import { sendMedia } from "@/lib/uazapi";
import {
  completeOutboundRequest,
  failOutboundRequest,
  reserveOutboundRequest,
} from "@/lib/whatsapp-ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  type: z.enum(["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"]),
  base64: z.string().min(10).optional(),
  fileName: z.string().min(1).max(200).optional(),
  mimetype: z.string().min(1).max(100).optional(),
  caption: z.string().max(4000).optional(),
  clientRequestId: z.string().min(8).max(80).optional(),
});

const MAX_MEDIA_BYTES = 20_000_000;

function agentLabel(agentName: "Vanderlei" | "Gustavo") {
  return `*${agentName}:*`;
}

function guessMimeFromFilename(fileName?: string | null) {
  const name = (fileName ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".zip")) return "application/zip";
  return undefined;
}

async function fileToBase64(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  return buf.toString("base64");
}

export const POST = withApi(async (req: Request, ctx: RouteContext<"/api/chats/[chatId]/send-media">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId } = await ctx.params;
  const id = decodeURIComponent(chatId);

  const contentType = req.headers.get("content-type") ?? "";
  let type!: z.infer<typeof bodySchema>["type"];
  let caption = "";
  let fileName: string | undefined;
  let mimetype: string | undefined;
  let base64: string | undefined;
  let uploadedFile: File | null = null;
  let clientRequestId: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const parsed = bodySchema.safeParse({
      type: form.get("type"),
      fileName: form.get("fileName"),
      mimetype: form.get("mimetype"),
      caption: form.get("caption"),
      clientRequestId: form.get("clientRequestId"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    type = parsed.data.type;
    caption = parsed.data.caption?.trim() ?? "";
    fileName = parsed.data.fileName?.trim() || undefined;
    mimetype = parsed.data.mimetype?.trim() || undefined;
    clientRequestId = parsed.data.clientRequestId?.trim() || undefined;

    const fileField = form.get("file");
    if (!(fileField instanceof File)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    uploadedFile = fileField;
    if (uploadedFile.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    base64 = await fileToBase64(uploadedFile);
    fileName = fileName ?? (uploadedFile.name || undefined);
    mimetype = mimetype ?? (uploadedFile.type || guessMimeFromFilename(fileName) || undefined);
  } else {
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    type = parsed.data.type;
    caption = parsed.data.caption?.trim() ?? "";
    fileName = parsed.data.fileName?.trim() || undefined;
    mimetype = parsed.data.mimetype?.trim() || undefined;
    clientRequestId = parsed.data.clientRequestId?.trim() || undefined;
    base64 = parsed.data.base64?.trim();

    if (!base64) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (base64.length > 28_000_000) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
  }

  const text = caption ? `${agentLabel(session.agentName)}\n${caption}` : agentLabel(session.agentName);

  const mime = (mimetype?.trim() || guessMimeFromFilename(fileName) || "").trim();
  const payloadBase64 = base64.trim();
  // A API aceita "base64 puro" e também "data URI". Para maximizar compatibilidade, enviamos como data URI
  // quando tivermos o mimeType.
  const filePayload = mime ? `data:${mime};base64,${payloadBase64}` : payloadBase64;

  const sizeBytes = uploadedFile?.size ?? Math.floor((payloadBase64.length * 3) / 4);
  clientRequestId = clientRequestId || crypto.randomUUID();
  const reserved = await reserveOutboundRequest({
    clientRequestId,
    kind: "media",
    chatId: id,
    requestMeta: {
      type,
      fileName: fileName ?? null,
      mimetype: mime || null,
      sizeBytes,
      transport: uploadedFile ? "multipart" : "json",
      captionLength: caption.length,
    },
    createdByAgentId: session.agentId,
  });
  if (reserved?.inserted === false && reserved.status === "completed") {
    const responseMeta = reserved.responseMeta ?? {};
    const messageId = typeof reserved.resultMessageId === "string" ? reserved.resultMessageId : null;
    return NextResponse.json({ ok: true, messageId, ...responseMeta, idempotent: true, clientRequestId });
  }
  if (reserved?.inserted === false && reserved.status === "pending") {
    return NextResponse.json({ error: "Request already in progress", clientRequestId }, { status: 409 });
  }

  log("info", "whatsapp.media.send", {
    chatId: id,
    type,
    fileName: fileName ?? null,
    mimetype: mime || null,
    sizeBytes,
    transport: uploadedFile ? "multipart" : "json",
    clientRequestId,
  });

  try {
    const result = await sendMedia({
      number: id,
      type,
      file: filePayload,
      text,
      docName: type === "document" ? (fileName ?? "") : "",
      mimetype: mime || undefined,
      readchat: true,
    });

    log("info", "whatsapp.media.send.ok", {
      chatId: id,
      type,
      fileName: fileName ?? null,
      mimetype: mime || null,
      sizeBytes,
      clientRequestId,
    });

    const messageId = typeof result.messageid === "string" ? result.messageid : typeof result.id === "string" ? result.id : null;
    try {
      await completeOutboundRequest({
        clientRequestId,
        responseMeta: {
          ok: true,
          messageId,
        },
        resultMessageId: messageId,
      });
    } catch (persistErr) {
      log("error", "whatsapp.media.send.persist_failed", {
        chatId: id,
        type,
        fileName: fileName ?? null,
        mimetype: mime || null,
        sizeBytes,
        clientRequestId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    return NextResponse.json({ ...result, clientRequestId });
  } catch (err) {
    log("error", "whatsapp.media.send.failed", {
      chatId: id,
      type,
      fileName: fileName ?? null,
      mimetype: mime || null,
      sizeBytes,
      clientRequestId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await failOutboundRequest({
        clientRequestId,
        errorText: err instanceof Error ? err.message : String(err),
      });
    } catch (persistErr) {
      log("error", "whatsapp.media.send.fail_persist_failed", {
        chatId: id,
        type,
        fileName: fileName ?? null,
        mimetype: mime || null,
        sizeBytes,
        clientRequestId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }
    return NextResponse.json(
      {
        error: "Failed to send media",
        details: err instanceof Error ? err.message : String(err),
        clientRequestId,
      },
      { status: 502 },
    );
  }
});
