import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().optional(),
  channel: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const q = (parsed.data.q ?? "").trim();
  if (!q) return NextResponse.json({ items: [] });

  const channel = (parsed.data.channel ?? "geral").trim() || "geral";
  const limit = parsed.data.limit ?? 20;

  const { rows } = await dbQuery<{
    id: string;
    channel: string;
    parent_id: string | null;
    sender_name: string;
    body: string;
    created_at: string;
  }>(
    `
      select id::text, channel, parent_id::text, sender_name, body, created_at::text
      from team_chat_messages
      where channel = $1
        and search_tsv @@ websearch_to_tsquery('portuguese', unaccent($2))
      order by id desc
      limit $3
    `,
    [channel, q, limit],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      parentId: r.parent_id,
      senderName: r.sender_name,
      body: r.body,
      createdAt: r.created_at,
    })),
  });
}
