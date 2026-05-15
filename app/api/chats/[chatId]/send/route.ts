import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";
import { publish } from "@/lib/stream";
import { sendText } from "@/lib/uazapi";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  linkPreview: z.boolean().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/chats/[chatId]/send">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { chatId } = await ctx.params;
  const decodedChatId = decodeURIComponent(chatId);
  const textWithSignature = `${parsed.data.text}\n\n— ${session.agentName}`;

  const result = await sendText({
    number: decodedChatId,
    text: textWithSignature,
    linkPreview: parsed.data.linkPreview ?? false,
  });

  const messageId = typeof result.messageid === "string" ? result.messageid : typeof result.id === "string" ? result.id : null;

  await dbQuery(
    "insert into audit_send (chat_id, agent_id, uazapi_message_id) values ($1, $2, $3)",
    [decodedChatId, session.agentId, messageId],
  );

  publish({ type: "chat_updated", chatId: decodedChatId });
  return NextResponse.json({ ok: true, messageId });
}

