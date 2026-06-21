import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { createFocusNfse } from "@/lib/focus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  competenceMonth: z.string().min(1),
  amountCents: z.coerce.number().int().min(0).optional(),
  serviceDescription: z.string().min(1).max(1000).optional(),
  itemListaServico: z.string().min(1).max(20).optional(),
  prestadorCnpj: z.string().min(1).max(20),
  prestadorInscricaoMunicipal: z.string().min(1).max(80),
  prestadorCodigoMunicipio: z.coerce.number().int().positive().default(4205704),
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
        coalesce(cc.monthly_fee_cents, 0)::int as monthly_fee_cents
      from clients cl
      left join client_contracts cc on cc.client_id = cl.id
      where cl.id = $1
      limit 1
    `,
    [body.clientId],
  );

  const client = rows[0];
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const amountCents = body.amountCents ?? client.monthly_fee_cents ?? 0;
  const serviceDescription = body.serviceDescription?.trim() || client.service_description || `Serviço de competência ${body.competenceMonth}`;

  const providerResponse = await createFocusNfse({
    prestador: {
      cnpj: body.prestadorCnpj.trim(),
      inscricaoMunicipal: body.prestadorInscricaoMunicipal.trim(),
      codigoMunicipio: body.prestadorCodigoMunicipio,
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
