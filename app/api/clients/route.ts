import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(160),
  legalName: z.string().max(200).optional(),
  document: z.string().max(80).optional(),
  email: z.string().max(160).optional(),
  phone: z.string().max(60).optional(),
  whatsapp: z.string().max(60).optional(),
  contactName: z.string().max(160).optional(),
  contactRole: z.string().max(120).optional(),
  addressLine: z.string().max(200).optional(),
  addressNumber: z.string().max(40).optional(),
  neighborhood: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(80).optional(),
  zipCode: z.string().max(30).optional(),
  municipalRegistration: z.string().max(80).optional(),
  stateRegistration: z.string().max(80).optional(),
  taxRegime: z.string().max(120).optional(),
  fiscalCity: z.string().max(120).optional(),
  fiscalState: z.string().max(80).optional(),
  invoiceEmail: z.string().max(160).optional(),
  serviceCode: z.string().max(80).optional(),
  serviceDescription: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
});

export const GET = withApi(async (req: Request) => {
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
    legal_name: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    contact_name: string | null;
    contact_role: string | null;
    address_line: string | null;
    address_number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    municipal_registration: string | null;
    state_registration: string | null;
    tax_regime: string | null;
    fiscal_city: string | null;
    fiscal_state: string | null;
    invoice_email: string | null;
    service_code: string | null;
    service_description: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    q
      ? `
          select
            id::text,
            name,
            legal_name,
            document,
            email,
            phone,
            whatsapp,
            contact_name,
            contact_role,
            address_line,
            address_number,
            neighborhood,
            city,
            state,
            zip_code,
            municipal_registration,
            state_registration,
            tax_regime,
            fiscal_city,
            fiscal_state,
            invoice_email,
            service_code,
            service_description,
            notes,
            created_at::text,
            updated_at::text
          from clients
          where name ilike $1 or coalesce(legal_name, '') ilike $1 or coalesce(document, '') ilike $1
          order by name asc, id desc
          limit $2
        `
      : `
          select
            id::text,
            name,
            legal_name,
            document,
            email,
            phone,
            whatsapp,
            contact_name,
            contact_role,
            address_line,
            address_number,
            neighborhood,
            city,
            state,
            zip_code,
            municipal_registration,
            state_registration,
            tax_regime,
            fiscal_city,
            fiscal_state,
            invoice_email,
            service_code,
            service_description,
            notes,
            created_at::text,
            updated_at::text
          from clients
          order by updated_at desc, id desc
          limit $1
        `,
    q ? [`%${q}%`, limit] : [limit],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      legalName: r.legal_name,
      document: r.document,
      email: r.email,
      phone: r.phone,
      whatsapp: r.whatsapp,
      contactName: r.contact_name,
      contactRole: r.contact_role,
      addressLine: r.address_line,
      addressNumber: r.address_number,
      neighborhood: r.neighborhood,
      city: r.city,
      state: r.state,
      zipCode: r.zip_code,
      municipalRegistration: r.municipal_registration,
      stateRegistration: r.state_registration,
      taxRegime: r.tax_regime,
      fiscalCity: r.fiscal_city,
      fiscalState: r.fiscal_state,
      invoiceEmail: r.invoice_email,
      serviceCode: r.service_code,
      serviceDescription: r.service_description,
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
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const name = parsed.data.name.trim();
  const legalName = parsed.data.legalName?.trim() || null;
  const document = parsed.data.document?.trim() || null;
  const email = parsed.data.email?.trim() || null;
  const phone = parsed.data.phone?.trim() || null;
  const whatsapp = parsed.data.whatsapp?.trim() || null;
  const contactName = parsed.data.contactName?.trim() || null;
  const contactRole = parsed.data.contactRole?.trim() || null;
  const addressLine = parsed.data.addressLine?.trim() || null;
  const addressNumber = parsed.data.addressNumber?.trim() || null;
  const neighborhood = parsed.data.neighborhood?.trim() || null;
  const city = parsed.data.city?.trim() || null;
  const state = parsed.data.state?.trim() || null;
  const zipCode = parsed.data.zipCode?.trim() || null;
  const municipalRegistration = parsed.data.municipalRegistration?.trim() || null;
  const stateRegistration = parsed.data.stateRegistration?.trim() || null;
  const taxRegime = parsed.data.taxRegime?.trim() || null;
  const fiscalCity = parsed.data.fiscalCity?.trim() || null;
  const fiscalState = parsed.data.fiscalState?.trim() || null;
  const invoiceEmail = parsed.data.invoiceEmail?.trim() || null;
  const serviceCode = parsed.data.serviceCode?.trim() || null;
  const serviceDescription = parsed.data.serviceDescription?.trim() || null;
  const notes = parsed.data.notes?.trim() || null;

  const { rows } = await dbQuery<{ id: string }>(
    `
      insert into clients (
        name,
        legal_name,
        document,
        email,
        phone,
        whatsapp,
        contact_name,
        contact_role,
        address_line,
        address_number,
        neighborhood,
        city,
        state,
        zip_code,
        municipal_registration,
        state_registration,
        tax_regime,
        fiscal_city,
        fiscal_state,
        invoice_email,
        service_code,
        service_description,
        notes
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      returning id::text
    `,
    [
      name,
      legalName,
      document,
      email,
      phone,
      whatsapp,
      contactName,
      contactRole,
      addressLine,
      addressNumber,
      neighborhood,
      city,
      state,
      zipCode,
      municipalRegistration,
      stateRegistration,
      taxRegime,
      fiscalCity,
      fiscalState,
      invoiceEmail,
      serviceCode,
      serviceDescription,
      notes,
    ],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Falha ao criar cliente" }, { status: 500 });

  return NextResponse.json({ id: row.id });
});
