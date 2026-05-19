import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = withApi(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
