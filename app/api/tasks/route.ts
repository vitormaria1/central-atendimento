import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

const querySchema = z.object({
  q: z.string().optional(),
  department: z.string().min(1).max(40).optional(),
  status: z.string().min(1).max(40).optional(),
  assigneeAgentId: z.enum(["vanderlei", "gustavo"]).optional(),
  taskTypeId: z.string().optional(),
  clientId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  department: z.string().min(1).max(40),
  priority: priorityEnum.optional(),
  status: z.string().min(1).max(40).optional(),
  clientId: z.string().optional(),
  assigneeAgentId: z.enum(["vanderlei", "gustavo"]).nullable().optional(),
  taskTypeId: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(), // ISO
  tags: z.array(z.string().min(1).max(40)).optional(),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const q = (parsed.data.q ?? "").trim();
  const department = parsed.data.department ?? null;
  const status = parsed.data.status ?? null;
  const assigneeAgentId = parsed.data.assigneeAgentId ?? null;
  const effectiveAssigneeAgentId = session.agentId === "gustavo" ? "gustavo" : assigneeAgentId;
  const taskTypeId = parsed.data.taskTypeId ?? null;
  const clientId = parsed.data.clientId ? Number.parseInt(parsed.data.clientId, 10) : null;
  const limit = parsed.data.limit ?? 80;

  if (clientId !== null && !Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });

  const where: string[] = [];
  const params: unknown[] = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(t.title ilike $${params.length} or t.description ilike $${params.length})`);
  }
  if (department) {
    params.push(department);
    where.push(`t.department = $${params.length}::task_department`);
  }
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}::task_status`);
  }
  if (effectiveAssigneeAgentId) {
    params.push(effectiveAssigneeAgentId);
    where.push(`t.assignee_agent_id = $${params.length}`);
  }
  if (clientId !== null) {
    params.push(clientId);
    where.push(`t.client_id = $${params.length}`);
  }
  if (taskTypeId) {
    params.push(taskTypeId);
    where.push(`t.task_type_id = $${params.length}`);
  }

  params.push(limit);
  const sql = `
    select
      t.id::text,
      lpad(t.task_number::text, 4, '0') || '/' || extract(year from t.created_at)::int::text as task_number,
      t.title,
      t.department::text,
      t.status::text,
      t.priority::text,
      t.client_id::text,
      c.name as client_name,
      t.task_type_id,
      tt.name as task_type_name,
      t.assignee_agent_id,
      a.name as assignee_name,
      t.due_at::text,
      t.tags,
      t.created_at::text,
      t.updated_at::text
    from tasks t
    left join clients c on c.id = t.client_id
    left join task_types tt on tt.id = t.task_type_id
    left join agents a on a.id = t.assignee_agent_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by t.id desc
    limit $${params.length}
  `;

  const { rows } = await dbQuery<{
    id: string;
    task_number: string;
    title: string;
    department: string;
    status: string;
    priority: string;
    client_id: string | null;
    client_name: string | null;
    task_type_id: string | null;
    task_type_name: string | null;
    assignee_agent_id: string | null;
    assignee_name: string | null;
    due_at: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
  }>(sql, params);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      taskNumber: r.task_number,
      title: r.title,
      department: r.department,
      status: r.status,
      priority: r.priority,
      client: r.client_id ? { id: r.client_id, name: r.client_name ?? "—" } : null,
      taskType: r.task_type_id ? { id: r.task_type_id, name: r.task_type_name ?? r.task_type_id } : null,
      assignee: r.assignee_agent_id ? { agentId: r.assignee_agent_id, name: r.assignee_name ?? r.assignee_agent_id } : null,
      dueAt: r.due_at,
      tags: r.tags ?? [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (session.agentId === "gustavo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const title = parsed.data.title.trim();
  const description = parsed.data.description?.trim() || null;
  const department = parsed.data.department;
  const status = parsed.data.status ?? "to_do";
  const priority = parsed.data.priority ?? "normal";
  const assigneeAgentId = parsed.data.assigneeAgentId ?? session.agentId;
  const taskTypeId = parsed.data.taskTypeId ?? null;
  const clientId = parsed.data.clientId ? Number.parseInt(parsed.data.clientId, 10) : null;
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null;
  const tags = parsed.data.tags ?? [];

  if (clientId !== null && !Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into tasks (title, description, department, status, priority, client_id, assignee_agent_id, task_type_id, created_by_agent_id, due_at, tags)
      values ($1, $2, $3::task_department, $4::task_status, $5::task_priority, $6, $7, $8, $9, $10, $11)
      returning id::text
    `,
    [title, description, department, status, priority, clientId, assigneeAgentId, taskTypeId, session.agentId, dueAt, tags],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao criar tarefa" }, { status: 500 });

  return NextResponse.json({ id: row.id });
});
