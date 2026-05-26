import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const departmentEnum = z.enum(["fiscal", "contabil", "pessoal", "societario_paralegal", "administrativo"]);

const querySchema = z.object({
  department: departmentEnum.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const completedCol = await dbQuery<{ ok: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_name = 'tasks' and column_name = 'completed_at'
      ) as ok
    `,
  );
  const completedExpr = completedCol.rows[0]?.ok ? "coalesce(t.completed_at, t.updated_at)" : "t.updated_at";

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const department = parsed.data.department ?? null;
  const dateFromRaw = parsed.data.dateFrom ?? null;
  const dateToRaw = parsed.data.dateTo ?? null;

  const params: unknown[] = [];
  let deptWhere = "";
  if (department) {
    params.push(department);
    deptWhere = `where department = $1::task_department`;
  }

  let completedWhere = "";
  if (dateFromRaw || dateToRaw) {
    const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
    const dateTo = dateToRaw ? new Date(dateToRaw) : null;
    if (dateFromRaw && Number.isNaN(dateFrom!.getTime())) return NextResponse.json({ error: "Invalid dateFrom" }, { status: 400 });
    if (dateToRaw && Number.isNaN(dateTo!.getTime())) return NextResponse.json({ error: "Invalid dateTo" }, { status: 400 });
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) return NextResponse.json({ error: "dateFrom after dateTo" }, { status: 400 });

    const whereParts: string[] = ["t.status = 'done'"];
    if (dateFrom) {
      params.push(dateFrom.toISOString());
      whereParts.push(`${completedExpr} >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo.toISOString());
      whereParts.push(`${completedExpr} < $${params.length}::timestamptz`);
    }
    completedWhere = `where ${whereParts.join(" and ")}`;
    if (deptWhere) completedWhere += ` and t.department = $1::task_department`;
  } else if (deptWhere) {
    completedWhere = `where t.status = 'done' and t.department = $1::task_department`;
  } else {
    completedWhere = `where t.status = 'done'`;
  }

  const wipByStatus = await dbQuery<{ status: string; count: string }>(
    `
      select status::text as status, count(*)::text as count
      from tasks
      ${deptWhere}
      group by status
      order by status
    `,
    params,
  );

  const workloadByAssignee = await dbQuery<{ assignee_agent_id: string | null; assignee_name: string | null; count: string }>(
    `
      select t.assignee_agent_id, a.name as assignee_name, count(*)::text as count
      from tasks t
      left join agents a on a.id = t.assignee_agent_id
      ${deptWhere ? deptWhere.replace("department", "t.department") : ""}
      group by t.assignee_agent_id, a.name
      order by count(*) desc
      limit 20
    `,
    params,
  );

  const tasksByClient = await dbQuery<{ client_id: string | null; client_name: string | null; count: string }>(
    `
      select t.client_id::text as client_id, c.name as client_name, count(*)::text as count
      from tasks t
      left join clients c on c.id = t.client_id
      ${deptWhere ? deptWhere.replace("department", "t.department") : ""}
      group by t.client_id, c.name
      order by count(*) desc
      limit 20
    `,
    params,
  );

  const tasksByType = await dbQuery<{ task_type_id: string | null; task_type_name: string | null; count: string }>(
    `
      select t.task_type_id, tt.name as task_type_name, count(*)::text as count
      from tasks t
      left join task_types tt on tt.id = t.task_type_id
      ${deptWhere ? deptWhere.replace("department", "t.department") : ""}
      group by t.task_type_id, tt.name
      order by count(*) desc
      limit 30
    `,
    params,
  );

  const completedByAssignee = await dbQuery<{ assignee_agent_id: string | null; assignee_name: string | null; count: string }>(
    `
      select t.assignee_agent_id, a.name as assignee_name, count(*)::text as count
      from tasks t
      left join agents a on a.id = t.assignee_agent_id
      ${completedWhere}
      group by t.assignee_agent_id, a.name
      order by count(*) desc
      limit 20
    `,
    params,
  );

  const completedByAssigneeAndType = await dbQuery<{
    assignee_agent_id: string | null;
    assignee_name: string | null;
    task_type_id: string | null;
    task_type_name: string | null;
    count: string;
  }>(
    `
      select t.assignee_agent_id, a.name as assignee_name, t.task_type_id, tt.name as task_type_name, count(*)::text as count
      from tasks t
      left join agents a on a.id = t.assignee_agent_id
      left join task_types tt on tt.id = t.task_type_id
      ${completedWhere}
      group by t.assignee_agent_id, a.name, t.task_type_id, tt.name
      order by count(*) desc
      limit 100
    `,
    params,
  );

  const overdue = await dbQuery<{ count: string }>(
    `
      select count(*)::text as count
      from tasks
      ${deptWhere}
      ${deptWhere ? "and" : "where"} due_at is not null and due_at < now() and status <> 'done'
    `,
    params,
  );

  const leadTime = await dbQuery<{ avg_hours: string | null }>(
    `
      select avg(extract(epoch from (updated_at - created_at)) / 3600.0)::text as avg_hours
      from tasks
      ${deptWhere}
      ${deptWhere ? "and" : "where"} status = 'done'
    `,
    params,
  );

  return NextResponse.json({
    wipByStatus: wipByStatus.rows.map((r) => ({ status: r.status, count: Number.parseInt(r.count, 10) })),
    workloadByAssignee: workloadByAssignee.rows.map((r) => ({
      assigneeAgentId: r.assignee_agent_id,
      assigneeName: r.assignee_name ?? (r.assignee_agent_id ?? "Sem responsável"),
      count: Number.parseInt(r.count, 10),
    })),
    tasksByClient: tasksByClient.rows.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name ?? (r.client_id ? "Cliente" : "Sem cliente"),
      count: Number.parseInt(r.count, 10),
    })),
    tasksByType: tasksByType.rows.map((r) => ({
      taskTypeId: r.task_type_id,
      taskTypeName: r.task_type_name ?? (r.task_type_id ? r.task_type_id : "Sem tipo"),
      count: Number.parseInt(r.count, 10),
    })),
    completedByAssignee: completedByAssignee.rows.map((r) => ({
      assigneeAgentId: r.assignee_agent_id,
      assigneeName: r.assignee_name ?? (r.assignee_agent_id ?? "Sem responsável"),
      count: Number.parseInt(r.count, 10),
    })),
    completedByAssigneeAndType: completedByAssigneeAndType.rows.map((r) => ({
      assigneeAgentId: r.assignee_agent_id,
      assigneeName: r.assignee_name ?? (r.assignee_agent_id ?? "Sem responsável"),
      taskTypeId: r.task_type_id,
      taskTypeName: r.task_type_name ?? (r.task_type_id ? r.task_type_id : "Sem tipo"),
      count: Number.parseInt(r.count, 10),
    })),
    sla: {
      overdueOpenTasks: Number.parseInt(overdue.rows[0]?.count ?? "0", 10),
      avgLeadTimeHoursDone: leadTime.rows[0]?.avg_hours ? Number.parseFloat(leadTime.rows[0]!.avg_hours!) : null,
    },
  });
});
