import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { dueDateForMonth, monthStartIso } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const competenceMonth = (url.searchParams.get("competenceMonth") || monthStartIso()).slice(0, 10);

  const cycleRes = await dbQuery<{ id: string; status: string }>(
    `
      insert into billing_cycles (competence_month, status, executed_by)
      values ($1, 'processing', $2)
      on conflict (competence_month) do update set
        status = 'processing',
        executed_by = excluded.executed_by
      returning id::text, status::text
    `,
    [competenceMonth, session.agentId],
  );
  const cycle = cycleRes.rows[0];
  if (!cycle) return NextResponse.json({ error: "Falha ao iniciar ciclo" }, { status: 500 });

  const contractRes = await dbQuery<{
    id: string;
    client_id: string;
    client_name: string;
    status: string;
    monthly_fee_cents: number;
    due_day: number;
  }>(
    `
      select
        c.id::text,
        c.client_id::text,
        cl.name as client_name,
        c.status::text,
        c.monthly_fee_cents,
        c.due_day
      from client_contracts c
      join clients cl on cl.id = c.client_id
      where c.status = 'active'
      order by cl.name asc, c.id asc
    `,
  );

  let itemsCreated = 0;
  for (const contract of contractRes.rows) {
    const avulsoRes = await dbQuery<{ total_cents: number | null }>(
      `
        select coalesce(sum(amount_cents), 0)::bigint as total_cents
        from extra_services
        where contract_id = $1
          and competence_month = $2
          and status = 'open'
      `,
      [contract.id, competenceMonth],
    );

    const avulsoCents = Number(avulsoRes.rows[0]?.total_cents ?? 0);
    const totalCents = contract.monthly_fee_cents + avulsoCents;
    const dueDate = dueDateForMonth(competenceMonth, contract.due_day);

    const existingItem = await dbQuery<{ id: string }>(
      "select id::text from billing_cycle_items where cycle_id = $1::bigint and contract_id = $2::bigint limit 1",
      [cycle.id, contract.id],
    );
    let itemId = existingItem.rows[0]?.id ?? null;
    if (!itemId) {
      const itemRes = await dbQuery<{ id: string }>(
        `
          insert into billing_cycle_items (
            cycle_id,
            contract_id,
            client_id,
            base_amount_cents,
            avulso_amount_cents,
            total_amount_cents,
            due_date,
            invoice_status,
            boleto_status,
            payment_status,
            email_status,
            whatsapp_status,
            notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', 'open', 'pending', 'pending', $8)
          returning id::text
        `,
        [cycle.id, contract.id, contract.client_id, contract.monthly_fee_cents, avulsoCents, totalCents, dueDate, `Honorário ${contract.client_name} · ${competenceMonth}`],
      );
      itemId = itemRes.rows[0]?.id ?? null;
    } else {
      await dbQuery(
        `
          update billing_cycle_items
          set client_id = $1,
              base_amount_cents = $2,
              avulso_amount_cents = $3,
              total_amount_cents = $4,
              due_date = $5,
              notes = $6
          where id = $7::bigint
        `,
        [contract.client_id, contract.monthly_fee_cents, avulsoCents, totalCents, dueDate, `Honorário ${contract.client_name} · ${competenceMonth}`, itemId],
      );
    }
    if (!itemId) continue;
    itemsCreated += 1;

    const existingEntry = await dbQuery<{ id: string }>(
      "select id::text from financial_entries where billing_cycle_item_id = $1::bigint limit 1",
      [itemId],
    );
    const entryId = existingEntry.rows[0]?.id ?? null;
    if (!entryId) {
      await dbQuery(
        `
          insert into financial_entries (
            contract_id,
            client_id,
            billing_cycle_item_id,
            kind,
            source_type,
            source_label,
            competence_month,
            due_date,
            amount_cents,
            status,
            notes
          )
          values ($1, $2, $3, 'receivable', 'monthly_fee', $4, $5, $6, $7, 'open', $8)
        `,
        [contract.id, contract.client_id, itemId, `Honorário mensal · ${contract.client_name}`, competenceMonth, dueDate, totalCents, `Ciclo ${competenceMonth}`],
      );
    } else {
      await dbQuery(
        `
          update financial_entries
          set contract_id = $1,
              client_id = $2,
              kind = 'receivable',
              source_type = 'monthly_fee',
              source_label = $3,
              competence_month = $4,
              due_date = $5,
              amount_cents = $6,
              status = 'open',
              notes = $7
          where id = $8::bigint
        `,
        [contract.id, contract.client_id, `Honorário mensal · ${contract.client_name}`, competenceMonth, dueDate, totalCents, `Ciclo ${competenceMonth}`, entryId],
      );
    }

    await dbQuery(
      `
        update extra_services
        set status = 'included', billing_cycle_item_id = $2
        where contract_id = $1
          and competence_month = $3
          and status = 'open'
      `,
      [contract.id, itemId, competenceMonth],
    );
  }

  await dbQuery(
    `
      update billing_cycles
      set status = 'completed', executed_at = now()
      where id = $1::bigint
    `,
    [cycle.id],
  );

  return NextResponse.json({ cycleId: cycle.id, itemsCreated, competenceMonth });
});
