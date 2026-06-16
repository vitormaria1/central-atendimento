import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { createAiThread, listAiThreads } from "@/lib/ai-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  seedPrompt: z.string().max(1000).optional(),
});

export const GET = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await listAiThreads(session.agentId);
  return NextResponse.json({ items });
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const thread = await createAiThread(session.agentId, parsed.data.seedPrompt);
  return NextResponse.json({ thread });
});
