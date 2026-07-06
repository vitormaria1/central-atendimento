import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { log } from "@/lib/logger";
import { sendMedia } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  type: z.enum(["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"]),
  base64: z.string().min(10).optional(),
  fileName: z.string().min(1).max(200).optional(),
  mimetype: z.string().min(1).max(100).optional(),
  caption: z.string().max(4000).optional(),
});

const MAX_MEDIA_BYTES = 9_000_000;

function agentLabel(agentName: "Vanderlei" | "Gustavo") {
  return `*${agentName}:*`;
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

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const parsed = bodySchema.safeParse({
      type: form.get("type"),
      fileName: form.get("fileName"),
      mimetype: form.get("mimetype"),
      caption: form.get("caption"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    type = parsed.data.type;
    caption = parsed.data.caption?.trim() ?? "";
    fileName = parsed.data.fileName?.trim() || undefined;
    mimetype = parsed.data.mimetype?.trim() || undefined;

    const fileField = form.get("file");
    if (!(fileField instanceof File)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    uploadedFile = fileField;
    if (uploadedFile.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    base64 = await fileToBase64(uploadedFile);
    mimetype = mimetype ?? (uploadedFile.type || undefined);
    fileName = fileName ?? (uploadedFile.name || undefined);
  } else {
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    type = parsed.data.type;
    caption = parsed.data.caption?.trim() ?? "";
    fileName = parsed.data.fileName?.trim() || undefined;
    mimetype = parsed.data.mimetype?.trim() || undefined;
    base64 = parsed.data.base64?.trim();

    if (!base64) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (base64.length > 12_000_000) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
  }

  const text = caption ? `${agentLabel(session.agentName)}\n${caption}` : agentLabel(session.agentName);

  const mime = mimetype?.trim() || "";
  const payloadBase64 = base64.trim();
  // A API aceita "base64 puro" e também "data URI". Para maximizar compatibilidade, enviamos como data URI
  // quando tivermos o mimeType.
  const filePayload = mime ? `data:${mime};base64,${payloadBase64}` : payloadBase64;

  const sizeBytes = uploadedFile?.size ?? Math.floor((payloadBase64.length * 3) / 4);
  log("info", "whatsapp.media.send", {
    chatId: id,
    type,
    fileName: fileName ?? null,
    mimetype: mime || null,
    sizeBytes,
    transport: uploadedFile ? "multipart" : "json",
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
    });

    return NextResponse.json(result);
  } catch (err) {
    log("error", "whatsapp.media.send.failed", {
      chatId: id,
      type,
      fileName: fileName ?? null,
      mimetype: mime || null,
      sizeBytes,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: "Failed to send media",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
});
