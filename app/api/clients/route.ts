import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(160),
  document: z.string().max(80).optional(),
  email: z.string().max(160).optional(),
  phone: z.string().max(60).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const q = (parsed.data.q ?? "").trim();
  const limit = parsed.data.limit ?? 20;

  const { rows } = await dbQuery<{
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
    updated_at: string;
  }>(
    q
      ? `
          select id::text, name, document, email, phone, created_at::text, updated_at::text
          from clients
          where name ilike $1
          order by name asc
          limit $2
        `
      : `
          select id::text, name, document, email, phone, created_at::text, updated_at::text
          from clients
          order by id desc
          limit $1
        `,
    q ? [`%${q}%`, limit] : [limit],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      document: r.document,
      email: r.email,
      phone: r.phone,
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
  const document = parsed.data.document?.trim() || null;
  const email = parsed.data.email?.trim() || null;
  const phone = parsed.data.phone?.trim() || null;

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into clients (name, document, email, phone)
      values ($1, $2, $3, $4)
      returning id::text
    `,
    [name, document, email, phone],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao criar cliente" }, { status: 500 });

  return NextResponse.json({ id: row.id });
}

