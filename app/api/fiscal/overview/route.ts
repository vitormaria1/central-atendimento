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

  const [contracts, services, cycles, contractMetrics, serviceMetrics, cycleMetrics] = await Promise.all([
    dbQuery<{
      id: string;
      client_id: string;
      client_name: string;
      status: string;
      monthly_fee_cents: number;
      due_day: number;
      billing_email: string | null;
      billing_whatsapp: string | null;
      send_email: boolean;
      send_whatsapp: boolean;
      generate_invoice: boolean;
      generate_boleto: boolean;
      invoice_service_code: string | null;
      invoice_service_description: string | null;
      notes: string | null;
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
          c.send_email,
          c.send_whatsapp,
          c.generate_invoice,
          c.generate_boleto,
          c.invoice_service_code,
          c.invoice_service_description,
          c.notes,
          c.updated_at::text
        from client_contracts c
        join clients cl on cl.id = c.client_id
        order by c.updated_at desc, c.id desc
        limit 30
      `,
    ),
    dbQuery<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      active: boolean;
      municipal_code: string | null;
      cnae: string | null;
      tax_regime: string | null;
      updated_at: string;
    }>(
      `
        select
          id::text,
          code,
          name,
          description,
          active,
          municipal_code,
          cnae,
          tax_regime,
          updated_at::text
        from fiscal_service_catalog
        order by active desc, name asc, id desc
        limit 20
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
    dbQuery<{ active_contracts: number; invoice_ready: number }>(
      `
        select
          count(*) filter (where status = 'active')::int as active_contracts,
          count(*) filter (where status = 'active' and generate_invoice)::int as invoice_ready
        from client_contracts
      `,
    ),
    dbQuery<{ services_active: number }>(
      `
        select count(*) filter (where active)::int as services_active
        from fiscal_service_catalog
      `,
    ),
    dbQuery<{ cycles_pending: number }>(
      `
        select count(*) filter (where status in ('pending', 'processing'))::int as cycles_pending
        from billing_cycles
      `,
    ),
  ]);

  return NextResponse.json({
    metrics: {
      activeContracts: contractMetrics.rows[0]?.active_contracts ?? 0,
      invoiceReady: contractMetrics.rows[0]?.invoice_ready ?? 0,
      cyclesPending: cycleMetrics.rows[0]?.cycles_pending ?? 0,
      servicesActive: serviceMetrics.rows[0]?.services_active ?? 0,
      nextCompetenceMonth: monthStartIso(),
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
      sendEmail: r.send_email,
      sendWhatsapp: r.send_whatsapp,
      generateInvoice: r.generate_invoice,
      generateBoleto: r.generate_boleto,
      invoiceServiceCode: r.invoice_service_code,
      invoiceServiceDescription: r.invoice_service_description,
      notes: r.notes,
      updatedAt: r.updated_at,
    })),
    services: services.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      active: r.active,
      municipalCode: r.municipal_code,
      cnae: r.cnae,
      taxRegime: r.tax_regime,
      updatedAt: r.updated_at,
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
