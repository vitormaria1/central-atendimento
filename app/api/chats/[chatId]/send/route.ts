import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { log } from "@/lib/logger";
import { publish } from "@/lib/stream";
import { sendText } from "@/lib/uazapi";
import {
  completeOutboundRequest,
  failOutboundRequest,
  reserveOutboundRequest,
} from "@/lib/whatsapp-ops";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  linkPreview: z.boolean().optional(),
  clientRequestId: z.string().min(8).max(80).optional(),
});

export const POST = withApi(async (req: Request, ctx: RouteContext<"/api/chats/[chatId]/send">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { chatId } = await ctx.params;
  const decodedChatId = decodeURIComponent(chatId);
  const textWithSignature = `*${session.agentName}:*\n${parsed.data.text}`;
  const clientRequestId = parsed.data.clientRequestId?.trim() || crypto.randomUUID();

  const existing = await reserveOutboundRequest({
    clientRequestId,
    kind: "text",
    chatId: decodedChatId,
    requestMeta: {
      agentId: session.agentId,
      textLength: parsed.data.text.length,
      linkPreview: parsed.data.linkPreview ?? false,
    },
    createdByAgentId: session.agentId,
  });
  if (existing?.inserted === false && existing.status === "completed") {
    const responseMeta = existing.responseMeta ?? {};
    const messageId = typeof existing.resultMessageId === "string" ? existing.resultMessageId : null;
    return NextResponse.json({ ok: true, messageId, ...responseMeta, idempotent: true, clientRequestId });
  }
  if (existing?.inserted === false && existing.status === "pending") {
    return NextResponse.json({ error: "Request already in progress", clientRequestId }, { status: 409 });
  }
  if (existing?.inserted === false && existing.status === "failed") {
    return NextResponse.json({ error: "Previous request failed", clientRequestId }, { status: 409 });
  }

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
