import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { readDocTemplateBySlug } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  slug: z.string().min(1),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const found = await readDocTemplateBySlug(parsed.data.slug);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filename = found.template.filename;
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename=\"${encodeURIComponent(filename)}\"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
});
