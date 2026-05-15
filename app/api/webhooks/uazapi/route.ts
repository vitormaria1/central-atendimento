import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { publish } from "@/lib/stream";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  BaseUrl: z.string().url(),
  EventType: z.string(),
  instanceName: z.string(),
  token: z.string(),
  chatSource: z.string().optional(),
  message: z
    .object({
      chatid: z.string().optional(),
      id: z.string().optional(),
      messageid: z.string().optional(),
    })
    .optional(),
  chat: z
    .object({
      wa_chatid: z.string().optional(),
      wa_fastid: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  // O webhook pode vir envelopado em array (exemplo do n8n)
  const maybeItem = Array.isArray(body) ? body[0]?.body ?? body[0] : body;
  const parsed = payloadSchema.safeParse(maybeItem);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const env = getEnv();
  if (parsed.data.BaseUrl !== env.UAZAPI_BASE_URL) {
    return NextResponse.json({ error: "Invalid BaseUrl" }, { status: 403 });
  }
  if (parsed.data.instanceName !== env.UAZAPI_INSTANCE_NAME) {
    return NextResponse.json({ error: "Invalid instanceName" }, { status: 403 });
  }
  if (parsed.data.token !== env.UAZAPI_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const chatId =
    parsed.data.message?.chatid ?? parsed.data.chat?.wa_chatid ?? parsed.data.chat?.wa_fastid ?? null;

  if (chatId) {
    publish({
      type: "message_received",
      chatId,
      messageId: parsed.data.message?.messageid ?? parsed.data.message?.id,
    });
    publish({ type: "chat_updated", chatId });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
