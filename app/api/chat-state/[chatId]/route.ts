import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["pendente", "resolvido"]).optional(),
  assignedAgentId: z.enum(["vanderlei", "gustavo"]).nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
  presenceStatus: z.enum(["online", "offline", "typing"]).nullable().optional(),
  lastSeenAt: z.union([z.string(), z.number()]).nullable().optional(),
  typingUntilAt: z.union([z.string(), z.number()]).nullable().optional(),
});

function normalizeTimestamp(value: string | number | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      const ms = num < 1_000_000_000_000 ? num * 1000 : num;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const PATCH = withApi(async (req: Request, ctx: RouteContext<"/api/chat-state/[chatId]">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { chatId } = await ctx.params;
  const decodedChatId = decodeURIComponent(chatId);

  const { rows } = await dbQuery<{
    status: "pendente" | "resolvido";
    assigned_agent_id: string | null;
    tags: string[];
    presence_status: string | null;
    last_seen_at: string | null;
    typing_until_at: string | null;
  }>(
    `
      select status, assigned_agent_id, tags, presence_status, last_seen_at, typing_until_at
      from chat_state
      where chat_id = $1
      limit 1
    `,
    [decodedChatId],
  );
  const existing = rows[0] ?? null;

  const hasStatus = Object.prototype.hasOwnProperty.call(parsed.data, "status");
  const hasAssigned = Object.prototype.hasOwnProperty.call(parsed.data, "assignedAgentId");
  const hasTags = Object.prototype.hasOwnProperty.call(parsed.data, "tags");
  const hasPresenceStatus = Object.prototype.hasOwnProperty.call(parsed.data, "presenceStatus");
  const hasLastSeenAt = Object.prototype.hasOwnProperty.call(parsed.data, "lastSeenAt");
  const hasTypingUntilAt = Object.prototype.hasOwnProperty.call(parsed.data, "typingUntilAt");

  const status = hasStatus ? parsed.data.status ?? "pendente" : existing?.status ?? "pendente";
  const assigned = hasAssigned ? parsed.data.assignedAgentId ?? null : existing?.assigned_agent_id ?? null;
  const tags = hasTags ? parsed.data.tags ?? [] : existing?.tags ?? [];
  const presenceStatus = hasPresenceStatus ? parsed.data.presenceStatus ?? null : existing?.presence_status ?? null;
  const lastSeenAt = hasLastSeenAt ? normalizeTimestamp(parsed.data.lastSeenAt) : existing?.last_seen_at ?? null;
  const typingUntilAt = hasTypingUntilAt ? normalizeTimestamp(parsed.data.typingUntilAt) : existing?.typing_until_at ?? null;

  await dbQuery(
    `
      insert into chat_state (chat_id, status, assigned_agent_id, tags, presence_status, last_seen_at, typing_until_at)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (chat_id) do update set
        status = excluded.status,
        assigned_agent_id = excluded.assigned_agent_id,
        tags = excluded.tags,
        presence_status = excluded.presence_status,
        last_seen_at = excluded.last_seen_at,
        typing_until_at = excluded.typing_until_at,
        updated_at = now()
    `,
    [decodedChatId, status, assigned, tags, presenceStatus, lastSeenAt, typingUntilAt],
  );

  return NextResponse.json({ ok: true });
});
