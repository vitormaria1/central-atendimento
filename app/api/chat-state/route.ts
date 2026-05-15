import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const getQuerySchema = z.object({
  chatIds: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = getQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const chatIds = (parsed.data.chatIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (chatIds.length === 0) return NextResponse.json({ items: [] });

  const { rows } = await dbQuery<{
    chat_id: string;
    status: "pendente" | "resolvido";
    assigned_agent_id: string | null;
    tags: string[];
    updated_at: string;
  }>(
    "select chat_id, status, assigned_agent_id, tags, updated_at from chat_state where chat_id = any($1::text[])",
    [chatIds],
  );

  return NextResponse.json({
    items: rows.map((r: (typeof rows)[number]) => ({
      chatId: r.chat_id,
      status: r.status,
      assignedAgentId: r.assigned_agent_id,
      tags: r.tags ?? [],
      updatedAt: r.updated_at,
    })),
  });
}
