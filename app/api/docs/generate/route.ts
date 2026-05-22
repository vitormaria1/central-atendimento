import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { readDocTemplateBySlug } from "@/lib/templates";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  templateSlug: z.string().min(1),
  data: z.record(z.string(), z.string().max(50_000)),
  filename: z.string().min(1).max(200).optional(),
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const found = await readDocTemplateBySlug(parsed.data.templateSlug);
  if (!found) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Docxtemplater expects a binary string
  const bin = found.bytes.toString("binary");
  const zip = new PizZip(bin);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  doc.render(parsed.data.data);
  const buffer = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;

  const baseName = parsed.data.filename?.trim() || found.template.filename.replace(/\.docx$/i, "") + " - GERADO";
  const filename = baseName.toLowerCase().endsWith(".docx") ? baseName : `${baseName}.docx`;

  return NextResponse.json({
    filename,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: buffer.toString("base64"),
    template: { slug: found.template.slug, name: found.template.name },
    createdBy: session.agentId,
  });
});

