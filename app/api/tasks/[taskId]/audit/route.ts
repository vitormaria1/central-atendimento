import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async (_req: Request, ctx: RouteContext<"/api/tasks/[taskId]/audit">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    actor_name: string;
    event_type: string;
    data: unknown;
    created_at: string;
  }>(
    `
      select id::text, actor_name, event_type, data, created_at::text
      from task_audit_events
      where task_id = $1
      order by id desc
      limit 200
    `,
    [id],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      actorName: r.actor_name,
      eventType: r.event_type,
      data: r.data ?? {},
      createdAt: r.created_at,
    })),
  });
});
