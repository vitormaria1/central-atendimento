import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { downloadMessage } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async (_req: Request, ctx: RouteContext<"/api/messages/[messageId]/download">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await ctx.params;
  const id = decodeURIComponent(messageId);
  try {
    const data = await downloadMessage({ id, return_link: true, return_base64: false });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to download media", details: message }, { status: 502 });
  }
});
