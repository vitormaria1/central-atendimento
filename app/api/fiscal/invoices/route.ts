import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { createFocusNfse } from "@/lib/focus";
import { OFFICE } from "@/lib/office";
import { monthStartIso } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  competenceMonth: z.string().min(1),
  amountCents: z.coerce.number().int().min(0).optional(),
  serviceDescription: z.string().min(1).max(1000).optional(),
  itemListaServico: z.string().min(1).max(20).optional(),
  tomadorNome: z.string().min(1).max(160).optional(),
  tomadorDocumento: z.string().max(80).optional(),
  tomadorEmail: z.string().email().optional().nullable(),
  tomadorTelefone: z.string().max(60).optional().nullable(),
  tomadorLogradouro: z.string().max(200).optional(),
  tomadorNumero: z.string().max(40).optional(),
  tomadorComplemento: z.string().max(120).optional().nullable(),
  tomadorBairro: z.string().max(120).optional(),
  tomadorCidade: z.string().max(120).optional(),
  tomadorUf: z.string().max(2).optional(),
  tomadorCep: z.string().max(20).optional(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function buildMissingRequirements(input: {
  document: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  invoiceEmail: string | null;
  serviceCode: string | null;
  contractStatus: string | null;
  generateInvoice: boolean | null;
}) {
  const missing: string[] = [];
  if (!input.document) missing.push("documento do cliente");
  if (!input.fiscalCity || !input.fiscalState) missing.push("município fiscal");
  if (!input.invoiceEmail) missing.push("e-mail de emissão");
  if (!input.serviceCode) missing.push("código do serviço");
  if (input.contractStatus !== "active") missing.push("contrato ativo");
  if (!input.generateInvoice) missing.push("emissão habilitada no contrato");
  return missing;
}

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const limit = parsed.data.limit ?? 30;

  const [items, metrics] = await Promise.all([
    dbQuery<{
      id: string;
      competence_month: string | null;
      due_date: string | null;
      amount_cents: number;
      invoice_status: string;
      boleto_status: string;
      payment_status: string;
      email_status: string;
      whatsapp_status: string;
      focus_invoice_id: string | null;
      focus_invoice_number: string | null;
      focus_invoice_url: string | null;
      boleto_url: string | null;
      boleto_barcode: string | null;
      source_label: string;
      notes: string | null;
      client_name: string;
      updated_at: string;
    }>(
      `
        select
          bci.id::text,
          bci.due_date::text,
          bci.total_amount_cents as amount_cents,
          bci.invoice_status::text,
          bci.boleto_status::text,
          bci.payment_status::text,
          bci.email_status::text,
          bci.whatsapp_status::text,
          bci.focus_invoice_id,
          bci.focus_invoice_number,
          bci.focus_invoice_url,
          bci.boleto_url,
          bci.boleto_barcode,
          coalesce(bci.notes, fe.source_label) as source_label,
          fe.notes,
          cl.name as client_name,
          bc.competence_month::text,
          greatest(bci.updated_at, fe.updated_at, bc.updated_at)::text as updated_at
        from billing_cycle_items bci
        join billing_cycles bc on bc.id = bci.cycle_id
        join financial_entries fe on fe.billing_cycle_item_id = bci.id
        join clients cl on cl.id = bci.client_id
        order by greatest(bci.updated_at, fe.updated_at, bc.updated_at) desc, bci.id desc
        limit $1
      `,
      [limit],
    ),
    dbQuery<{
      ready: number;
      issued: number;
      failed: number;
      paid: number;
    }>(
      `
        select
          count(*) filter (where invoice_status = 'pending' and payment_status = 'open')::int as ready,
          count(*) filter (where invoice_status = 'issued')::int as issued,
          count(*) filter (where invoice_status = 'failed')::int as failed,
          count(*) filter (where payment_status = 'paid')::int as paid
        from billing_cycle_items
      `,
    ),
  ]);

  return NextResponse.json({
    metrics: {
      ready: metrics.rows[0]?.ready ?? 0,
      issued: metrics.rows[0]?.issued ?? 0,
      failed: metrics.rows[0]?.failed ?? 0,
      paid: metrics.rows[0]?.paid ?? 0,
      competenceMonth: monthStartIso(),
    },
    items: items.rows.map((row) => ({
      id: row.id,
      competenceMonth: row.competence_month,
      dueDate: row.due_date,
      amountCents: row.amount_cents,
      invoiceStatus: row.invoice_status,
      boletoStatus: row.boleto_status,
      paymentStatus: row.payment_status,
      emailStatus: row.email_status,
      whatsappStatus: row.whatsapp_status,
      focusInvoiceId: row.focus_invoice_id,
      focusInvoiceNumber: row.focus_invoice_number,
      focusInvoiceUrl: row.focus_invoice_url,
      boletoUrl: row.boleto_url,
      boletoBarcode: row.boleto_barcode,
      sourceLabel: row.source_label,
      notes: row.notes,
      clientName: row.client_name,
      updatedAt: row.updated_at,
    })),
  });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;

  const { rows } = await dbQuery<{
    client_name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address_line: string | null;
    address_number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    service_description: string | null;
    service_code: string | null;
    monthly_fee_cents: number | null;
    contract_status: string | null;
    contract_generate_invoice: boolean | null;
    contract_invoice_service_code: string | null;
    contract_invoice_service_description: string | null;
  }>(
    `
      select
        cl.name as client_name,
        cl.document,
        cl.invoice_email as email,
        cl.phone,
        cl.address_line,
        cl.address_number,
        cl.neighborhood,
        cl.city,
        cl.state,
        cl.zip_code,
        cl.service_description,
        cl.service_code,
        coalesce(cc.monthly_fee_cents, 0)::int as monthly_fee_cents,
        cc.status::text as contract_status,
        cc.generate_invoice as contract_generate_invoice,
        cc.invoice_service_code as contract_invoice_service_code,
        cc.invoice_service_description as contract_invoice_service_description
      from clients cl
      left join client_contracts cc on cc.client_id = cl.id
      where cl.id = $1
      limit 1
    `,
    [body.clientId],
  );

  const client = rows[0];
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const missingRequirements = buildMissingRequirements({
    document: client.document,
    fiscalCity: client.city,
    fiscalState: client.state,
    invoiceEmail: client.email,
    serviceCode: client.contract_invoice_service_code ?? client.service_code,
    contractStatus: client.contract_status,
    generateInvoice: client.contract_generate_invoice,
  });
  if (missingRequirements.length) {
    return NextResponse.json(
      {
        error: "Cadastro fiscal incompleto",
        missingRequirements,
      },
      { status: 422 },
    );
  }

  const amountCents = body.amountCents ?? client.monthly_fee_cents ?? 0;
  const serviceDescription =
    body.serviceDescription?.trim() ||
    client.contract_invoice_service_description ||
    client.service_description ||
    `Serviço de competência ${body.competenceMonth}`;

  const providerResponse = await createFocusNfse({
    prestador: {
      cnpj: OFFICE.cnpj,
      inscricaoMunicipal: OFFICE.municipalRegistration,
      codigoMunicipio: OFFICE.ibgeCityCode,
    },
    tomador: {
      nome: (body.tomadorNome?.trim() || client.client_name).trim(),
      documento: body.tomadorDocumento?.trim() || client.document || "",
      email: body.tomadorEmail ?? client.email,
      telefone: body.tomadorTelefone ?? client.phone,
      endereco: {
        logradouro: body.tomadorLogradouro?.trim() || client.address_line || "",
        numero: body.tomadorNumero?.trim() || client.address_number || "",
        complemento: body.tomadorComplemento ?? null,
        bairro: body.tomadorBairro?.trim() || client.neighborhood || "",
        codigoMunicipio: 4205704,
        uf: (body.tomadorUf?.trim() || client.state || "SC").toUpperCase(),
        cep: body.tomadorCep?.trim() || client.zip_code || "",
      },
    },
    servico: {
      discriminacao: serviceDescription,
      valorServicosCents: amountCents,
      itemListaServico: body.itemListaServico?.trim() || client.service_code || "4.12",
      aliquota: null,
      issRetido: false,
    },
    dataEmissao: body.competenceMonth,
  });

  return NextResponse.json({
    ok: true,
    providerResponse,
  });
});
