import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { findMessages } from "@/lib/uazapi";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withApi(async (req: Request, ctx: RouteContext<"/api/chats/[chatId]/messages">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { chatId } = await ctx.params;
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const decodedChatId = decodeURIComponent(chatId);
    const messages = await findMessages({
      chatid: decodedChatId,
      limit: parsed.data.limit ?? 80,
      offset: parsed.data.offset ?? 0,
    });

    const items = [...messages].sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0));
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load messages", details: message }, { status: 502 });
  }
});
