import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { dbQuery } from "@/lib/db";
import { publish, recordWebhookDebug } from "@/lib/stream";
import { parsePresenceUpdate } from "@/lib/chat-presence";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  BaseUrl: z.string().url(),
  EventType: z.string(),
  instanceName: z.string(),
  token: z.string(),
  chatSource: z.string().optional(),
  label: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
  labels: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .optional(),
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
  chatid: z.string().optional(),
  chatId: z.string().optional(),
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
    parsed.data.message?.chatid ??
    parsed.data.chatid ??
    parsed.data.chatId ??
    parsed.data.chat?.wa_chatid ??
    parsed.data.chat?.wa_fastid ??
    null;

  const accepted = baseUrlOk && instanceOk && tokenOk;
  if (chatId) {
    recordWebhookDebug({
      at: Date.now(),
      accepted,
      reason: accepted
        ? undefined
        : `rejected:${baseUrlOk ? "" : "baseUrl"}${instanceOk ? "" : "|instance"}${tokenOk ? "" : "|token"}`,
      payload: parsed.data,
    });
  }

  if (accepted) {
    const eventType = (parsed.data.EventType ?? "").toLowerCase();
    const isLabelEvent = eventType.includes("label") || eventType.includes("etiquet");

    if (isLabelEvent) {
      const payloadLabels = parsed.data.labels ?? (parsed.data.label ? [parsed.data.label] : []);
      const l0 = payloadLabels[0];
      const labelId = (l0?.id ?? "").trim() || null;
      const labelName = (l0?.name ?? "").trim() || null;
      const labelColor = (l0?.color ?? "").trim() || null;

      if (labelId && labelName) {
        await dbQuery(
          `
            insert into wa_labels (id, name, color)
            values ($1, $2, $3)
            on conflict (id) do update set
              name = excluded.name,
              color = excluded.color,
              updated_at = now()
          `,
          [labelId, labelName, labelColor],
        );
      }

      // For chat label assign/remove events, update chat_state.tags (merge mode).
      if (chatId) {
        const isRemove = eventType.includes("remove") || eventType.includes("delete") || eventType.includes("unassign");
        const tag = labelName ?? labelId;
        if (tag) {
          await dbQuery(
            `
              insert into chat_state (chat_id, status, assigned_agent_id, tags)
              values ($1, 'pendente', null, $2)
              on conflict (chat_id) do update set
                tags = (
                  select array(
                    select distinct x from unnest(
                      case when $3::boolean then array_remove(chat_state.tags, $4) else (chat_state.tags || excluded.tags) end
                    ) as x
                    where x is not null and length(trim(x)) > 0
                  )
                ),
                updated_at = now()
            `,
            [chatId, isRemove ? [] : [tag], isRemove, tag],
          );
        }
      }
    }

    const presenceUpdate = parsePresenceUpdate(parsed.data, eventType);
    if (chatId && presenceUpdate) {
      await dbQuery(
        `
          insert into chat_state (chat_id, status, assigned_agent_id, tags, presence_status, last_seen_at, typing_until_at)
          values ($1, 'pendente', null, '{}'::text[], $2, $3, $4)
          on conflict (chat_id) do update set
            presence_status = coalesce(excluded.presence_status, chat_state.presence_status),
            last_seen_at = coalesce(excluded.last_seen_at, chat_state.last_seen_at),
            typing_until_at = excluded.typing_until_at,
            updated_at = now()
        `,
        [chatId, presenceUpdate.presenceStatus ?? null, presenceUpdate.lastSeenAt ?? null, presenceUpdate.typingUntilAt ?? null],
      );
    }

    if (chatId) {
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
