import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["pendente", "resolvido"]).optional(),
  assignedAgentId: z.enum(["vanderlei", "gustavo"]).nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/chat-state/[chatId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { chatId } = await ctx.params;
  const decodedChatId = decodeURIComponent(chatId);

  const status = parsed.data.status ?? "pendente";
  const assigned = parsed.data.assignedAgentId ?? null;
  const tags = parsed.data.tags ?? [];

  await dbQuery(
    `
      insert into chat_state (chat_id, status, assigned_agent_id, tags)
      values ($1, $2, $3, $4)
      on conflict (chat_id) do update set
        status = excluded.status,
        assigned_agent_id = excluded.assigned_agent_id,
        tags = excluded.tags,
        updated_at = now()
    `,
    [decodedChatId, status, assigned, tags],
  );

  return NextResponse.json({ ok: true });
}
