import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { listDocTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await listDocTemplates();
  return NextResponse.json({ items });
});

