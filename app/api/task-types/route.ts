import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(2).max(80),
});

function slugify(input: string) {
  const ascii = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const s = ascii.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 40) || "tipo";
}

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{ id: string; name: string; created_at: string }>(
    "select id, name, created_at::text from task_types order by name asc",
  );

  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const name = parsed.data.name.trim();
  const baseId = slugify(name);

  // garante id único
  let id = baseId;
  for (let i = 0; i < 10; i += 1) {
    const tryId = i === 0 ? baseId : `${baseId}_${i + 1}`;
    const { rows } = await dbQuery<{ id: string }>(
      `
        insert into task_types (id, name)
        values ($1, $2)
        on conflict (id) do nothing
        returning id
      `,
      [tryId, name],
    );
    if (rows[0]?.id) {
      id = rows[0].id;
      return NextResponse.json({ id, name });
    }
  }

  // se nome já existe, tenta retornar existente
  const existing = await dbQuery<{ id: string }>("select id from task_types where name = $1 limit 1", [name]);
  if (existing.rows[0]?.id) return NextResponse.json({ id: existing.rows[0].id, name });

  return NextResponse.json({ error: "Falha ao criar tipo" }, { status: 500 });
});

