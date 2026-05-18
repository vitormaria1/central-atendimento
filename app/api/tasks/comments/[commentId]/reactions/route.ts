import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emojiSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/comments/[commentId]/reactions">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await ctx.params;
  const id = Number.parseInt(commentId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const { rows } = await dbQuery<{
    emoji: string;
    count: string;
    mine: boolean;
  }>(
    `
      select
        emoji,
        count(*)::text as count,
        bool_or(actor_agent_id = $2) as mine
      from task_comment_reactions
      where comment_id = $1
      group by emoji
      order by count(*) desc, emoji asc
    `,
    [id, session.agentId],
  );

  return NextResponse.json({
    items: rows.map((r) => ({ emoji: r.emoji, count: Number.parseInt(r.count, 10), mine: Boolean(r.mine) })),
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/tasks/comments/[commentId]/reactions">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await ctx.params;
  const id = Number.parseInt(commentId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = emojiSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const emoji = parsed.data.emoji.trim();
  if (!emoji) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await dbQuery(
    `
      insert into task_comment_reactions (comment_id, emoji, actor_agent_id, actor_name)
      values ($1, $2, $3, $4)
      on conflict (comment_id, emoji, actor_agent_id) do nothing
    `,
    [id, emoji, session.agentId, session.agentName],
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/tasks/comments/[commentId]/reactions">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await ctx.params;
  const id = Number.parseInt(commentId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = emojiSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const emoji = parsed.data.emoji.trim();
  if (!emoji) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await dbQuery("delete from task_comment_reactions where comment_id = $1 and emoji = $2 and actor_agent_id = $3", [
    id,
    emoji,
    session.agentId,
  ]);

  return NextResponse.json({ ok: true });
}

