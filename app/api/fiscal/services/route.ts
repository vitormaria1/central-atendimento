import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serviceSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(5000).optional().nullable(),
  municipalCode: z.string().max(80).optional().nullable(),
  cnae: z.string().max(80).optional().nullable(),
  taxRegime: z.string().max(120).optional().nullable(),
  active: z.coerce.boolean().default(true),
  focusPayload: z.record(z.string(), z.unknown()).default({}),
});

const patchSchema = serviceSchema
  .partial()
  .extend({
    id: z.coerce.number().int().positive(),
  })
  .refine((data) => Object.keys(data).some((key) => key !== "id"), {
    message: "No changes",
  });

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    municipal_code: string | null;
    cnae: string | null;
    tax_regime: string | null;
    active: boolean;
    focus_payload: unknown;
    created_at: string;
    updated_at: string;
  }>(
    `
      select
        id::text,
        code,
        name,
        description,
        municipal_code,
        cnae,
        tax_regime,
        active,
        focus_payload,
        created_at::text,
        updated_at::text
      from fiscal_service_catalog
      order by active desc, name asc, id desc
    `,
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      municipalCode: r.municipal_code,
      cnae: r.cnae,
      taxRegime: r.tax_regime,
      active: r.active,
      focusPayload: r.focus_payload,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = serviceSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;
  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into fiscal_service_catalog (
        code,
        name,
        description,
        municipal_code,
        cnae,
        tax_regime,
        active,
        focus_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      on conflict (code) do update set
        name = excluded.name,
        description = excluded.description,
        municipal_code = excluded.municipal_code,
        cnae = excluded.cnae,
        tax_regime = excluded.tax_regime,
        active = excluded.active,
        focus_payload = excluded.focus_payload
      returning id::text
    `,
    [body.code.trim(), body.name.trim(), body.description || null, body.municipalCode || null, body.cnae || null, body.taxRegime || null, body.active, JSON.stringify(body.focusPayload ?? {})],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao salvar serviço" }, { status: 500 });
  return NextResponse.json({ id: row.id });
});

export const PATCH = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;
  const setParts: string[] = [];
  const values: unknown[] = [];

  const setField = (column: string, value: unknown) => {
    values.push(value);
    setParts.push(`${column} = $${values.length}`);
  };

  if (body.code !== undefined) setField("code", body.code.trim());
  if (body.name !== undefined) setField("name", body.name.trim());
  if (body.description !== undefined) setField("description", body.description || null);
  if (body.municipalCode !== undefined) setField("municipal_code", body.municipalCode || null);
  if (body.cnae !== undefined) setField("cnae", body.cnae || null);
  if (body.taxRegime !== undefined) setField("tax_regime", body.taxRegime || null);
  if (body.active !== undefined) setField("active", body.active);
  if (body.focusPayload !== undefined) setField("focus_payload", JSON.stringify(body.focusPayload ?? {}));

  if (setParts.length === 0) return NextResponse.json({ error: "No changes" }, { status: 400 });

  values.push(body.id);
  const { rowCount } = await dbQuery(
    `
      update fiscal_service_catalog
      set ${setParts.join(", ")}
      where id = $${values.length}
    `,
    values,
  );

  if (!rowCount) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
