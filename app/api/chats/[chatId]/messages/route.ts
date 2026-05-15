import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findMessages } from "@/lib/uazapi";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: Request, ctx: RouteContext<"/api/chats/[chatId]/messages">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId } = await ctx.params;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const messages = await findMessages({ chatid: decodeURIComponent(chatId), limit: parsed.data.limit ?? 50 });

  const items = [...messages].sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0));
  return NextResponse.json({ items });
}

