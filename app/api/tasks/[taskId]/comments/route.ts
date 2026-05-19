import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  body: z.string().min(1).max(20_000),
});

function extractMentions(body: string) {
  const mentions = new Set<string>();
  const re = /@([a-z0-9_]+)/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(body))) {
    const v = (m[1] ?? "").toLowerCase();
    if (!v) continue;
    if (v === "vanderlei" || v === "gustavo") mentions.add(v);
  }
  return Array.from(mentions);
}

export const GET = withApi(async (_req: Request, ctx: RouteContext<"/api/tasks/[taskId]/comments">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    author_name: string;
    body: string;
    mentions: string[];
    created_at: string;
  }>(
    `
      select id::text, author_name, body, mentions, created_at::text
      from task_comments
      where task_id = $1
      order by id asc
    `,
    [id],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      authorName: r.author_name,
      body: r.body,
      mentions: r.mentions ?? [],
      createdAt: r.created_at,
    })),
  });
});

export const POST = withApi(async (req: Request, ctx: RouteContext<"/api/tasks/[taskId]/comments">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data.body.trim();
  const mentions = extractMentions(body);

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into task_comments (task_id, author_agent_id, author_name, body, mentions)
      values ($1, $2, $3, $4, $5)
      returning id::text
    `,
    [id, session.agentId, session.agentName, body, mentions],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao comentar" }, { status: 500 });

  return NextResponse.json({ id: row.id });
});
