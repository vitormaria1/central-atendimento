import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { getWebhookDebugItems } from "@/lib/stream";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let persisted: Array<{
    id: string;
    at: number;
    eventType: string;
    chatId: string | null;
    accepted: boolean;
    reason?: string;
    payload: unknown;
  }> = [];
  try {
    const { rows } = await dbQuery<{
      id: string;
      event_type: string;
      chat_id: string | null;
      accepted: boolean;
      reason: string | null;
      payload: unknown;
      created_at: string;
    }>(
      `
        select id::text, event_type, chat_id, accepted, reason, payload, created_at::text
        from whatsapp_webhook_events
        order by created_at desc, id desc
        limit 50
      `,
    );
    persisted = rows.map((row) => ({
      id: row.id,
      at: new Date(row.created_at).getTime(),
      eventType: row.event_type,
      chatId: row.chat_id,
      accepted: row.accepted,
      reason: row.reason ?? undefined,
      payload: row.payload,
    }));
  } catch {
    persisted = [];
  }

  const memory = getWebhookDebugItems().map((item, index) => ({
    id: `memory_${index}`,
    at: item.at,
    eventType: "memory",
    chatId: null,
    accepted: item.accepted,
    reason: item.reason,
    payload: item.payload,
  }));

  return NextResponse.json({
    items: [...persisted, ...memory].sort((a, b) => b.at - a.at).slice(0, 50),
  });
});
