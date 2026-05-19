import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const departmentEnum = z.enum(["fiscal", "contabil", "pessoal", "societario_paralegal", "administrativo"]);
const viewTypeEnum = z.enum(["list", "board", "calendar"]);

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  viewType: viewTypeEnum.optional(),
  department: departmentEnum.nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = withApi(async (req: Request, ctx: RouteContext<"/api/task-views/[viewId]">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { viewId } = await ctx.params;
  const id = Number.parseInt(viewId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid viewId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const fields: string[] = [];
  const values: unknown[] = [];
  const patch = parsed.data;

  function setField(sql: string, value: unknown) {
    values.push(value);
    fields.push(`${sql} = $${values.length}`);
  }

  if (patch.name) setField("name", patch.name.trim());
  if (patch.viewType) setField("view_type", patch.viewType);
  if (patch.department !== undefined) setField("department", patch.department);
  if (patch.config) setField("config", JSON.stringify(patch.config));

  if (fields.length === 0) return NextResponse.json({ ok: true });

  values.push(session.agentId);
  values.push(id);

  const { rowCount } = await dbQuery(
    `update task_views set ${fields.join(", ")} where owner_agent_id = $${values.length - 1} and id = $${values.length}`,
    values,
  );

  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});

export const DELETE = withApi(async (_req: Request, ctx: RouteContext<"/api/task-views/[viewId]">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { viewId } = await ctx.params;
  const id = Number.parseInt(viewId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid viewId" }, { status: 400 });

  const { rowCount } = await dbQuery("delete from task_views where owner_agent_id = $1 and id = $2", [session.agentId, id]);
  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
