import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{ id: string; name: string; color: string | null }>(
    "select id, name, color from wa_labels order by name asc",
  );

  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, name: r.name, color: r.color })),
  });
});

