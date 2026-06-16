import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  legalName: z.string().max(200).nullable().optional(),
  document: z.string().max(80).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  whatsapp: z.string().max(60).nullable().optional(),
  contactName: z.string().max(160).nullable().optional(),
  contactRole: z.string().max(120).nullable().optional(),
  addressLine: z.string().max(200).nullable().optional(),
  addressNumber: z.string().max(40).nullable().optional(),
  neighborhood: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(80).nullable().optional(),
  zipCode: z.string().max(30).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

function normalizeOptional(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

export const PATCH = withApi(async (req: Request, ctx?: { params?: Promise<{ clientId?: string }> }) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdRaw = (await ctx?.params)?.clientId ?? "";
  const clientId = Number.parseInt(clientIdRaw, 10);
  if (!Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch = parsed.data;
  const setParts: string[] = [];
  const values: unknown[] = [];

  const setField = (column: string, value: unknown) => {
    values.push(value);
    setParts.push(`${column} = $${values.length}`);
  };

  if (patch.name !== undefined) setField("name", patch.name.trim());
  if (patch.legalName !== undefined) setField("legal_name", normalizeOptional(patch.legalName));
  if (patch.document !== undefined) setField("document", normalizeOptional(patch.document));
  if (patch.email !== undefined) setField("email", normalizeOptional(patch.email));
  if (patch.phone !== undefined) setField("phone", normalizeOptional(patch.phone));
  if (patch.whatsapp !== undefined) setField("whatsapp", normalizeOptional(patch.whatsapp));
  if (patch.contactName !== undefined) setField("contact_name", normalizeOptional(patch.contactName));
  if (patch.contactRole !== undefined) setField("contact_role", normalizeOptional(patch.contactRole));
  if (patch.addressLine !== undefined) setField("address_line", normalizeOptional(patch.addressLine));
  if (patch.addressNumber !== undefined) setField("address_number", normalizeOptional(patch.addressNumber));
  if (patch.neighborhood !== undefined) setField("neighborhood", normalizeOptional(patch.neighborhood));
  if (patch.city !== undefined) setField("city", normalizeOptional(patch.city));
  if (patch.state !== undefined) setField("state", normalizeOptional(patch.state));
  if (patch.zipCode !== undefined) setField("zip_code", normalizeOptional(patch.zipCode));
  if (patch.notes !== undefined) setField("notes", normalizeOptional(patch.notes));

  if (setParts.length === 0) return NextResponse.json({ error: "No changes" }, { status: 400 });

  values.push(clientId);
  const { rowCount } = await dbQuery(
    `
      update clients
      set ${setParts.join(", ")}
      where id = $${values.length}
    `,
    values,
  );

  if (!rowCount) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
