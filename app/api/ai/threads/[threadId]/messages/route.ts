import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getAiThread, listAiMessages } from "@/lib/ai-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApi(async (_req: Request, ctx?: { params?: Promise<{ threadId?: string }> }) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threadIdRaw = (await ctx?.params)?.threadId ?? "";
  const threadId = Number.parseInt(threadIdRaw, 10);
  if (!Number.isFinite(threadId)) return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });

  const thread = await getAiThread(session.agentId, threadId);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await listAiMessages(threadId, 120);
  return NextResponse.json({ thread, items });
});
