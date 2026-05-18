import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const departmentEnum = z.enum(["fiscal", "contabil", "pessoal", "societario_paralegal", "administrativo"]);
const statusEnum = z.enum(["to_do", "in_progress", "blocked", "done"]);
const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(20_000).nullable().optional(),
  department: departmentEnum.optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  clientId: z.string().nullable().optional(),
  assigneeAgentId: z.enum(["vanderlei", "gustavo"]).nullable().optional(),
  dueAt: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/[taskId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    title: string;
    description: string | null;
    department: string;
    status: string;
    priority: string;
    client_id: string | null;
    client_name: string | null;
    assignee_agent_id: string | null;
    assignee_name: string | null;
    created_by_agent_id: string | null;
    created_by_name: string | null;
    due_at: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
  }>(
    `
      select
        t.id::text,
        t.title,
        t.description,
        t.department::text,
        t.status::text,
        t.priority::text,
        t.client_id::text,
        c.name as client_name,
        t.assignee_agent_id,
        a.name as assignee_name,
        t.created_by_agent_id,
        ca.name as created_by_name,
        t.due_at::text,
        t.tags,
        t.created_at::text,
        t.updated_at::text
      from tasks t
      left join clients c on c.id = t.client_id
      left join agents a on a.id = t.assignee_agent_id
      left join agents ca on ca.id = t.created_by_agent_id
      where t.id = $1
      limit 1
    `,
    [id],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    item: {
      id: row.id,
      title: row.title,
      description: row.description,
      department: row.department,
      status: row.status,
      priority: row.priority,
      client: row.client_id ? { id: row.client_id, name: row.client_name ?? "—" } : null,
      assignee: row.assignee_agent_id ? { agentId: row.assignee_agent_id, name: row.assignee_name ?? row.assignee_agent_id } : null,
      createdBy: row.created_by_agent_id ? { agentId: row.created_by_agent_id, name: row.created_by_name ?? row.created_by_agent_id } : null,
      dueAt: row.due_at,
      tags: row.tags ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[taskId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  function setField(sql: string, value: unknown) {
    values.push(value);
    fields.push(`${sql} = $${values.length}`);
  }

  if (patch.title) setField("title", patch.title.trim());
  if (patch.description !== undefined) setField("description", patch.description ? patch.description.trim() : null);
  if (patch.department) setField("department", patch.department);
  if (patch.status) setField("status", patch.status);
  if (patch.priority) setField("priority", patch.priority);
  if (patch.assigneeAgentId !== undefined) setField("assignee_agent_id", patch.assigneeAgentId);
  if (patch.clientId !== undefined) {
    const clientId = patch.clientId ? Number.parseInt(patch.clientId, 10) : null;
    if (clientId !== null && !Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
    setField("client_id", clientId);
  }
  if (patch.dueAt !== undefined) setField("due_at", patch.dueAt ? new Date(patch.dueAt).toISOString() : null);
  if (patch.tags) setField("tags", patch.tags);

  if (fields.length === 0) return NextResponse.json({ ok: true });

  values.push(id);
  await dbQuery(`update tasks set ${fields.join(", ")} where id = $${values.length}`, values);

  return NextResponse.json({ ok: true });
}

