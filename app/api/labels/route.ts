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

  // Alguns provedores podem gerar labels duplicadas (mesmo nome) com ids diferentes.
  // Para UI de seleção, deduplicamos por nome (case-insensitive).
  const byName = new Map<string, { id: string; name: string; color: string | null }>();
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { id: r.id, name, color: r.color });
  }

  return NextResponse.json({
    items: Array.from(byName.values()).map((r) => ({ id: r.id, name: r.name, color: r.color })),
  });
});
