import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { sendMedia } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  type: z.enum(["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"]),
  base64: z.string().min(10),
  fileName: z.string().min(1).max(200).optional(),
  mimetype: z.string().min(1).max(100).optional(),
  caption: z.string().max(4000).optional(),
});

function agentLabel(agentName: "Vanderlei" | "Gustavo") {
  return `*${agentName}:*`;
}

export const POST = withApi(async (req: Request, ctx: RouteContext<"/api/chats/[chatId]/send-media">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId } = await ctx.params;
  const id = decodeURIComponent(chatId);

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Limite simples para não estourar payload em serverless (base64 cresce ~33%).
  // 12MB em base64 ~= 9MB binário.
  if (parsed.data.base64.length > 12_000_000) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const caption = parsed.data.caption?.trim() ?? "";
  const text = caption ? `${agentLabel(session.agentName)}\n${caption}` : agentLabel(session.agentName);

  const mime = parsed.data.mimetype?.trim() || "";
  const base64 = parsed.data.base64.trim();
  // A API aceita "base64 puro" e também "data URI". Para maximizar compatibilidade, enviamos como data URI
  // quando tivermos o mimeType.
  const filePayload = mime ? `data:${mime};base64,${base64}` : base64;

  const result = await sendMedia({
    number: id,
    type: parsed.data.type,
    file: filePayload,
    text,
    docName: parsed.data.type === "document" ? (parsed.data.fileName ?? "") : "",
    mimetype: parsed.data.mimetype,
    readchat: true,
  });

  return NextResponse.json(result);
});
