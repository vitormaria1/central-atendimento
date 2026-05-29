import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const colorRe = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const idSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_]+$/);

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{ id: string; name: string; color: string; sort_order: number }>(
    `select id, name, color, sort_order from task_department_meta order by sort_order asc, id asc`,
    [],
  );

  return NextResponse.json({ items: rows.map((r) => ({ id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order })) });
});

const createSchema = z.object({
  id: idSchema,
  name: z.string().min(2).max(60),
  color: z.string().regex(colorRe).optional(),
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.agentId !== "vanderlei") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const id = parsed.data.id;
  const name = parsed.data.name.trim();
  const color = parsed.data.color ?? "#64748b";

  await dbQuery(`alter type task_department add value if not exists '${id}'`, []);

  const { rows } = await dbQuery<{ id: string; name: string; color: string; sort_order: number }>(
    `
      insert into task_department_meta (id, name, color, sort_order)
      values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 10 from task_department_meta))
      on conflict (id) do update set name = excluded.name, color = excluded.color
      returning id, name, color, sort_order
    `,
    [id, name, color],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao criar departamento" }, { status: 500 });
  return NextResponse.json({ item: { id: row.id, name: row.name, color: row.color, sortOrder: row.sort_order } });
});

const patchSchema = z.object({
  id: idSchema,
  name: z.string().min(2).max(60).optional(),
  color: z.string().regex(colorRe).optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional(),
});

export const PATCH = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.agentId !== "vanderlei") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const sets: string[] = [];
  const params: unknown[] = [];

  if (parsed.data.name) {
    params.push(parsed.data.name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (parsed.data.color) {
    params.push(parsed.data.color);
    sets.push(`color = $${params.length}`);
  }
  if (typeof parsed.data.sortOrder === "number") {
    params.push(parsed.data.sortOrder);
    sets.push(`sort_order = $${params.length}`);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  params.push(parsed.data.id);

  await dbQuery(`update task_department_meta set ${sets.join(", ")} where id = $${params.length}`, params);
  return NextResponse.json({ ok: true });
});

