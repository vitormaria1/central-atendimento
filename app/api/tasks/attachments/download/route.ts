import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  id: z.string(),
});

export const GET = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const id = Number.parseInt(parsed.data.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { rows } = await dbQuery<{
    filename: string;
    mimetype: string | null;
    content: Buffer;
    assignee_agent_id: string | null;
  }>(
    `
      select ta.filename, ta.mimetype, ta.content, t.assignee_agent_id
      from task_attachments ta
      join tasks t on t.id = ta.task_id
      where ta.id = $1
      limit 1
    `,
    [id],
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.agentId === "gustavo" && row.assignee_agent_id !== "gustavo") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = row.filename || "arquivo";
  const mimetype = row.mimetype || "application/octet-stream";

  return new Response(new Uint8Array(row.content), {
    headers: {
      "content-type": mimetype,
      "content-disposition": `attachment; filename=\"${encodeURIComponent(filename)}\"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
});
