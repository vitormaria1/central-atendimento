import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { monthStartIso, todayIso } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  clientId: z.coerce.number().int().positive(),
  description: z.string().min(1).max(500),
  amountCents: z.coerce.number().int().min(1),
  competenceMonth: z.string().optional(),
  serviceDate: z.string().optional(),
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;
  const competenceMonth = body.competenceMonth || monthStartIso();
  const serviceDate = body.serviceDate || todayIso();

  const contractRes = await dbQuery<{ id: string }>("select id::text from client_contracts where client_id = $1 limit 1", [body.clientId]);
  const contractId = contractRes.rows[0]?.id ?? null;

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into extra_services (
        client_id,
        contract_id,
        competence_month,
        service_date,
        description,
        amount_cents,
        status,
        created_by_agent_id
      )
      values ($1, $2, $3, $4, $5, $6, 'open', $7)
      returning id::text
    `,
    [body.clientId, contractId, competenceMonth, serviceDate, body.description.trim(), body.amountCents, session.agentId],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao registrar serviço" }, { status: 500 });
  return NextResponse.json({ id: row.id });
});

