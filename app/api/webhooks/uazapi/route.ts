import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { publish, recordWebhookDebug } from "@/lib/stream";

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
      fromMe: z.boolean().optional(),
    })
    .optional(),
  chat: z
    .object({
      wa_chatid: z.string().optional(),
      wa_fastid: z.string().optional(),
    })
    .optional(),
});

export const POST = withApi(async (req: Request) => {
  const body = await req.json().catch(() => null);

  // O webhook pode vir envelopado em array (exemplo do n8n)
  const maybeItem = Array.isArray(body) ? body[0]?.body ?? body[0] : body;
  const parsed = payloadSchema.safeParse(maybeItem);
  if (!parsed.success) {
    recordWebhookDebug({ at: Date.now(), accepted: false, reason: "invalid_payload", payload: maybeItem });
    return NextResponse.json({ ok: true, accepted: false }, { status: 200 });
  }

  const env = getEnv();
  const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
  const baseUrlOk = normalizeUrl(parsed.data.BaseUrl) === normalizeUrl(env.UAZAPI_BASE_URL);
  const instanceOk = parsed.data.instanceName === env.UAZAPI_INSTANCE_NAME;
  const tokenOk = parsed.data.token === env.UAZAPI_TOKEN;

  const chatId =
    parsed.data.message?.chatid ?? parsed.data.chat?.wa_chatid ?? parsed.data.chat?.wa_fastid ?? null;

  if (chatId) {
    const accepted = baseUrlOk && instanceOk && tokenOk;
    recordWebhookDebug({
      at: Date.now(),
      accepted,
      reason: accepted
        ? undefined
        : `rejected:${baseUrlOk ? "" : "baseUrl"}${instanceOk ? "" : "|instance"}${tokenOk ? "" : "|token"}`,
      payload: parsed.data,
    });

    if (accepted) {
      // Notificar apenas mensagens recebidas (não as enviadas por nós).
      const fromMe = parsed.data.message?.fromMe === true;
      if (!fromMe) {
        publish({
          type: "message_received",
          chatId,
          messageId: parsed.data.message?.messageid ?? parsed.data.message?.id,
        });
      }
      publish({ type: "chat_updated", chatId });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
});
