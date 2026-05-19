import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "Slug inválido (use letras minúsculas, números, - e _)"),
  name: z.string().min(1).max(60),
});

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{
    slug: string;
    name: string;
    created_at: string;
  }>("select slug, name, created_at::text from team_chat_channels order by slug asc");

  return NextResponse.json({
    items: rows.map((r) => ({ slug: r.slug, name: r.name, createdAt: r.created_at })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const slug = parsed.data.slug.trim().toLowerCase();
  const name = parsed.data.name.trim();

  await dbQuery(
    `
      insert into team_chat_channels (slug, name, created_by_agent_id, created_by_name)
      values ($1, $2, $3, $4)
      on conflict (slug) do update set
        name = excluded.name
    `,
    [slug, name, session.agentId, session.agentName],
  );

  return NextResponse.json({ ok: true });
});
