import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_REQUEST = 5;

function safeFilename(name: string) {
  const base = name.replace(/[^\w.\-() ]+/g, "_").slice(0, 140).trim();
  return base || "arquivo";
}

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/comments/[commentId]/attachments">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await ctx.params;
  const id = Number.parseInt(commentId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const { rows } = await dbQuery<{
    id: string;
    filename: string;
    mimetype: string | null;
    size_bytes: number;
    created_at: string;
  }>(
    `
      select id::text, filename, mimetype, size_bytes, created_at::text
      from task_comment_attachments
      where comment_id = $1
      order by id asc
    `,
    [id],
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mimetype: r.mimetype,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
    })),
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/tasks/comments/[commentId]/attachments">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await ctx.params;
  const id = Number.parseInt(commentId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form-data" }, { status: 400 });

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Nenhum arquivo" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) return NextResponse.json({ error: "Muitos arquivos" }, { status: 400 });

  const created: Array<{ id: string; filename: string; mimetype: string | null; sizeBytes: number }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: `Arquivo muito grande: ${file.name}` }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = safeFilename(file.name);
    const mimetype = file.type || null;
    const sizeBytes = buf.byteLength;

    const { rows } = await dbQuery<{ id: string }>(
      `
        insert into task_comment_attachments (comment_id, filename, mimetype, size_bytes, content)
        values ($1, $2, $3, $4, $5)
        returning id::text
      `,
      [id, filename, mimetype, sizeBytes, buf],
    );
    if (rows[0]?.id) created.push({ id: rows[0].id, filename, mimetype, sizeBytes });
  }

  return NextResponse.json({ items: created });
}

