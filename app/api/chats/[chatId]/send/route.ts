import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { publish } from "@/lib/stream";
import { sendText } from "@/lib/uazapi";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  linkPreview: z.boolean().optional(),
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

  const result = await sendText({
    number: decodedChatId,
    text: textWithSignature,
    linkPreview: parsed.data.linkPreview ?? false,
  });

  const messageId = typeof result.messageid === "string" ? result.messageid : typeof result.id === "string" ? result.id : null;

  publish({ type: "chat_updated", chatId: decodedChatId });
  return NextResponse.json({ ok: true, messageId });
});
