import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  messageId: z.string(),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const messageId = Number.parseInt(parsed.data.messageId, 10);
  if (!Number.isFinite(messageId)) return NextResponse.json({ error: "Invalid messageId" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    filename: string;
    mimetype: string | null;
    size_bytes: number;
    created_at: string;
  }>(
    `
      select id::text, filename, mimetype, size_bytes, created_at::text
      from team_chat_attachments
      where message_id = $1
      order by id asc
    `,
    [messageId],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mimetype: r.mimetype,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
    })),
  });
});
