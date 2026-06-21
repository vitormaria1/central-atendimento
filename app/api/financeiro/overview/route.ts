import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { monthStartIso } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [contracts, entries, services, cycles, metrics] = await Promise.all([
    dbQuery<{
      id: string;
      client_id: string;
      client_name: string;
      status: string;
      monthly_fee_cents: number;
      due_day: number;
      billing_email: string | null;
      billing_whatsapp: string | null;
      generate_invoice: boolean;
      generate_boleto: boolean;
      send_email: boolean;
      send_whatsapp: boolean;
      updated_at: string;
    }>(
      `
        select
          c.id::text,
          c.client_id::text,
          cl.name as client_name,
          c.status::text,
          c.monthly_fee_cents,
          c.due_day,
          c.billing_email,
          c.billing_whatsapp,
          c.generate_invoice,
          c.generate_boleto,
          c.send_email,
          c.send_whatsapp,
          c.updated_at::text
        from client_contracts c
        join clients cl on cl.id = c.client_id
        order by c.updated_at desc, c.id desc
        limit 30
      `,
    ),
    dbQuery<{
      id: string;
      client_id: string | null;
      client_name: string | null;
      kind: string;
      source_type: string;
      source_label: string;
      competence_month: string | null;
      due_date: string | null;
      amount_cents: number;
      status: string;
      paid_at: string | null;
      notes: string | null;
      created_at: string;
    }>(
      `
        select
          fe.id::text,
          fe.client_id::text,
          cl.name as client_name,
          fe.kind::text,
          fe.source_type::text,
          fe.source_label,
          fe.competence_month::text,
          fe.due_date::text,
          fe.amount_cents,
          fe.status::text,
          fe.paid_at::text,
          fe.notes,
          fe.created_at::text
        from financial_entries fe
        left join clients cl on cl.id = fe.client_id
        order by fe.created_at desc, fe.id desc
        limit 40
      `,
    ),
    dbQuery<{
      id: string;
      client_id: string;
      client_name: string;
      description: string;
      amount_cents: number;
      status: string;
      competence_month: string;
      service_date: string;
      created_at: string;
    }>(
      `
        select
          es.id::text,
          es.client_id::text,
          cl.name as client_name,
          es.description,
          es.amount_cents,
          es.status,
          es.competence_month::text,
          es.service_date::text,
          es.created_at::text
        from extra_services es
        join clients cl on cl.id = es.client_id
        order by es.created_at desc, es.id desc
        limit 30
      `,
    ),
    dbQuery<{
      id: string;
      competence_month: string;
      status: string;
      executed_at: string | null;
      item_count: number;
      total_cents: number | null;
    }>(
      `
        select
          bc.id::text,
          bc.competence_month::text,
          bc.status::text,
          bc.executed_at::text,
          count(bci.id)::int as item_count,
          coalesce(sum(bci.total_amount_cents), 0)::bigint as total_cents
        from billing_cycles bc
        left join billing_cycle_items bci on bci.cycle_id = bc.id
        group by bc.id
        order by bc.competence_month desc, bc.id desc
        limit 12
      `,
    ),
    dbQuery<{
      open_receivables: number;
      overdue_receivables: number;
      paid_this_month: number;
      open_avulsos: number;
      total_open_cents: number;
    }>(
      `
        select
          count(*) filter (where kind = 'receivable' and status = 'open')::int as open_receivables,
          count(*) filter (where kind = 'receivable' and status = 'overdue')::int as overdue_receivables,
          coalesce(sum(amount_cents) filter (where kind = 'receivable' and status = 'paid' and date_trunc('month', paid_at) = date_trunc('month', now())), 0)::bigint as paid_this_month,
          count(*) filter (where source_type = 'extra_service' and status = 'open')::int as open_avulsos,
          coalesce(sum(amount_cents) filter (where status in ('open', 'overdue')), 0)::bigint as total_open_cents
        from financial_entries
      `,
    ),
  ]);

  return NextResponse.json({
    metrics: {
      openReceivables: metrics.rows[0]?.open_receivables ?? 0,
      overdueReceivables: metrics.rows[0]?.overdue_receivables ?? 0,
      paidThisMonthCents: Number(metrics.rows[0]?.paid_this_month ?? 0),
      openAvulsos: metrics.rows[0]?.open_avulsos ?? 0,
      totalOpenCents: Number(metrics.rows[0]?.total_open_cents ?? 0),
      currentCompetenceMonth: monthStartIso(),
    },
    contracts: contracts.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      status: r.status,
      monthlyFeeCents: r.monthly_fee_cents,
      dueDay: r.due_day,
      billingEmail: r.billing_email,
      billingWhatsapp: r.billing_whatsapp,
      generateInvoice: r.generate_invoice,
      generateBoleto: r.generate_boleto,
      sendEmail: r.send_email,
      sendWhatsapp: r.send_whatsapp,
      updatedAt: r.updated_at,
    })),
    entries: entries.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      kind: r.kind,
      sourceType: r.source_type,
      sourceLabel: r.source_label,
      competenceMonth: r.competence_month,
      dueDate: r.due_date,
      amountCents: r.amount_cents,
      status: r.status,
      paidAt: r.paid_at,
      notes: r.notes,
      createdAt: r.created_at,
    })),
    extraServices: services.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      description: r.description,
      amountCents: r.amount_cents,
      status: r.status,
      competenceMonth: r.competence_month,
      serviceDate: r.service_date,
      createdAt: r.created_at,
    })),
    cycles: cycles.rows.map((r) => ({
      id: r.id,
      competenceMonth: r.competence_month,
      status: r.status,
      executedAt: r.executed_at,
      itemCount: r.item_count,
      totalCents: Number(r.total_cents ?? 0),
    })),
  });
});

