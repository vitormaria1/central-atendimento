import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { getDbPool } from "@/lib/db";
import { log } from "@/lib/logger";
import { publish } from "@/lib/stream";
import { sendText } from "@/lib/uazapi";
import {
  completeOutboundRequest,
  failOutboundRequest,
} from "@/lib/whatsapp-ops";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  linkPreview: z.boolean().optional(),
  clientRequestId: z.string().min(8).max(80).optional(),
});

const RECENT_DUPLICATE_WINDOW_MS = 15_000;
const RECENT_DUPLICATE_DB_WINDOW_SECONDS = 3;

const globalForWhatsappSendGuard = globalThis as typeof globalThis & {
  __ca_recent_whatsapp_text_sends__?: Map<string, number>;
};

function getRecentTextSendGuard() {
  if (!globalForWhatsappSendGuard.__ca_recent_whatsapp_text_sends__) {
    globalForWhatsappSendGuard.__ca_recent_whatsapp_text_sends__ = new Map<string, number>();
  }
  return globalForWhatsappSendGuard.__ca_recent_whatsapp_text_sends__;
}

function pruneRecentTextSendGuard(now: number) {
  const guard = getRecentTextSendGuard();
  for (const [key, ts] of guard.entries()) {
    if (now - ts >= RECENT_DUPLICATE_WINDOW_MS) guard.delete(key);
  }
  return guard;
}

function normalizeTextForGuard(text: string) {
  return text.replace(/\r\n/g, "\n").trim().replace(/\s+/g, " ");
}

function fingerprintText(text: string) {
  return createHash("sha256").update(normalizeTextForGuard(text).toLowerCase()).digest("hex");
}

function buildGuardKey(params: { chatId: string; agentId: string; text: string }) {
  return `${params.chatId}::${params.agentId}::${normalizeTextForGuard(params.text).toLowerCase()}`;
}

async function findOrReserveDuplicateWindow(params: {
  chatId: string;
  agentId: "vanderlei" | "gustavo";
  clientRequestId: string;
  textFingerprint: string;
  requestMeta: Record<string, unknown>;
}) {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [params.chatId, `${params.agentId}:${params.textFingerprint}`],
    );

    const duplicateResult = await client.query<{
      client_request_id: string;
      status: "pending" | "completed" | "failed";
      result_message_id: string | null;
      response_meta: Record<string, unknown> | null;
    }>(
      `
        select client_request_id, status, result_message_id, response_meta
        from whatsapp_send_requests
        where kind = 'text'
          and chat_id = $1
          and created_by_agent_id = $2
          and request_meta->>'textFingerprint' = $3
          and created_at >= now() - make_interval(secs => $4::int)
          and status in ('pending', 'completed')
        order by created_at desc, id desc
        limit 1
      `,
      [params.chatId, params.agentId, params.textFingerprint, RECENT_DUPLICATE_DB_WINDOW_SECONDS],
    );
    const duplicate = duplicateResult.rows[0];
    if (duplicate) {
      await client.query("commit");
      return { kind: "duplicate" as const, duplicate };
    }

    await client.query(
      `
        insert into whatsapp_send_requests (client_request_id, kind, chat_id, status, request_meta, created_by_agent_id)
        values ($1, 'text', $2, 'pending', $3::jsonb, $4)
        on conflict (client_request_id) do nothing
      `,
      [params.clientRequestId, params.chatId, JSON.stringify(params.requestMeta), params.agentId],
    );

    const existingResult = await client.query<{
      client_request_id: string;
      status: "pending" | "completed" | "failed";
      result_message_id: string | null;
      response_meta: Record<string, unknown> | null;
    }>(
      `
        select client_request_id, status, result_message_id, response_meta
        from whatsapp_send_requests
        where client_request_id = $1
        limit 1
      `,
      [params.clientRequestId],
    );
    const existing = existingResult.rows[0] ?? null;
    await client.query("commit");
    return { kind: "reserved" as const, existing };
  } catch (err) {
    await client.query("rollback").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}

export const POST = withApi(async (req: Request, ctx: RouteContext<"/api/chats/[chatId]/send">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { chatId } = await ctx.params;
  const decodedChatId = decodeURIComponent(chatId);
  const textFingerprint = fingerprintText(parsed.data.text);
  const clientRequestId = parsed.data.clientRequestId?.trim() || crypto.randomUUID();
  const guardKey = buildGuardKey({
    chatId: decodedChatId,
    agentId: session.agentId,
    text: parsed.data.text,
  });
  const now = Date.now();
  const recentTextSendGuard = pruneRecentTextSendGuard(now);
  const previousAttemptAt = recentTextSendGuard.get(guardKey);
  if (previousAttemptAt && now - previousAttemptAt < RECENT_DUPLICATE_WINDOW_MS) {
    log("warn", "whatsapp.text.send.duplicate_blocked", {
      chatId: decodedChatId,
      agentId: session.agentId,
      clientRequestId,
      msSincePreviousAttempt: now - previousAttemptAt,
    });
    return NextResponse.json(
      { error: "Duplicate message blocked", duplicateBlocked: true },
      { status: 409 },
    );
  }

  try {
    const requestMeta = {
      agentId: session.agentId,
      textLength: parsed.data.text.length,
      textFingerprint,
      linkPreview: parsed.data.linkPreview ?? false,
    };
    const reservation = await findOrReserveDuplicateWindow({
      chatId: decodedChatId,
      agentId: session.agentId,
      clientRequestId,
      textFingerprint,
      requestMeta,
    });

    if (reservation.kind === "duplicate" && reservation.duplicate.status === "completed") {
      log("warn", "whatsapp.text.send.duplicate_blocked_db_completed", {
        chatId: decodedChatId,
        agentId: session.agentId,
        previousClientRequestId: reservation.duplicate.client_request_id,
      });
      return NextResponse.json(
        {
          ok: true,
          messageId: reservation.duplicate.result_message_id,
          ...(reservation.duplicate.response_meta ?? {}),
          idempotent: true,
          duplicateBlocked: true,
          clientRequestId: reservation.duplicate.client_request_id,
        },
        { status: 200 },
      );
    }
    if (reservation.kind === "duplicate" && reservation.duplicate.status === "pending") {
      log("warn", "whatsapp.text.send.duplicate_blocked_db_pending", {
        chatId: decodedChatId,
        agentId: session.agentId,
        previousClientRequestId: reservation.duplicate.client_request_id,
      });
      return NextResponse.json(
        {
          error: "Duplicate message already in progress",
          duplicateBlocked: true,
          clientRequestId: reservation.duplicate.client_request_id,
        },
        { status: 409 },
      );
    }

    const existing = reservation.kind === "reserved" ? reservation.existing : null;
    if (existing?.status === "completed") {
      const responseMeta = existing.response_meta ?? {};
      const messageId = typeof existing.result_message_id === "string" ? existing.result_message_id : null;
      return NextResponse.json({ ok: true, messageId, ...responseMeta, idempotent: true, clientRequestId });
    }
    if (existing?.status === "pending" && existing.client_request_id !== clientRequestId) {
      return NextResponse.json({ error: "Request already in progress", clientRequestId }, { status: 409 });
    }
  } catch {
    // Observability/dedupe de DB nao pode derrubar o envio.
  }

  const textWithSignature = `*${session.agentName}:*\n${parsed.data.text}`;
  recentTextSendGuard.set(guardKey, now);

  try {
    log("info", "whatsapp.text.send", {
      chatId: decodedChatId,
      agentId: session.agentId,
      textLength: parsed.data.text.length,
      linkPreview: parsed.data.linkPreview ?? false,
      clientRequestId,
    });

    const result = await sendText({
      number: decodedChatId,
      text: textWithSignature,
      linkPreview: parsed.data.linkPreview ?? false,
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
      log("error", "whatsapp.text.send.persist_failed", {
        chatId: decodedChatId,
        agentId: session.agentId,
        clientRequestId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    publish({ type: "chat_updated", chatId: decodedChatId });
    return NextResponse.json({ ok: true, messageId, clientRequestId });
  } catch (err) {
    recentTextSendGuard.delete(guardKey);
    log("error", "whatsapp.text.send.failed", {
      chatId: decodedChatId,
      agentId: session.agentId,
      textLength: parsed.data.text.length,
      clientRequestId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await failOutboundRequest({
        clientRequestId,
        errorText: err instanceof Error ? err.message : String(err),
      });
    } catch (persistErr) {
      log("error", "whatsapp.text.send.fail_persist_failed", {
        chatId: decodedChatId,
        agentId: session.agentId,
        clientRequestId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }
    return NextResponse.json(
      {
        error: "Failed to send message",
        details: err instanceof Error ? err.message : String(err),
        clientRequestId,
      },
      { status: 502 },
    );
  }
});
