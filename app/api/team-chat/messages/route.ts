import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  channel: z.string().optional(),
  afterId: z.string().optional(),
  limit: z.string().optional(),
});

function clampLimit(raw: string | undefined) {
  const parsed = raw ? Number.parseInt(raw, 10) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(200, parsed));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const channel = (parsed.data.channel ?? "geral").trim() || "geral";
  const limit = clampLimit(parsed.data.limit);
  const afterId = parsed.data.afterId ? Number.parseInt(parsed.data.afterId, 10) : null;

  if (afterId !== null && !Number.isFinite(afterId)) {
    return NextResponse.json({ error: "Invalid afterId" }, { status: 400 });
  }

  const rows = await (async () => {
    if (afterId !== null) {
      const { rows } = await dbQuery<{
        id: string;
        channel: string;
        sender_name: string;
        body: string;
        created_at: string;
      }>(
        `
          select id::text, channel, sender_name, body, created_at::text
          from team_chat_messages
          where channel = $1 and id > $2
          order by id asc
          limit $3
        `,
        [channel, afterId, limit],
      );
      return rows;
    }

    const { rows } = await dbQuery<{
      id: string;
      channel: string;
      sender_name: string;
      body: string;
      created_at: string;
    }>(
      `
        select *
        from (
          select id::text, channel, sender_name, body, created_at::text
          from team_chat_messages
          where channel = $1
          order by id desc
          limit $2
        ) t
        order by id asc
      `,
      [channel, limit],
    );
    return rows;
  })();

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      senderName: r.sender_name,
      body: r.body,
      createdAt: r.created_at,
    })),
  });
}

