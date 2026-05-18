import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const departmentEnum = z.enum(["fiscal", "contabil", "pessoal", "societario_paralegal", "administrativo"]);
const viewTypeEnum = z.enum(["list", "board", "calendar"]);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  viewType: viewTypeEnum,
  department: departmentEnum.nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const department = url.searchParams.get("department");

  const params: unknown[] = [session.agentId];
  let deptSql = "";
  if (department) {
    const parsed = departmentEnum.safeParse(department);
    if (!parsed.success) return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    params.push(parsed.data);
    deptSql = `and (department is null or department = $2::task_department)`;
  }

  const { rows } = await dbQuery<{
    id: string;
    name: string;
    view_type: string;
    department: string | null;
    config: unknown;
    created_at: string;
    updated_at: string;
  }>(
    `
      select id::text, name, view_type::text, department::text, config, created_at::text, updated_at::text
      from task_views
      where owner_agent_id = $1
      ${deptSql}
      order by id desc
    `,
    params,
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      viewType: r.view_type,
      department: r.department,
      config: r.config ?? {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const name = parsed.data.name.trim();
  const viewType = parsed.data.viewType;
  const department = parsed.data.department ?? null;
  const config = parsed.data.config ?? {};

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into task_views (name, view_type, department, owner_agent_id, config)
      values ($1, $2::task_view_type, $3::task_department, $4, $5::jsonb)
      returning id::text
    `,
    [name, viewType, department, session.agentId, JSON.stringify(config)],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao criar view" }, { status: 500 });
  return NextResponse.json({ id: row.id });
}
