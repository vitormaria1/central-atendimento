import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const upsertSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
  monthlyFeeCents: z.coerce.number().int().min(0),
  dueDay: z.coerce.number().int().min(1).max(28).default(1),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingWhatsapp: z.string().optional().nullable(),
  sendEmail: z.coerce.boolean().default(true),
  sendWhatsapp: z.coerce.boolean().default(true),
  generateInvoice: z.coerce.boolean().default(true),
  generateBoleto: z.coerce.boolean().default(true),
  focusCustomerId: z.string().optional().nullable(),
  focusServiceId: z.string().optional().nullable(),
  interCustomerId: z.string().optional().nullable(),
  interWalletId: z.string().optional().nullable(),
  invoiceServiceCode: z.string().optional().nullable(),
  invoiceServiceDescription: z.string().optional().nullable(),
  invoiceNature: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const limit = parsed.data.limit ?? 30;
  const { rows } = await dbQuery<{
    id: string;
    client_id: string;
    client_name: string;
    status: string;
    monthly_fee_cents: number;
    due_day: number;
    contract_start_date: string | null;
    contract_end_date: string | null;
    billing_email: string | null;
    billing_whatsapp: string | null;
    send_email: boolean;
    send_whatsapp: boolean;
    generate_invoice: boolean;
    generate_boleto: boolean;
    focus_customer_id: string | null;
    focus_service_id: string | null;
    inter_customer_id: string | null;
    inter_wallet_id: string | null;
    invoice_service_code: string | null;
    invoice_service_description: string | null;
    invoice_nature: string | null;
    notes: string | null;
    created_at: string;
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
        c.contract_start_date::text,
        c.contract_end_date::text,
        c.billing_email,
        c.billing_whatsapp,
        c.send_email,
        c.send_whatsapp,
        c.generate_invoice,
        c.generate_boleto,
        c.focus_customer_id,
        c.focus_service_id,
        c.inter_customer_id,
        c.inter_wallet_id,
        c.invoice_service_code,
        c.invoice_service_description,
        c.invoice_nature,
        c.notes,
        c.created_at::text,
        c.updated_at::text
      from client_contracts c
      join clients cl on cl.id = c.client_id
      order by c.updated_at desc, c.id desc
      limit $1
    `,
    [limit],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      status: r.status,
      monthlyFeeCents: r.monthly_fee_cents,
      dueDay: r.due_day,
      contractStartDate: r.contract_start_date,
      contractEndDate: r.contract_end_date,
      billingEmail: r.billing_email,
      billingWhatsapp: r.billing_whatsapp,
      sendEmail: r.send_email,
      sendWhatsapp: r.send_whatsapp,
      generateInvoice: r.generate_invoice,
      generateBoleto: r.generate_boleto,
      focusCustomerId: r.focus_customer_id,
      focusServiceId: r.focus_service_id,
      interCustomerId: r.inter_customer_id,
      interWalletId: r.inter_wallet_id,
      invoiceServiceCode: r.invoice_service_code,
      invoiceServiceDescription: r.invoice_service_description,
      invoiceNature: r.invoice_nature,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;
  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into client_contracts (
        client_id,
        status,
        monthly_fee_cents,
        due_day,
        contract_start_date,
        contract_end_date,
        billing_email,
        billing_whatsapp,
        send_email,
        send_whatsapp,
        generate_invoice,
        generate_boleto,
        focus_customer_id,
        focus_service_id,
        inter_customer_id,
        inter_wallet_id,
        invoice_service_code,
        invoice_service_description,
        invoice_nature,
        notes
      )
      values ($1, $2::contract_status, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      on conflict (client_id) do update set
        status = excluded.status,
        monthly_fee_cents = excluded.monthly_fee_cents,
        due_day = excluded.due_day,
        contract_start_date = excluded.contract_start_date,
        contract_end_date = excluded.contract_end_date,
        billing_email = excluded.billing_email,
        billing_whatsapp = excluded.billing_whatsapp,
        send_email = excluded.send_email,
        send_whatsapp = excluded.send_whatsapp,
        generate_invoice = excluded.generate_invoice,
        generate_boleto = excluded.generate_boleto,
        focus_customer_id = excluded.focus_customer_id,
        focus_service_id = excluded.focus_service_id,
        inter_customer_id = excluded.inter_customer_id,
        inter_wallet_id = excluded.inter_wallet_id,
        invoice_service_code = excluded.invoice_service_code,
        invoice_service_description = excluded.invoice_service_description,
        invoice_nature = excluded.invoice_nature,
        notes = excluded.notes
      returning id::text
    `,
    [
      body.clientId,
      body.status,
      body.monthlyFeeCents,
      body.dueDay,
      body.contractStartDate || null,
      body.contractEndDate || null,
      body.billingEmail || null,
      body.billingWhatsapp || null,
      body.sendEmail,
      body.sendWhatsapp,
      body.generateInvoice,
      body.generateBoleto,
      body.focusCustomerId || null,
      body.focusServiceId || null,
      body.interCustomerId || null,
      body.interWalletId || null,
      body.invoiceServiceCode || null,
      body.invoiceServiceDescription || null,
      body.invoiceNature || null,
      body.notes || null,
    ],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao salvar contrato" }, { status: 500 });
  return NextResponse.json({ id: row.id });
});

