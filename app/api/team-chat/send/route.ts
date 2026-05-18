import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  channel: z.string().optional(),
  body: z.string().optional(),
  parentId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const channel = (parsed.data.channel ?? "geral").trim() || "geral";
  const parentId = parsed.data.parentId ? Number.parseInt(parsed.data.parentId, 10) : null;
  if (parentId !== null && !Number.isFinite(parentId)) {
    return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
  }

  const body = (parsed.data.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
  if (body.length > 4000) return NextResponse.json({ error: "Mensagem muito grande" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    channel: string;
    parent_id: string | null;
    sender_name: string;
    body: string;
    created_at: string;
  }>(
    `
      insert into team_chat_messages (channel, parent_id, sender_agent_id, sender_name, body)
      values ($1, $2, $3, $4, $5)
      returning id::text, channel, parent_id::text, sender_name, body, created_at::text
    `,
    [channel, parentId, session.agentId, session.agentName, body],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });

  return NextResponse.json({
    item: {
      id: row.id,
      channel: row.channel,
      parentId: row.parent_id,
      senderName: row.sender_name,
      body: row.body,
      createdAt: row.created_at,
    },
  });
}
